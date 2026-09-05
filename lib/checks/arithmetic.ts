import { amountsMatch, type CheckResult } from "@/lib/checks/types"

export type ArithmeticInput = {
  currencyCode: string | null
  subtotal: number | null
  taxTotal: number | null
  /** Shipping/handling/freight shown separately from the subtotal — part of the total but not of
   * subtotal or tax. Optional so older callers (and templates without the field) keep working. */
  shippingTotal?: number | null
  /** Charges/fees/credits outside the standard subtotal+tax+shipping breakdown. */
  otherCharges?: { amount: number | null }[]
  total: number | null
  lineItems: { amount: number | null }[]
}

/** subtotal + tax (+ shipping when present) ≈ total, and (when every line item has an amount) the line items sum to
 * whichever of subtotal/total is present. One of only two checks that defaults to "fail" rather
 * than "warn" (the roadmap's own call) — a total that doesn't add up is not a judgment call, it's
 * either a misread number or a genuinely wrong document, and either way it should not reach a
 * ledger unexamined.
 *
 * Returns null — "not applicable" rather than pass/warn/fail — when there isn't enough data to
 * check anything (no subtotal/total, no line items with amounts). A document missing every
 * relevant field is a different problem (missing required fields) than one whose numbers
 * disagree, and this check should not manufacture an opinion about the former. */
export function checkInvoiceArithmetic(input: ArithmeticInput): CheckResult | null {
  const issues: string[] = []
  const detail: Record<string, unknown> = {}

  if (input.subtotal !== null && input.taxTotal !== null && input.total !== null) {
    const shipping = input.shippingTotal ?? null
    const baseExpected = input.subtotal + input.taxTotal + (shipping ?? 0)
    detail.subtotalPlusTax = baseExpected
    if (shipping !== null) detail.shippingTotal = shipping

    const otherAmounts = (input.otherCharges ?? []).map((c) => c.amount)
    const allOtherPresent = otherAmounts.length > 0 && otherAmounts.every((a): a is number => a !== null)
    const otherSum = allOtherPresent ? otherAmounts.reduce((s, a) => s + (a as number), 0) : 0
    if (allOtherPresent) detail.otherChargesSum = otherSum

    const baseMatch = amountsMatch(baseExpected, input.total, input.currencyCode)
    const inclusiveMatch = allOtherPresent && otherSum !== 0 && amountsMatch(baseExpected + otherSum, input.total, input.currencyCode)

    if (!baseMatch && !inclusiveMatch) {
      const parts = shipping !== null
        ? `subtotal (${input.subtotal}) + tax (${input.taxTotal}) + shipping (${shipping})`
        : `subtotal (${input.subtotal}) + tax (${input.taxTotal})`
      const suffix = allOtherPresent && otherSum !== 0 ? ` (also tried + other charges ${round2(otherSum)})` : ""
      issues.push(`${parts} = ${round2(baseExpected)}, but total is ${input.total}${suffix}`)
    }
  }

  const amounts = input.lineItems.map((item) => item.amount)
  const everyAmountPresent = input.lineItems.length > 0 && amounts.every((amount): amount is number => amount !== null)
  if (everyAmountPresent) {
    const sum = amounts.reduce((total, amount) => total + (amount as number), 0)
    const target = input.subtotal ?? input.total
    detail.lineItemSum = sum
    if (target !== null && !amountsMatch(sum, target, input.currencyCode)) {
      issues.push(`line items sum to ${round2(sum)}, but ${input.subtotal !== null ? "subtotal" : "total"} is ${target}`)
    }
  }

  const checkedSomething = (input.subtotal !== null && input.taxTotal !== null && input.total !== null) || (everyAmountPresent && (input.subtotal !== null || input.total !== null))
  if (!checkedSomething) return null

  return issues.length
    ? { checkCode: "invoice_arithmetic", status: "fail", message: issues.join("; "), detail }
    : { checkCode: "invoice_arithmetic", status: "pass", message: "Arithmetic checks out.", detail }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}
