/** Gate 7 from decisions #40 + #41: the SMB ceiling. Hard, SMB-only, not user-tunable.
 *
 * Rule (from #41): on an SMB workspace (mode === "smb", i.e. zero Reviewers) any bill whose
 * `total` exceeds 10,000 in `workspace.baseCurrency` fires a hard gate. The ceiling is baked
 * into the seed — SMB workspaces have no config row for it, so the shipped value is the value.
 * The moment a Reviewer is added the workspace flips to firm and every open smb-ceiling gate
 * resolves with `workspace_added_reviewer`; if the last Reviewer leaves, the firm → smb flip
 * runs the retroactive reeval sweep below over every open bill.
 *
 * Conditional registration lives at the run boundary, not the registry: because
 * `lib/gates/index.ts` registers the runner process-wide, the `run()` body itself calls
 * `getWorkspaceMode(ctx.workspaceId)` and silent-passes when mode === "firm". That way
 * "registered only when zero Reviewers" is expressed once, at the boundary where the mode
 * can actually change, rather than by wiring the barrel to a per-request registry — same
 * shape confidence-band uses for its per-workspace bands.
 *
 * FX: v1 does not convert. If the bill's snapshot pins a currency other than the workspace
 * base, we `console.warn` and silent-pass (matching the deliberate one-signal shape of
 * confidence-band / supplier-trust — "cross-currency comparison is a different gate's job").
 * A missing snapshot `currency` field is assumed to be in the workspace base, same convention
 * the sibling gates use.
 *
 * Override: SMB workspaces have exactly one signer of record (the sole owner). The audit
 * payload for a `gate.overridden` on this gate type therefore stamps
 * `actorRole: "signer_of_record"` so the audit trail is unambiguous about who cleared it
 * even years later, when a workspace may have grown a whole review structure.
 *
 * Payload shape: `{ ceiling: 10000, currency, total }`. */

import { prisma } from "@/lib/db"
import { writeAuditEvent, AuditEventType } from "@/lib/audit"
import { resolveGate } from "@/lib/gates/actions"
import { getWorkspaceMode, type WorkspaceMode } from "@/models/workspaces"
import { getCompanyCurrency } from "@/models/company-currency"
import type { GateContext, GateRunner, GateVerdict } from "./types"
import type { Prisma, PrismaClient, Document } from "@/prisma/client"

type PrismaLike = PrismaClient | Prisma.TransactionClient

export const SMB_CEILING_GATE_TYPE = "smb-ceiling"

/** Baked into the seed per #41. Not read from `WorkspaceAutomationConfig` — SMB workspaces
 * intentionally have no config row for the ceiling, and firm workspaces don't fire the gate
 * at all. Exported so the exception UI can render the number without re-declaring it. */
export const SMB_CEILING_AMOUNT = 10_000

export type SmbCeilingDeps = {
  getMode(workspaceId: string): Promise<WorkspaceMode>
}

type FieldSnapshot = Record<string, unknown>

function readSnapshot(document: GateContext["document"]): FieldSnapshot {
  const snapshot = document.fieldSnapshot
  return snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
    ? (snapshot as FieldSnapshot)
    : {}
}

function readNumber(snapshot: FieldSnapshot, key: string): number | null {
  const value = snapshot[key]
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[,\s]/g, ""))
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function readString(snapshot: FieldSnapshot, key: string): string | null {
  const value = snapshot[key]
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed
}

export function createSmbCeilingGateRunner(deps: SmbCeilingDeps): GateRunner {
  return {
    gateType: SMB_CEILING_GATE_TYPE,
    async run(ctx): Promise<GateVerdict> {
      if (ctx.document.docType !== "invoice") return { blocked: false }

      const snapshot = readSnapshot(ctx.document)
      const total = readNumber(snapshot, "total")
      // Without a total we have nothing to compare against — same silent-pass shape every
      // other total-driven gate uses. The extraction pipeline is expected to fill it; if it
      // never does, that's confidence-band's problem to raise, not this one's.
      if (total === null) return { blocked: false }

      // Self-gate: registered process-wide, but only fires on SMB. This is what makes
      // "registered only when zero Reviewers" true even though the registry is a
      // module-level singleton — see the header note.
      const mode = await deps.getMode(ctx.workspaceId)
      if (mode !== "smb") return { blocked: false }

      const baseCurrency = ctx.baseCurrency

      // v1 does not convert currencies. A bill that pins a foreign currency is silent-passed
      // with a warn — the alternative (compare foreign-denominated totals to a base-currency
      // ceiling) is exactly the FX confusion the ticket says to defer.
      const docCurrency = readString(snapshot, "currency")
      if (docCurrency && docCurrency.toUpperCase() !== baseCurrency.toUpperCase()) {
        console.warn(
          `[smb-ceiling] skipping document ${ctx.documentId}: currency ${docCurrency} does not match workspace base ${baseCurrency}; FX not applied in v1`,
        )
        return { blocked: false }
      }

      if (Math.abs(total) <= SMB_CEILING_AMOUNT) return { blocked: false }

      return {
        blocked: true,
        severity: "hard",
        payload: {
          ceiling: SMB_CEILING_AMOUNT,
          currency: baseCurrency,
          total,
        },
      }
    },
  }
}


