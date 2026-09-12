/** State transitions for a Gate row: a person overrode it, or the underlying condition resolved.
 * Split out of the registry because these run from user actions or reconciliation jobs, never
 * from the arrival hook — the registry only writes the initial `blocked` row.
 *
 * Both operations write the paired audit event (`gate.overridden` / `gate.resolved`) via
 * writeAuditEvent, so the trail matches the state column without a call site remembering to fire
 * it. Both are idempotent against re-invocation: transitioning an already-resolved gate to
 * resolved is a no-op; overriding an already-overridden gate refreshes the reason and re-fires
 * the audit event (which itself collapses to one row per unique payload via #48's hash). */

import { prisma } from "@/lib/db"
import { writeAuditEvent } from "@/lib/audit"
import { AuditEventType } from "@/lib/audit"
import type { Prisma, PrismaClient, Gate } from "@/prisma/client"

type PrismaLike = PrismaClient | Prisma.TransactionClient

export class GateNotFoundError extends Error {
  constructor(gateId: string) {
    super(`Gate ${gateId} not found`)
    this.name = "GateNotFoundError"
  }
}

/** A person acknowledged the finding without fixing the underlying condition. Transitions
 * blocked → overridden and records who + why. Refusing to override a hard gate is a per-gate
 * concern (the duplicate ticket #51 enforces it on the server action that calls this) — this
 * helper is deliberately unopinionated on severity so #40's read-only-hard-gate rule is enforced
 * once, at the surface the user hits, not scattered across every call site. */
export async function overrideGate(
  input: { gateId: string; actorId: string; reason: string; actorRoleOverride?: string },
  client: PrismaLike = prisma,
): Promise<Gate> {
  const existing = await client.gate.findUnique({ where: { id: input.gateId } })
  if (!existing) throw new GateNotFoundError(input.gateId)
  const gate = await client.gate.update({
    where: { id: input.gateId },
    data: {
      state: "overridden",
      resolvedAt: new Date(),
      resolvedBy: input.actorId,
      overrideReason: input.reason,
    },
  })
  await writeAuditEvent(
    {
      workspaceId: gate.workspaceId,
      actorId: input.actorId,
      type: AuditEventType.GATE_OVERRIDDEN,
      subjectType: "gate",
      subjectId: gate.id,
      payload: {
        gateType: gate.gateType,
        documentId: gate.documentId,
        reason: input.reason,
        // Gate-type-specific stamp on the audit payload. #76 (smb-ceiling) passes
        // "signer_of_record" here so the trail is unambiguous about who cleared the
        // ceiling — an SMB workspace has exactly one such actor at the time. Other gate
        // overrides omit it; the field is only present when a caller chose to name the
        // role, so the audit shape stays additive.
        ...(input.actorRoleOverride ? { actorRole: input.actorRoleOverride } : {}),
      },
    },
    client,
  )
  return gate
}

/** The underlying condition went away — the duplicate resolved itself, the variance recomputed
 * within tolerance, the missing supplier tax number came in. Transitions blocked → resolved.
 * `actorId` is optional because most resolutions are automatic (a system-driven recompute) with
 * no user in the loop; null lands on AuditEvent.actorId, matching the "system" pattern already
 * used by recordSystemAudit above. */
export async function resolveGate(
  input: { gateId: string; actorId?: string | null; reason?: string | null },
  client: PrismaLike = prisma,
): Promise<Gate> {
  const existing = await client.gate.findUnique({ where: { id: input.gateId } })
  if (!existing) throw new GateNotFoundError(input.gateId)
  if (existing.state === "resolved") return existing
  const gate = await client.gate.update({
    where: { id: input.gateId },
    data: {
      state: "resolved",
      resolvedAt: new Date(),
      resolvedBy: input.actorId ?? null,
      overrideReason: input.reason ?? null,
    },
  })
  await writeAuditEvent(
    {
      workspaceId: gate.workspaceId,
      actorId: input.actorId ?? null,
      type: AuditEventType.GATE_RESOLVED,
      subjectType: "gate",
      subjectId: gate.id,
      payload: {
        gateType: gate.gateType,
        documentId: gate.documentId,
        reason: input.reason ?? null,
      },
    },
    client,
  )
  return gate
}
