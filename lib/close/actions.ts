/** Lifecycle transitions for a Close row (#95). Four verbs from decision #42:
 *
 *   - openClose(workspaceId, year, month): create the Close + its CloseItem rows from
 *     descriptorsForClose(pack.code, vatPeriodEnd). Emits close.opened. No retroactive
 *     back-fill — a workspace only starts having closes from the first call.
 *   - lockClose(closeId, actorId): flip 'open' → 'locked', snapshot pack version, write
 *     lockSnapshot. BLOCKED when the workspace has any open, HARD-severity Gate rows —
 *     the ticket calls this the "open hard-gate AP exceptions" hard-gate on lock. Emits
 *     close.period.locked.
 *   - reopenClose(closeId, actorId, reason): flip 'locked' → 'open', mark every item's
 *     reSignRequired=true so #97 can force a fresh sign-off. Emits close.period.reopened.
 *   - relockClose(closeId, actorId): re-lock after a reopen — same guard as lockClose,
 *     emits close.period.relocked instead of close.period.locked to preserve the sequence.
 *
 * Every action writes the paired audit event via writeAuditEvent so the trail matches the
 * state column without a call site remembering to fire it. Actor id is required for lock /
 * reopen / relock (an explicit user action per #42); open accepts null so the future
 * scheduled-open (a Sunday-night cron per an eventual ticket) has no need to invent a fake
 * actor.
 *
 * Item state computation is #96, sign-off / UI is #97 — the ticket keeps this file to
 * persistence + lifecycle only. Callers should never mutate close_items.state from here. */

import { prisma } from "@/lib/db"
import { AuditEventType, writeAuditEvent } from "@/lib/audit"
import { resolveJurisdictionPack, type JurisdictionCode } from "@/lib/jurisdictions"
import type { Close, CloseItem, Prisma, PrismaClient } from "@/prisma/client"
import { descriptorsForClose } from "./item-sets"
import type { CloseLockSnapshot } from "./types"

type PrismaLike = PrismaClient | Prisma.TransactionClient

export class CloseNotFoundError extends Error {
  constructor(closeId: string) {
    super(`Close ${closeId} not found`)
    this.name = "CloseNotFoundError"
  }
}

export class CloseAlreadyOpenError extends Error {
  constructor(workspaceId: string, year: number, month: number) {
    super(`Close for workspace ${workspaceId} period ${year}-${String(month).padStart(2, "0")} already exists`)
    this.name = "CloseAlreadyOpenError"
  }
}

/** Raised by lockClose / relockClose when the workspace has any open, hard-severity Gate
 * row against a document that belongs to it. The exception's `gateIds` gives the surface a
 * count and a jump target without re-querying. */
export class CloseLockBlockedByGatesError extends Error {
  gateIds: string[]
  constructor(gateIds: string[]) {
    super(`Cannot lock close: ${gateIds.length} open hard gate${gateIds.length === 1 ? "" : "s"} against workspace bills`)
    this.name = "CloseLockBlockedByGatesError"
    this.gateIds = gateIds
  }
}

export class CloseWrongStateError extends Error {
  constructor(expected: "open" | "locked", actual: string) {
    super(`Close is ${actual}, expected ${expected}`)
    this.name = "CloseWrongStateError"
  }
}

/** Read the workspace's jurisdiction pack code. Nullable: a workspace that hasn't picked
 * one still opens closes (the descriptor list drops the VAT row and any jurisdiction
 * extras). Exists as its own helper so tests can stub it. */
async function readWorkspaceJurisdiction(
  workspaceId: string,
  client: PrismaLike,
): Promise<JurisdictionCode | null> {
  const row = await client.workspace.findUnique({
    where: { id: workspaceId },
    select: { jurisdictionCode: true },
  })
  return (row?.jurisdictionCode as JurisdictionCode | null) ?? null
}

/** Whether the given (year, month) is a VAT-period-end for this jurisdiction. Reads the
 * pack's `filings` topic per the ticket — a pack with no `filings` block yields false. Both
 * ZA VAT201 and LS VAT-12 are monthly today, so this is currently equivalent to "pack has
 * filings"; kept as a function so a future bi-monthly jurisdiction can flip it off on
 * non-return months without changing callers. */
export function isVatPeriodEnd(code: JurisdictionCode | null, _year: number, _month: number): boolean {
  const pack = resolveJurisdictionPack(code)
  return pack?.filings != null
}

/** Create a new Close for (workspace, year, month) plus one CloseItem row per descriptor.
 * Idempotent-per-period through the unique index (workspaceId, periodYear, periodMonth): a
 * second open on the same period throws CloseAlreadyOpenError rather than duplicating. */