/** The runner registered into gateRegistry. */
export const smbCeilingGateRunner: GateRunner = createSmbCeilingGateRunner({
  getMode: (workspaceId) => getWorkspaceMode(workspaceId),
})

/** Called when the first Reviewer is added (mode flip smb → firm). Every open smb-ceiling
 * gate in the workspace resolves with the given reason ("workspace_added_reviewer"). Skips
 * overridden rows — an override is an intentional human decision, same policy as the sibling
 * gates' retroactive sweeps.
 *
 * `resolveGate` handles the state write + `gate.resolved` audit row, so this only owns the
 * "find open, walk, resolve" loop. */
export async function resolveOpenSmbCeilingGatesForWorkspace(
  workspaceId: string,
  reason: "workspace_added_reviewer",
  client: PrismaLike = prisma,
): Promise<{ resolved: number }> {
  const rows = await client.gate.findMany({
    where: { workspaceId, gateType: SMB_CEILING_GATE_TYPE, state: "blocked" },
    select: { id: true },
  })
  for (const row of rows) {
    await resolveGate({ gateId: row.id, actorId: null, reason }, client)
  }
  return { resolved: rows.length }
}

/** Called when the last Reviewer leaves (mode flip firm → smb). Walks every open,
 * non-archived Bill in the workspace and re-fires the gate against each — bills that now sit
 * above the ceiling get a fresh smb-ceiling gate row upserted directly, without going through
 * the arrival hook. Overridden gates are left alone.
 *
 * Same shape as `reevaluateOpenConfidenceBandGates` but inverted: confidence-band walks the
 * blocked gates because a config change can only tighten or loosen an existing finding; here
 * the config change is the mode flip itself, so there are no prior smb-ceiling rows to walk
 * — we sweep documents, not gates. */
export async function reevaluateOpenSmbCeilingGatesForWorkspace(
  workspaceId: string,
  client: PrismaLike = prisma,
): Promise<{ blocked: number }> {
  const bills = await client.document.findMany({
    where: { workspaceId, docType: "invoice", archivedAt: null },
    select: {
      id: true,
      workspaceId: true,
      docType: true,
      fieldSnapshot: true,
      receivedAt: true,
    },
  })
  if (bills.length === 0) return { blocked: 0 }
  const baseCurrency = await getCompanyCurrency(workspaceId, client)

  let blocked = 0
  for (const bill of bills) {
    // Skip if there's already an overridden gate on this document — a re-fire would overwrite
    // the human decision (see registry.upsertGate: any upsert resets state to "blocked").
    const existing = await client.gate.findUnique({
      where: {
        documentId_gateType: { documentId: bill.id, gateType: SMB_CEILING_GATE_TYPE },
      },
      select: { id: true, state: true },
    })
    if (existing && existing.state === "overridden") continue

    const verdict = await smbCeilingGateRunner.run({
      workspaceId,
      documentId: bill.id,
      document: bill as GateContext["document"],
      baseCurrency,
    })
    if (!verdict.blocked) continue

    const row = await client.gate.upsert({
      where: {
        documentId_gateType: { documentId: bill.id, gateType: SMB_CEILING_GATE_TYPE },
      },
      create: {
        workspaceId,
        documentId: bill.id,
        gateType: SMB_CEILING_GATE_TYPE,
        severity: verdict.severity,
        state: "blocked",
        payload: (verdict.payload ?? null) as Prisma.InputJsonValue,
      },
      update: {
        severity: verdict.severity,
        state: "blocked",
        firedAt: new Date(),
        resolvedAt: null,
        resolvedBy: null,
        overrideReason: null,
        payload: (verdict.payload ?? null) as Prisma.InputJsonValue,
      },
    })
    await writeAuditEvent(
      {
        workspaceId,
        actorId: null,
        type: AuditEventType.GATE_BLOCKED,
        subjectType: "gate",
        subjectId: row.id,
        payload: {
          gateType: SMB_CEILING_GATE_TYPE,
          documentId: bill.id,
          severity: verdict.severity,
          ...(verdict.payload ?? {}),
          reason: "workspace_removed_last_reviewer",
        },
      },
      client,
    )
    blocked += 1
  }
  return { blocked }
}

// The runner is wired into `gateRegistry` from the barrel (`lib/gates/index.ts`), not here
// — same discipline every other gate module keeps. Exporting `smbCeilingGateRunner` is
// enough; the barrel is the one wiring point that callers can't bypass via import order.
