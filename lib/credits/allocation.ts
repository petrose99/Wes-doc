import { normalizeInvoiceNumber } from "@/lib/checks/duplicates"
import { normalizeSupplierName } from "@/lib/suppliers/normalize"

/** Wayfinder map #445, #463 (ADR 0017): a Credit allocation is never a Payment record and never
 * touches a Payment line — these three pure functions are the whole business rule, shared by
 * `models/credits.ts`'s create/void paths and the auto-propose-on-approval step (Q9). */

/** The allocated amount can never exceed what was requested, what the invoice still owes, or what
 * the credit note has left to give — whichever is smallest, floored at 0 (an already-settled
 * invoice or an exhausted credit note proposes nothing). */
export function capAllocationAmount(input: { requestedAmount: number; invoiceDue: number; creditRemaining: number }): number {
  return Math.max(0, Math.min(input.requestedAmount, input.invoiceDue, input.creditRemaining))
}

/** Exact normalized-invoice-number + same normalized supplier match only — never fuzzy, mirroring
 * ADR 0015's item-pairing rule. Null when the credit note cites no invoice number, cites nothing
 * that resolves, or nothing shares its supplier. */
export function proposeAllocation(input: {
  creditNote: { citedInvoiceNumber: string | null; supplier: string | null; remaining: number }
  candidates: Array<{ documentId: string; invoiceNumber: string | null; supplier: string | null; due: number }>
}): { documentId: string; amount: number } | null {
  const citedInvoiceNumber = normalizeInvoiceNumber(input.creditNote.citedInvoiceNumber)
  if (!citedInvoiceNumber) return null
  const supplier = normalizeSupplierName(input.creditNote.supplier)
  if (!supplier) return null
  const match = input.candidates.find(
    (candidate) =>
      normalizeInvoiceNumber(candidate.invoiceNumber) === citedInvoiceNumber &&
      normalizeSupplierName(candidate.supplier) === supplier,
  )
  if (!match) return null
  return { documentId: match.documentId, amount: Math.max(0, Math.min(input.creditNote.remaining, match.due)) }
}

/** The one guard both `createCreditAllocation` and `voidCreditAllocation`/`voidCreditNote` share:
 * an invoice with an open (pending or approved) Payment batch line can't have its due amount
 * shifted underneath the batch — same reasoning as `describeMoveIneligibility`'s batch check. */
export function refuseIfOpenLine(input: { hasOpenPaymentLine: boolean }): { ok: true } | { ok: false; reason: "open_payment_line" } {
  return input.hasOpenPaymentLine ? { ok: false, reason: "open_payment_line" } : { ok: true }
}
