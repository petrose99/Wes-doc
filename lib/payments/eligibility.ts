import type { PaidState } from "@/lib/payments/paid-state"

/** #229 Q7 (#251): who belongs on Bill Pay and which of those rows can go into a batch. A row
 * is *on* Bill Pay when its processing state is Approved, it is not cancelled and not fully
 * paid (the #239 gate). A row is *batchable* only when it also has a supplier bank account and
 * is not already in a live batch — the un-batchable rows stay visible with the reason, never
 * dropped silently the way `preparePaymentRun` did. Pure; the queue and the server share it. */

export type BillPayMembershipInput = {
  processingState: "cancelled" | "needs_attention" | "in_review" | "touchless" | "approved"
  paidState: PaidState
}

export function isOnBillPay(input: BillPayMembershipInput): boolean {
  if (input.processingState === "cancelled") return false
  if (input.processingState !== "approved" && input.processingState !== "touchless") return false
  // #463: a fully-credited invoice is done, same as a fully-paid one — neither belongs on Bill Pay.
  return input.paidState !== "paid" && input.paidState !== "credited"
}

export type BatchEligibilityReason = "needs_bank_details" | "scheduled" | "no_amount" | "no_supplier" | "no_payer_account"

export type BatchEligibility = { eligible: true } | { eligible: false; reason: BatchEligibilityReason }

export function batchEligibility(input: { hasBankAccount: boolean; paidState: PaidState; amountToPay: number | null; hasSupplier: boolean; hasPayerAccount: boolean }): BatchEligibility {
  if (!input.hasSupplier) return { eligible: false, reason: "no_supplier" }
  if (!input.hasPayerAccount) return { eligible: false, reason: "no_payer_account" }
  if (input.amountToPay === null || input.amountToPay <= 0) return { eligible: false, reason: "no_amount" }
  if (input.paidState === "scheduled") return { eligible: false, reason: "scheduled" }
  if (!input.hasBankAccount) return { eligible: false, reason: "needs_bank_details" }
  return { eligible: true }
}

export const ELIGIBILITY_COPY: Record<BatchEligibilityReason, string> = {
  needs_bank_details: "Needs bank details",
  scheduled: "Already in a batch",
  no_amount: "No amount to pay",
  no_supplier: "Supplier not on file",
  no_payer_account: "No payer account yet",
}

/** #331: an approved reimbursement claim's own eligibility for a batch — no supplier/payer
 * account/amount checks (those don't apply to a claim row), just the claimant's own bank details,
 * membership and currency. Kept in this client-safe module (no `lib/db` in its import graph)
 * beside `ELIGIBILITY_COPY` so `bill-pay-queue.tsx` (a client component) can import the copy
 * without pulling Prisma into the browser bundle — `models/bill-pay.ts` re-exports both for its
 * own (server-only) callers. */
export type ClaimEligibilityReason = "needs_bank_details" | "left_workspace" | "needs_currency"
export type ClaimEligibility = { eligible: true } | { eligible: false; reason: ClaimEligibilityReason }

export const CLAIM_ELIGIBILITY_COPY: Record<ClaimEligibilityReason, string> = {
  needs_bank_details: "Needs bank details",
  left_workspace: "No longer a member",
  needs_currency: "Needs a currency",
}

/** `0 < amount ≤ due`, in cents so 0.1 + 0.2 never bites. Returns the reason it is not, or null. */
export function validateAmountToPay(amount: number, due: number): string | null {
  if (!Number.isFinite(amount)) return "Enter an amount."
  const cents = Math.round(amount * 100)
  if (cents <= 0) return "The amount must be more than zero."
  if (cents > Math.round(due * 100)) return "The amount can't be more than what's due."
  return null
}
