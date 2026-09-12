/** Unposted-bill accrual proposals per decision #46. One journal draft per candidate bill:
 *
 *   Dr <category>                 <net>
 *   Dr VAT suspense                <vat>       (ZA / LS only — honours invoice-held rule)
 *     Cr Accruals control         (net + vat)
 *
 * The reversal auto-drafts for `periodEnd + 1 day`. Never posts — DocuBite doesn't own the
 * GL. Gate state is passthrough (`gateStatus` per row), not a filter: #46 explicitly wants
 * all bills invoice-dated ≤ periodEnd AND payment-not-yet-recorded regardless of gate. */

import type { JurisdictionCode } from "@/lib/jurisdictions"
import type { CloseCandidateBill } from "./bills"
import type { ComputedUnpostedAccruals } from "./types"

/** Jurisdictions with an invoice-held input-VAT rule per #46: ZA (s16), LS (s.23(4)), and GB
 * (Reg 29). US v1 is out of scope for VAT suspense (#46). */
const VAT_SUSPENSE_JURISDICTIONS: readonly (JurisdictionCode | null)[] = ["ZA", "LS", "GB"] as const

export type ComputeAccrualsInput = {
  periodEnd: Date
  bills: readonly CloseCandidateBill[]
  jurisdictionCode: JurisdictionCode | null
}

export function computeUnpostedAccruals(input: ComputeAccrualsInput): ComputedUnpostedAccruals {
  const vatSuspense = VAT_SUSPENSE_JURISDICTIONS.includes(input.jurisdictionCode)
  const periodEnd = input.periodEnd
  const reversalDate = new Date(periodEnd)
  reversalDate.setUTCDate(reversalDate.getUTCDate() + 1)

  const proposals: Array<ComputedUnpostedAccruals["proposals"][number]> = []
  let totalNet = 0
  let totalVatSuspense = 0
  let totalAccruals = 0

  for (const c of input.bills) {
    const b = c.bill
    const debitNet = round2(b.net)
    const debitVatSuspense = vatSuspense && b.vat > 0 ? round2(b.vat) : null
    const creditAccruals = round2(debitNet + (debitVatSuspense ?? 0))

    proposals.push({
      billId: c.documentId,
      invoiceDate: b.invoiceDate.toISOString().slice(0, 10),
      supplierName: b.supplier.name,
      category: b.category,
      debitNet,
      debitVatSuspense,
      creditAccruals,
      gateStatus: c.gateStatus,
    })

    totalNet += debitNet
    totalVatSuspense += debitVatSuspense ?? 0
    totalAccruals += creditAccruals
  }

  return {
    kind: "unposted-bill-accruals",
    periodEnd: periodEnd.toISOString().slice(0, 10),
    reversalDate: reversalDate.toISOString().slice(0, 10),
    vatSuspense,
    proposals,
    totalNet: round2(totalNet),
    totalVatSuspense: round2(totalVatSuspense),
    totalAccruals: round2(totalAccruals),
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
