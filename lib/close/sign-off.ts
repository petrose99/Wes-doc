/** Per-item sign-off transitions for the close checklist (#97). Three verbs over
 * CloseItem.state, mirroring the lifecycle file's shape (PrismaLike param, typed errors, one
 * audit event per transition):
 *
 *   - signCloseItem: 'pending'/'override' → 'signed'. Only while the parent Close is open.
 *     Clears reSignRequired (a reopen sets it; a fresh sign is exactly what discharges it).
 *   - unsignCloseItem: 'signed'/'override' → 'pending'. Only while open.
 *   - overrideCloseItem: → 'override' with a required reason. Per decision #42 soft-gate
 *     items are "accrue-or-acknowledge" — override IS the acknowledge path, so the reason
 *     lands on the audit trail (no schema column; the payload is the record).
 *
 * Also home to recordBankAssertion — the one computedValue mutation #97 owns (the bank-recon
 * asserted closing balance). Everything else on computedValue belongs to the compute layer
 * (#96). */

import { prisma } from "@/lib/db"
import { AuditEventType, writeAuditEvent } from "@/lib/audit"
import type { Prisma, PrismaClient } from "@/prisma/client"
import { BANK_RECON_DEFAULT_TOLERANCE } from "./compute/bank-recon"
import type { ComputedBankRecon } from "./compute/types"

type PrismaLike = PrismaClient | Prisma.TransactionClient

export class CloseItemNotFoundError extends Error {
  constructor(closeItemId: string) {
    super(`Close item ${closeItemId} not found`)
    this.name = "CloseItemNotFoundError"
  }
}

/** The parent Close is not in the state the transition needs (every sign-off verb requires
 * an open close — a locked period is read-only). */
export class CloseItemParentLockedError extends Error {
  constructor(actual: string) {
    super(`Close is ${actual}; sign-off actions need an open close`)
    this.name = "CloseItemParentLockedError"
  }
}

/** The item itself is in the wrong state for the transition (e.g. unsigning a pending item). */
export class CloseItemWrongStateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CloseItemWrongStateError"
  }
}

export class CloseItemOverrideReasonRequiredError extends Error {
  constructor() {
    super("overrideCloseItem: a non-empty reason is required")
    this.name = "CloseItemOverrideReasonRequiredError"
  }
}

async function loadItemWithOpenParent(closeItemId: string, client: PrismaLike) {
  const item = await client.closeItem.findUnique({
    where: { id: closeItemId },
    include: { close: true },
  })
  if (!item) throw new CloseItemNotFoundError(closeItemId)
  if (item.close.state !== "open") throw new CloseItemParentLockedError(item.close.state)
  return item
}

/** Sign one close item. Allowed from any state while the parent close is open — signing an
 * overridden item upgrades the acknowledgement to a full sign. The `reSign` payload flag
 * records whether this sign discharged a reopen's reSignRequired mark. */
export async function signCloseItem(
  input: { closeItemId: string; actorId: string },
  client: PrismaLike = prisma,
) {
  const item = await loadItemWithOpenParent(input.closeItemId, client)
  const reSign = item.reSignRequired
  const now = new Date()

  const updated = await client.closeItem.update({
    where: { id: item.id },
    data: { state: "signed", signedAt: now, signedById: input.actorId, reSignRequired: false },
  })

  await writeAuditEvent(
    {
      workspaceId: item.workspaceId,
      actorId: input.actorId,
      type: AuditEventType.CLOSE_ITEM_SIGNED,
      subjectType: "close_item",
      subjectId: item.id,
      payload: {
        closeId: item.closeId,
        kind: item.kind,
        periodYear: item.close.periodYear,
        periodMonth: item.close.periodMonth,
        reSign,
        // Timestamp keeps repeated sign → unsign → sign cycles distinct under the audit
        // table's (type, subject, payload-hash) idempotency index.
        at: now.toISOString(),
      },
    },
    client,
  )
  return updated
}

