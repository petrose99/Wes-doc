import type { CheckResult } from "@/lib/checks/types"
import type { DocType } from "@/lib/doc-types"

/** Q13 "fail": an invoice whose extracted total is negative — the shape that pre-#463 was the
 * only signal for "this is really a credit note". New credit notes are typed and positive
 * (Step 1); a negative-total invoice past this point is a legacy document (Q19) that never got
 * converted, so this fires only for `docType === "invoice"` and offers the Move action. */
export function checkNegativeTotal(input: { docType: DocType; total: number | null }): CheckResult | null {
  if (input.docType !== "invoice" || input.total === null || input.total >= 0) return null
  return {
    checkCode: "invoice_negative_total",
    status: "fail",
    message: "This invoice has a negative total — move it to a credit note.",
    detail: { suggestedAction: "move_to_credit_note" },
  }
}

/** Q13 "warn": the credit note's own total is larger than the open invoice it cites — allocation
 * still caps to the invoice's due (`capAllocationAmount`), but the reviewer should see this before
 * allocating. Caller resolves the matched invoice (same supplier, same normalized invoice number)
 * before calling; this stays pure over the comparison. */
export function checkCreditExceedsInvoice(input: { creditTotal: number; invoiceNumber: string; invoiceDue: number }): CheckResult | null {
  if (input.creditTotal <= input.invoiceDue) return null
  return {
    checkCode: "credit_exceeds_invoice",
    status: "warn",
    message: `This credit (${input.creditTotal.toFixed(2)}) is larger than Invoice #${input.invoiceNumber} (${input.invoiceDue.toFixed(2)} due).`,
  }
}

/** Q13 "warn": the credit note cites an invoice number but no open invoice from the same supplier
 * matches it — the credit stays as standing supplier credit (`getSupplierCreditAvailable`)
 * instead of allocating anywhere. Caller determines "no match"; this only formats the warning. */
export function checkCreditNoInvoiceMatch(input: { invoiceNumber: string; supplier: string }): CheckResult | null {
  return {
    checkCode: "credit_no_matching_invoice",
    status: "warn",
    message: `No open invoice ${input.invoiceNumber} from ${input.supplier} — this credit stays as supplier credit.`,
  }
}
