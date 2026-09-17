import { fromCents, toCents } from "@/lib/money"

export type ReceiptForTotal = { amount: number | null; currencyCode: string | null }

export type ClaimTotals = {
  total: number
  currencyCode: string | null
  missing: number
  mixed: boolean
  byCurrency: { currencyCode: string; total: number }[]
}

/** The one function that sums a claim's receipts, in integer cents (lib/money.ts) so chained
 * Float addition never drifts. Used to freeze a claim's total on submit and to show the
 * Approval-tab draft total and the S2 dialog footer — never recomputed ad hoc elsewhere (lesson
 * #250 H8: single functions, never two computations). Currency is never summed across codes: a
 * `mixed` draft lists `byCurrency` instead of one total and cannot submit (spec §2). */
export function sumReceiptTotals(receipts: ReceiptForTotal[]): ClaimTotals {
  const byCurrencyCents = new Map<string, number>()
  let missing = 0
  for (const receipt of receipts) {
    if (receipt.amount == null) {
      missing += 1
      continue
    }
    const code = receipt.currencyCode ?? "USD"
    byCurrencyCents.set(code, (byCurrencyCents.get(code) ?? 0) + toCents(receipt.amount))
  }
  const byCurrency = [...byCurrencyCents.entries()].map(([currencyCode, cents]) => ({ currencyCode, total: fromCents(cents) }))
  const mixed = byCurrency.length > 1
  const currencyCode = byCurrency.length === 1 ? byCurrency[0].currencyCode : null
  const totalCents = [...byCurrencyCents.values()].reduce((sum, cents) => sum + cents, 0)
  const total = mixed ? 0 : fromCents(totalCents)
  return { total, currencyCode, missing, mixed, byCurrency }
}