export async function openClose(
  input: { workspaceId: string; year: number; month: number; actorId?: string | null },
  client: PrismaLike = prisma,
): Promise<Close & { items: CloseItem[] }> {
  if (input.month < 1 || input.month > 12) {
    throw new Error(`Invalid close month ${input.month} — must be 1..12`)
  }

  const existing = await client.close.findUnique({
    where: {
      workspaceId_periodYear_periodMonth: {
        workspaceId: input.workspaceId,
        periodYear: input.year,
        periodMonth: input.month,
      },
    },
  })
  if (existing) throw new CloseAlreadyOpenError(input.workspaceId, input.year, input.month)

  const code = await readWorkspaceJurisdiction(input.workspaceId, client)
  const vatEnd = isVatPeriodEnd(code, input.year, input.month)
  const descriptors = descriptorsForClose(code, vatEnd)

  const close = await client.close.create({
    data: {
      workspaceId: input.workspaceId,
      periodYear: input.year,
      periodMonth: input.month,
      state: "open",
      vatPeriodEnd: vatEnd,
      openedById: input.actorId ?? null,
      items: {
        create: descriptors.map((d) => ({
          workspaceId: input.workspaceId,
          kind: d.kind,
          title: d.title,
          required: d.required,
          softDelta: d.softDelta,
        })),
      },
    },
    include: { items: true },
  })

  await writeAuditEvent(
    {
      workspaceId: input.workspaceId,
      actorId: input.actorId ?? null,
      type: AuditEventType.CLOSE_OPENED,
      subjectType: "close",
      subjectId: close.id,
      payload: {
        periodYear: input.year,
        periodMonth: input.month,
        vatPeriodEnd: vatEnd,
        packCode: code,
        itemKinds: descriptors.map((d) => d.kind),
      },
    },
    client,
  )

  return close
}

/** Count open, hard-severity Gate rows for a workspace — the block predicate for lock /
 * relock per the ticket. Returns the ids so the raised error carries them. */
async function findBlockingHardGates(workspaceId: string, client: PrismaLike): Promise<string[]> {
  const rows = await client.gate.findMany({
    where: { workspaceId, severity: "hard", state: "blocked" },
    select: { id: true },
  })
  return rows.map((r) => r.id)
}

/** Flip 'open' → 'locked', snapshot pack version, write minimal lockSnapshot. Emits either
 * close.period.locked (fresh lock) or close.period.relocked (a lock following a reopen).
 * The `eventType` split is intentional — an auditor reading the audit_events trail can
 * tell first-lock from re-lock without having to remember which came first. */
async function performLock(
  input: { closeId: string; actorId: string; eventType: "close.period.locked" | "close.period.relocked" },
  client: PrismaLike,
): Promise<Close> {
  const existing = await client.close.findUnique({ where: { id: input.closeId } })
  if (!existing) throw new CloseNotFoundError(input.closeId)
  if (existing.state !== "open") throw new CloseWrongStateError("open", existing.state)

  const blocking = await findBlockingHardGates(existing.workspaceId, client)
  if (blocking.length > 0) throw new CloseLockBlockedByGatesError(blocking)

  const code = await readWorkspaceJurisdiction(existing.workspaceId, client)
  const pack = resolveJurisdictionPack(code)
  const lockedAt = new Date()
  const snapshot: CloseLockSnapshot = {
    packCode: pack?.code ?? null,
    packVersion: pack?.packVersion ?? null,
    lockedAt: lockedAt.toISOString(),
  }

  const close = await client.close.update({
    where: { id: input.closeId },
    data: {
      state: "locked",
      lockedAt,
      lockedById: input.actorId,
      packCode: pack?.code ?? null,
      packVersion: pack?.packVersion ?? null,
      lockSnapshot: snapshot as unknown as Prisma.InputJsonValue,
    },
  })

  await writeAuditEvent(
    {
      workspaceId: close.workspaceId,
      actorId: input.actorId,
      type: input.eventType,
      subjectType: "close",
      subjectId: close.id,
      payload: {
        periodYear: close.periodYear,
        periodMonth: close.periodMonth,
        packCode: snapshot.packCode,
        packVersion: snapshot.packVersion,
      },
    },
    client,
  )
  return close
}

/** First lock. Emits close.period.locked. */
export async function lockClose(
  input: { closeId: string; actorId: string },
  client: PrismaLike = prisma,
): Promise<Close> {
  return performLock({ ...input, eventType: AuditEventType.CLOSE_PERIOD_LOCKED }, client)
}

/** Re-lock after a reopen. Emits close.period.relocked so the trail keeps first-lock and
 * re-lock distinguishable. */
export async function relockClose(
  input: { closeId: string; actorId: string },
  client: PrismaLike = prisma,
): Promise<Close> {
  return performLock({ ...input, eventType: AuditEventType.CLOSE_PERIOD_RELOCKED }, client)
}

/** Flip 'locked' → 'open' and mark every item's reSignRequired=true, so the sign-off
 * surface (#97) can require a fresh sign for anything already signed under the prior lock.
 * `reason` is required by the ticket ("explicit"): auditors need to see why a period was
 * reopened. */
export async function reopenClose(
  input: { closeId: string; actorId: string; reason: string },
  client: PrismaLike = prisma,
): Promise<Close> {
  const existing = await client.close.findUnique({ where: { id: input.closeId } })
  if (!existing) throw new CloseNotFoundError(input.closeId)
  if (existing.state !== "locked") throw new CloseWrongStateError("locked", existing.state)
  if (!input.reason.trim()) throw new Error("reopenClose: reason is required")

  const now = new Date()
  const close = await client.close.update({
    where: { id: input.closeId },
    data: {
      state: "open",
      lastReopenedAt: now,
      lastReopenedById: input.actorId,
      reopenReason: input.reason,
    },
  })
  await client.closeItem.updateMany({
    where: { closeId: close.id },
    data: { reSignRequired: true },
  })

  await writeAuditEvent(
    {
      workspaceId: close.workspaceId,
      actorId: input.actorId,
      type: AuditEventType.CLOSE_PERIOD_REOPENED,
      subjectType: "close",
      subjectId: close.id,
      payload: {
        periodYear: close.periodYear,
        periodMonth: close.periodMonth,
        reason: input.reason,
      },
    },
    client,
  )
  return close
}
