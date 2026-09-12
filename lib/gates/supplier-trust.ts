/** Gate 4/6 from decision #40: supplier trust. Soft, workspace-tunable.
 *
 * Rule (from #40 + #54): a bill from an *unverified* supplier whose total exceeds the
 * workspace threshold fires a soft gate. Newcomer suppliers start unverified; the
 * workspace admin's confirm step stamps `Supplier.verifiedAt` + `verifiedById`, after
 * which the gate stops firing on that supplier's bills. Bills below the threshold pass
 * silently even for unverified suppliers — the ticket's "reject-newcomer" is a threshold,
 * not a floor of zero.
 *
 * A missing supplier row (the extracted vendor doesn't match any known supplier in the
 * workspace) is treated as *unverified*, not silently passed: that is exactly the
 * newcomer-first-bill case #40 is about. The rule only bails out on shapes it cannot
 * reason about at all (no vendor extracted, no total extracted, non-invoice document).
 *
 * Testability: the runner takes `findSupplier` + `getThreshold` as deps, so tests build
 * their own supplier + threshold shapes without mocking Prisma. Default export wires the
 * real (workspaceId, normalizedKey) supplier lookup + WorkspaceAutomationConfig read.
 *
 * Payload shape: `{ supplierName, supplierId?, threshold, invoiceTotal, currency }`.
 * `supplierId` is present only when the extracted vendor already resolved to a Supplier
 * row; a first-bill newcomer never has one yet, and the exception UI should key on
 * `supplierName` in that case. `currency` reports the currency the threshold was compared
 * in (workspace base, unless the setting pins one). */

import { prisma } from "@/lib/db"
import { normalizeSupplierName } from "@/lib/suppliers/normalize"
import { resolveGate } from "@/lib/gates/actions"
import type { GateContext, GateRunner, GateVerdict } from "./types"
import type { Prisma, PrismaClient, Gate, Document } from "@/prisma/client"

type PrismaLike = PrismaClient | Prisma.TransactionClient

export const SUPPLIER_TRUST_GATE_TYPE = "supplier-trust"

type FieldSnapshot = Record<string, unknown>

function readSnapshot(document: GateContext["document"]): FieldSnapshot {
  const snapshot = document.fieldSnapshot
  return snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
    ? (snapshot as FieldSnapshot)
    : {}
}

