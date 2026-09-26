/** ADR 0001 / #229 Q6 (#251): an invoice's paid state is **derived, ledger first, then payment
 * records**. The ledger's confirmation wins when it exists; otherwise DocuBite's own Payment
 * records against the amount due decide Paid / Partially paid / Unpaid, and membership of a
 * pending or approved Payment batch reads as Scheduled. The `source` says which authority the
 * state was read from, so the pill can say "Paid (recorded)" when the ledger has not confirmed.
 * Money maths in cents. */

export type PaidState = "paid" | "partially_paid" | "credited" | "scheduled" | "unpaid"
export type PaidSource = "ledger" | "recorded" | null

export type DerivedPaidState = {
  state: PaidState
  source: PaidSource
  /** Whole-cent amount recorded, confirmed paid, or covered by allocation; 0 when unpaid. */
  paidAmount: number
  /** The pill's words — one vocabulary on every surface. */
  label: string
  /** Whole-unit amount covered by live Payment records (#463: split out of `paidAmount`). */
  recordedAmount: number
  /** Whole-unit amount covered by live credit allocations (#463 Step 3). */
  allocatedAmount: number
}

export type PaidStateInput = {
  /** The ledger's own status for this document, when it has one (`models/ledger-payments.ts`). */
  ledgerStatus: string | null
  ledgerPaidAmount: number | null
  /** The bill total; null when the document has none (then only the ledger can call it paid). */
  total: number | null
  /** Live (not removed) payment records against the invoice. */
  records: Array<{ amount: number }>
  /** Live credit allocations against the invoice (#463 Step 2). */
  allocations: Array<{ amount: number }>
  /** The status of the newest live batch holding this invoice, when there is one. */
  batchStatus: "pending_approval" | "approved" | "paid" | "rejected" | "draft" | "sent" | null
}

const LEDGER_PAID = new Set(["paid", "reconciled"])
const LEDGER_PARTIAL = new Set(["partially_paid", "partial"])

export function derivePaidState(input: PaidStateInput): DerivedPaidState {
  const ledger = input.ledgerStatus?.toLowerCase() ?? null
  if (ledger && LEDGER_PAID.has(ledger)) {
    return { state: "paid", source: "ledger", paidAmount: input.ledgerPaidAmount ?? input.total ?? 0, label: "Paid", recordedAmount: 0, allocatedAmount: 0 }
  }
  if (ledger && LEDGER_PARTIAL.has(ledger)) {
    return { state: "partially_paid", source: "ledger", paidAmount: input.ledgerPaidAmount ?? 0, label: "Partially paid", recordedAmount: 0, allocatedAmount: 0 }
  }

  const recordedCents = input.records.reduce((sum, record) => sum + Math.round(record.amount * 100), 0)
  const allocatedCents = input.allocations.reduce((sum, allocation) => sum + Math.round(allocation.amount * 100), 0)
  const coveredCents = recordedCents + allocatedCents
  const dueCents = input.total !== null ? Math.round(input.total * 100) : null
  const recordedAmount = recordedCents / 100
  const allocatedAmount = allocatedCents / 100

  if (coveredCents > 0 && dueCents !== null && coveredCents >= dueCents) {
    if (recordedCents > 0) {
      return { state: "paid", source: "recorded", paidAmount: coveredCents / 100, label: "Paid (recorded)", recordedAmount, allocatedAmount }
    }
    return { state: "credited", source: "recorded", paidAmount: coveredCents / 100, label: "Credited", recordedAmount, allocatedAmount }
  }
  if (coveredCents > 0) {
    return { state: "partially_paid", source: "recorded", paidAmount: coveredCents / 100, label: "Partially paid", recordedAmount, allocatedAmount }
  }
  if (input.batchStatus === "pending_approval" || input.batchStatus === "approved" || input.batchStatus === "draft" || input.batchStatus === "sent") {
    return { state: "scheduled", source: null, paidAmount: 0, label: "Scheduled", recordedAmount: 0, allocatedAmount: 0 }
  }
  return { state: "unpaid", source: null, paidAmount: 0, label: "Unpaid", recordedAmount: 0, allocatedAmount: 0 }
}

/** The remaining amount a partially paid invoice still owes, in whole cents → number. */
export function remainingDue(total: number | null, paidAmount: number): number | null {
  if (total === null) return null
  return Math.max(0, Math.round(total * 100) - Math.round(paidAmount * 100)) / 100
}