/** Return a signed or overridden item to 'pending'. */
export async function unsignCloseItem(
  input: { closeItemId: string; actorId: string },
  client: PrismaLike = prisma,
) {
  const item = await loadItemWithOpenParent(input.closeItemId, client)
  if (item.state === "pending") throw new CloseItemWrongStateError("Item is already pending; nothing to unsign")
  const now = new Date()

  const updated = await client.closeItem.update({
    where: { id: item.id },
    data: { state: "pending", signedAt: null, signedById: null },
  })

  await writeAuditEvent(
    {
      workspaceId: item.workspaceId,
      actorId: input.actorId,
      type: AuditEventType.CLOSE_ITEM_UNSIGNED,
      subjectType: "close_item",
      subjectId: item.id,
      payload: {
        closeId: item.closeId,
        kind: item.kind,
        periodYear: item.close.periodYear,
        periodMonth: item.close.periodMonth,
        priorState: item.state,
        at: now.toISOString(),
      },
    },
    client,
  )
  return updated
}

/** Acknowledge an item without a clean sign — the "accrue-or-acknowledge" path from #42.
 * Reason required; it lives only in the audit payload (deliberately no schema column). */
export async function overrideCloseItem(
  input: { closeItemId: string; actorId: string; reason: string },
  client: PrismaLike = prisma,
) {
  if (!input.reason?.trim()) throw new CloseItemOverrideReasonRequiredError()
  const item = await loadItemWithOpenParent(input.closeItemId, client)
  const now = new Date()

  const updated = await client.closeItem.update({
    where: { id: item.id },
    data: { state: "override", signedAt: now, signedById: input.actorId, reSignRequired: false },
  })

  await writeAuditEvent(
    {
      workspaceId: item.workspaceId,
      actorId: input.actorId,
      type: AuditEventType.CLOSE_ITEM_OVERRIDE,
      subjectType: "close_item",
      subjectId: item.id,
      payload: {
        closeId: item.closeId,
        kind: item.kind,
        periodYear: item.close.periodYear,
        periodMonth: item.close.periodMonth,
        reason: input.reason.trim(),
        at: now.toISOString(),
      },
    },
    client,
  )
  return updated
}

export class BankAssertionWrongKindError extends Error {
  constructor(kind: string) {
    super(`Bank assertion applies only to a bank-recon item, got '${kind}'`)
    this.name = "BankAssertionWrongKindError"
  }
}

/** Record the human's asserted closing bank balance onto the bank-recon item's
 * computedValue. When a computedBalance exists the delta + tolerance check runs; with
 * computedBalance null (v1 — no ledger sync feeds it) there is nothing to diff, so an
 * asserted balance flips status straight to "within-tolerance" per the #97 decision —
 * leaving it "awaiting-assertion" after an assertion was explicitly rejected. */
export async function recordBankAssertion(
  input: { closeItemId: string; actorId: string; assertedBalance: number },
  client: PrismaLike = prisma,
) {
  if (!Number.isFinite(input.assertedBalance)) throw new Error("recordBankAssertion: assertedBalance must be a finite number")
  const item = await loadItemWithOpenParent(input.closeItemId, client)
  if (item.kind !== "bank-recon") throw new BankAssertionWrongKindError(item.kind)

  const prior = (item.computedValue as ComputedBankRecon | null) ?? null
  const tolerance = prior?.tolerance ?? BANK_RECON_DEFAULT_TOLERANCE
  const computedBalance = prior?.computedBalance ?? null
  const assertedBalance = Math.round(input.assertedBalance * 100) / 100

  let deltaAmount: number | null = null
  let status: ComputedBankRecon["status"]
  if (computedBalance !== null) {
    deltaAmount = Math.round((assertedBalance - computedBalance) * 100) / 100
    status = Math.abs(deltaAmount) <= tolerance ? "within-tolerance" : "delta-flagged"
  } else {
    status = "within-tolerance"
  }

  const value: ComputedBankRecon = {
    kind: "bank-recon",
    status,
    assertedBalance,
    computedBalance,
    deltaAmount,
    tolerance,
  }

  const updated = await client.closeItem.update({
    where: { id: item.id },
    data: { computedValue: value as unknown as Prisma.InputJsonValue, computedAt: new Date() },
  })

  // Same event the compute layer emits on a value change — the assertion IS a computed-value
  // change, just human-sourced; the payload-hash index dedupes an identical re-assertion.
  await writeAuditEvent(
    {
      workspaceId: item.workspaceId,
      actorId: input.actorId,
      type: AuditEventType.CLOSE_ITEM_COMPUTED,
      subjectType: "close_item",
      subjectId: item.id,
      payload: value as unknown as Prisma.InputJsonValue,
    },
    client,
  )
  return updated
}
