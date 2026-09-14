/** A2.8: split-invoice detection. Multiple invoices from the same supplier in a short window
 * whose totals sum close to an approval threshold is the classic "keep every bill under
 * approval" fraud/gaming pattern. Pure. */
import type { CheckResult } from "@/lib/checks/types"

export type SplitInvoiceInput = {
  candidateAmount: number | null
  candidateDate: Date | null
  /** Prior comparable (same-supplier) documents inside the window; caller filters. */
  siblings: { documentId: string; amount: number; date: Date }[]
  /** The approval threshold to detect crowding around — typically the smallest active
   * ReviewRoutingRule/WorkspaceBudget threshold above the individual amounts, or 500/1000/5000
   * as sensible defaults if the workspace hasn't configured one. */
  approvalThreshold: number
  /** Days back to consider siblings. Default 7 (a common weekly limit reset). */
  windowDays?: number
  /** How close to the threshold (as a fraction) the sum must sit for a flag. Default 0.9. */
  crowdingFactor?: number
  fieldKeys?: { amount?: string; date?: string }
}

const DEFAULT_WINDOW = 7
const DEFAULT_CROWDING = 0.9

export function checkSplitInvoices(input: SplitInvoiceInput): CheckResult | null {
  if (input.candidateAmount === null || !input.candidateDate || input.approvalThreshold <= 0) return null
  const window = input.windowDays ?? DEFAULT_WINDOW
  const crowding = input.crowdingFactor ?? DEFAULT_CROWDING

  const cutoff = input.candidateDate.getTime() - window * 86400_000
  const inWindow = input.siblings.filter((s) => s.date.getTime() >= cutoff && s.date.getTime() <= input.candidateDate!.getTime())
  const totalSpend = inWindow.reduce((sum, s) => sum + Math.abs(s.amount), 0) + Math.abs(input.candidateAmount)

  if (inWindow.length === 0) return null
  // Every SPLIT would break the threshold as a single invoice — otherwise there's nothing to
  // split around. Each individual must be UNDER the threshold; their sum must be AT OR OVER
  // the crowding factor times the threshold.
  const allBelow = [input.candidateAmount, ...inWindow.map((s) => s.amount)].every((a) => Math.abs(a) < input.approvalThreshold)
  if (!allBelow) return null
  if (totalSpend < input.approvalThreshold * crowding) return null

  return {
    checkCode: "split_invoice",
    status: "warn", fields: [input.fieldKeys?.amount ?? "total", input.fieldKeys?.date ?? "issue_date"],
    message: `${inWindow.length + 1} invoices in ${window} days from this supplier total ${totalSpend.toFixed(2)}, crowding the ${input.approvalThreshold} approval threshold while each stays below it.`,
    detail: {
      windowDays: window, approvalThreshold: input.approvalThreshold, totalSpend,
      siblingIds: inWindow.map((s) => s.documentId),
    },
  }
}
