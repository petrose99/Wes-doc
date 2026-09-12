/** LS RSA-cross-border review (#96, decision #42 LS extra). Lists the bills whose RSA
 * suppliers meet the SARS/RSL common-border arrangement conditions this period (`isRsaCross
 * Border` from `lib/jurisdictions/ls/workpapers.ts`, which enforces the 10-digit `4…` VAT
 * number and 90-day window against `period.endDate`). Presence only — the LS import-VAT
 * treatment is decided by the pack; this row is the eyeballs-on-the-invoice check. */

import type { Period } from "@/lib/jurisdictions/_shared/workpaper"
import { isRsaCrossBorder } from "@/lib/jurisdictions/ls/workpapers"
import type { CloseCandidateBill } from "./bills"
import type { ComputedCrossBorderReview } from "./types"

/** Days-to-invoice window for the SARS/RSL arrangement — mirrors `isRsaCrossBorder`, exposed
 * on the payload so the UI doesn't hard-code it. */
export const RSA_CROSS_BORDER_WINDOW_DAYS = 90

export type ComputeCrossBorderReviewInput = {
  bills: readonly CloseCandidateBill[]
  period: Period
}

export function computeCrossBorderReview(
  input: ComputeCrossBorderReviewInput,
): ComputedCrossBorderReview {
  const matches: Array<ComputedCrossBorderReview["bills"][number]> = []
  let totalGross = 0
  for (const c of input.bills) {
    if (!isRsaCrossBorder(c.bill, input.period)) continue
    const grossAmount = round2(c.bill.gross)
    matches.push({
      billId: c.documentId,
      invoiceDate: c.bill.invoiceDate.toISOString().slice(0, 10),
      supplierName: c.bill.supplier.name,
      grossAmount,
      supplierVatNumber: c.bill.supplier.vatNumber,
    })
    totalGross += grossAmount
  }

  return {
    kind: "cross-border-review",
    windowDays: RSA_CROSS_BORDER_WINDOW_DAYS,
    bills: matches,
    totalGross: round2(totalGross),
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