function readString(snapshot: FieldSnapshot, key: string): string | null {
  const value = snapshot[key]
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed
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

/** Minimum supplier shape the rule reads. `null` means "no matching row exists" — treated
 * as unverified newcomer, not a silent pass. */
export type TrustSupplier =
  | { id: string; verifiedAt: Date | null }
  | null

/** Threshold as stored in WorkspaceAutomationConfig.supplierTrustThreshold. `currency` is
 * optional so a workspace can switch its base currency without a JSON re-save (see #53's
 * matchTolerance for the same shape). */
export type SupplierTrustThreshold = {
  amount: number
  currency?: string
}

export type SupplierTrustDeps = {
  findSupplier(input: {
    workspaceId: string
    normalizedKey: string
  }): Promise<TrustSupplier>
  getThreshold(workspaceId: string, baseCurrency: string): Promise<SupplierTrustThreshold>
}

/** Coerce a raw JSON value into a well-formed threshold. A missing / malformed row falls
 * back to the seed shape rather than throwing — a workspace whose config predates this
 * column keeps arriving bills flowing. */
export function coerceSupplierTrustThreshold(raw: unknown): SupplierTrustThreshold {
  const seed: SupplierTrustThreshold = { amount: 500 }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return seed
  const row = raw as Record<string, unknown>
  const amount = typeof row.amount === "number" && Number.isFinite(row.amount) && row.amount >= 0
    ? row.amount
    : seed.amount
  const currencyRaw = row.currency
  const currency =
    typeof currencyRaw === "string" && currencyRaw.length === 3 ? currencyRaw : undefined
  return currency ? { amount, currency } : { amount }
}

export function createSupplierTrustGateRunner(deps: SupplierTrustDeps): GateRunner {
  return {
    gateType: SUPPLIER_TRUST_GATE_TYPE,
    async run(ctx): Promise<GateVerdict> {
      if (ctx.document.docType !== "invoice") return { blocked: false }

      const snapshot = readSnapshot(ctx.document)
      const vendor = readString(snapshot, "vendor")
      const normalizedKey = normalizeSupplierName(vendor)
      // No vendor name = nothing to anchor "which supplier" on. The duplicate + jurisdiction
      // gates already refuse to run without one; matching this keeps the queue coherent.
      if (!normalizedKey) return { blocked: false }

      const invoiceTotal = readNumber(snapshot, "total")
      // Without a total we can't compare against the threshold — silently pass. The
      // extraction pipeline is expected to fill total; if it never does, that's the
      // confidence-band gate's problem, not this one.
      if (invoiceTotal === null) return { blocked: false }

      const baseCurrency =
        (ctx.document as Partial<Document> & { baseCurrency?: string | null }).baseCurrency ??
        "USD"
      const threshold = await deps.getThreshold(ctx.workspaceId, baseCurrency)
      const supplier = await deps.findSupplier({ workspaceId: ctx.workspaceId, normalizedKey })

      // A row that carries a `verifiedAt` timestamp is trusted — the workspace admin has
      // confirmed it at least once, per the #40 contract.
      const verified = supplier != null && supplier.verifiedAt != null
      if (verified) return { blocked: false }

      // Unverified: fires ONLY when the bill total is above the threshold. Below-threshold
      // bills from newcomers still flow, so a workspace that only ever buys ≤ R500 from
      // ad-hoc suppliers never sees this gate at all.
      if (invoiceTotal <= threshold.amount) return { blocked: false }

      return {
        blocked: true,
        severity: "soft",
        payload: {
          supplierName: vendor,
          normalizedKey,
          ...(supplier ? { supplierId: supplier.id } : {}),
          threshold: threshold.amount,
          currency: threshold.currency ?? baseCurrency,
          invoiceTotal,
        },
      }
    },
  }
}

async function findSupplierInDb(
  input: { workspaceId: string; normalizedKey: string },
  client: PrismaLike = prisma,
): Promise<TrustSupplier> {
  return client.supplier.findUnique({
    where: {
      workspaceId_normalizedKey: {
        workspaceId: input.workspaceId,
        normalizedKey: input.normalizedKey,
      },
    },
    select: { id: true, verifiedAt: true },
  })
}

async function getWorkspaceTrustThreshold(
  workspaceId: string,
  _baseCurrency: string,
  client: PrismaLike = prisma,
): Promise<SupplierTrustThreshold> {
  const config = await client.workspaceAutomationConfig.findUnique({
    where: { workspaceId },
    select: { supplierTrustThreshold: true },
  })
  return coerceSupplierTrustThreshold(config?.supplierTrustThreshold ?? null)
}

/** The runner registered into gateRegistry. */
export const supplierTrustGateRunner: GateRunner = createSupplierTrustGateRunner({
  findSupplier: (input) => findSupplierInDb(input),
  getThreshold: (workspaceId, baseCurrency) =>
    getWorkspaceTrustThreshold(workspaceId, baseCurrency),
})

/** DoD: "Verifying the supplier resolves all their open supplier-trust exceptions with
 * `gate.resolved` events." Callable from the verify server action (inline chip verify or
 * bulk-verify from settings). Sets `verifiedAt` + `verifiedById` and walks every
 * blocked supplier-trust gate whose document normalizes to the supplier's `normalizedKey`,
 * resolving each through the shared `resolveGate` helper (which handles the audit event).
 *
 * Overridden gates are left alone — an override is an intentional human decision that a
 * later verify shouldn't silently rewrite (same policy as #53's re-eval). */
export async function verifySupplier(
  input: { supplierId: string; actorId: string },
  client: PrismaLike = prisma,
): Promise<{ resolvedGateCount: number }> {
  const supplier = await client.supplier.findUnique({
    where: { id: input.supplierId },
    select: { id: true, workspaceId: true, normalizedKey: true, verifiedAt: true },
  })
  if (!supplier) throw new Error(`Supplier ${input.supplierId} not found`)

  // Idempotent: a second verify call by a different admin refreshes the actor + timestamp
  // rather than silently no-op'ing (the newer stamp is the more informative record).
  await client.supplier.update({
    where: { id: input.supplierId },
    data: { verifiedAt: new Date(), verifiedById: input.actorId },
  })

  return resolveOpenSupplierTrustGatesForSupplier(
    { workspaceId: supplier.workspaceId, normalizedKey: supplier.normalizedKey, actorId: input.actorId },
    client,
  )
}

/** Walk every blocked supplier-trust gate on a workspace whose document normalizes to the
 * given supplier key, resolving each. Split out of `verifySupplier` so the workspace-wide
 * sweep after a threshold change (see `reevaluateOpenSupplierTrustGates`) can share the
 * same per-document logic. */
export async function resolveOpenSupplierTrustGatesForSupplier(
  input: { workspaceId: string; normalizedKey: string; actorId?: string | null },
  client: PrismaLike = prisma,
): Promise<{ resolvedGateCount: number }> {
  const rows = await client.gate.findMany({
    where: {
      workspaceId: input.workspaceId,
      gateType: SUPPLIER_TRUST_GATE_TYPE,
      state: "blocked",
    },
    select: { id: true, payload: true },
  })
  let resolved = 0
  for (const row of rows) {
    const payload = row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
      ? (row.payload as Record<string, unknown>)
      : {}
    if (payload.normalizedKey !== input.normalizedKey) continue
    await resolveGate(
      { gateId: row.id, actorId: input.actorId ?? null, reason: "supplier verified" },
      client,
    )
    resolved += 1
  }
  return { resolvedGateCount: resolved }
}

/** Re-run the gate for one document, auto-resolving an open gate whose bill now sits at or
 * under the new threshold (or whose supplier now shows as verified). Refreshes the payload
 * when still blocking. Overridden gates are skipped. Same hook shape as #53's
 * `reevaluateMatchVarianceForDocument`. */
export async function reevaluateSupplierTrustForDocument(
  input: { workspaceId: string; documentId: string },
  client: PrismaLike = prisma,
): Promise<{ outcome: "resolved" | "still-blocking" | "no-op" }> {
  const gate = await client.gate.findUnique({
    where: {
      documentId_gateType: { documentId: input.documentId, gateType: SUPPLIER_TRUST_GATE_TYPE },
    },
  })
  if (!gate) return { outcome: "no-op" }
  if (gate.state !== "blocked") return { outcome: "no-op" }

  const doc = await client.document.findUnique({
    where: { id: input.documentId },
    select: { id: true, workspaceId: true, docType: true, fieldSnapshot: true, receivedAt: true },
  })
  if (!doc) return { outcome: "no-op" }

  const verdict = await supplierTrustGateRunner.run({
    workspaceId: input.workspaceId,
    documentId: input.documentId,
    document: doc as GateContext["document"],
  })
  if (!verdict.blocked) {
    await resolveGate(
      { gateId: gate.id, actorId: null, reason: "supplier-trust threshold re-evaluated" },
      client,
    )
    return { outcome: "resolved" }
  }
  await client.gate.update({
    where: { id: gate.id },
    data: {
      severity: verdict.severity,
      payload: (verdict.payload ?? null) as Prisma.InputJsonValue,
    },
  })
  return { outcome: "still-blocking" }
}

/** Workspace-wide sweep. Called from the settings server action after the threshold JSON
 * changes; walks every open supplier-trust gate and either resolves or refreshes it. Same
 * "only touch open" scope as #53 — a tightening tolerance does not retroactively fault
 * previously-passing bills. */
export async function reevaluateOpenSupplierTrustGates(
  workspaceId: string,
  client: PrismaLike = prisma,
): Promise<{ resolved: number; stillBlocking: number }> {
  const rows = await client.gate.findMany({
    where: { workspaceId, gateType: SUPPLIER_TRUST_GATE_TYPE, state: "blocked" },
    select: { id: true, documentId: true },
  })
  let resolved = 0
  let stillBlocking = 0
  for (const row of rows) {
    const { outcome } = await reevaluateSupplierTrustForDocument(
      { workspaceId, documentId: row.documentId },
      client,
    )
    if (outcome === "resolved") resolved += 1
    else if (outcome === "still-blocking") stillBlocking += 1
  }
  return { resolved, stillBlocking }
}
