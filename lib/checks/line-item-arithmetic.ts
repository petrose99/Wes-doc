import { amountsMatch, type CheckResult } from "@/lib/checks/types"

export type LineItemArithmeticInput = {
  currencyCode: string | null
  lineItems: Array<{
    quantity: number | null
    unitPrice: number | null
    amount: number | null
  }>
}

/** Checks the printed line total against quantity × unit price. A line is not judged when one
 * input is missing: "not applicable" is safer than inventing a value and teaching the reviewer
 * to distrust the check. The fields are the exact form paths for every implicated cell. */
export function checkLineItemArithmetic(input: LineItemArithmeticInput): CheckResult | null {
  const issues: string[] = []
  const fields = new Set<string>()

  input.lineItems.forEach((item, index) => {
    if (item.quantity === null || item.unitPrice === null || item.amount === null) return

    const expected = item.quantity * item.unitPrice
    const amountField = `line_items[${index}].amount`
    const quantityField = `line_items[${index}].quantity`
    const unitPriceField = `line_items[${index}].unit_price`
    fields.add(amountField)
    fields.add(quantityField)
    fields.add(unitPriceField)

    if (!amountsMatch(expected, item.amount, input.currencyCode)) {
      issues.push(`Line ${index + 1} amount (${round2(item.amount)}) does not equal quantity (${round2(item.quantity)}) × unit price (${round2(item.unitPrice)}) = ${round2(expected)}`)
    }
  })

  if (!fields.size) return null
  return issues.length
    ? { checkCode: "line_item_arithmetic", status: "fail", message: issues.join("; "), fields: [...fields] }
    : { checkCode: "line_item_arithmetic", status: "pass", message: "Line item arithmetic checks out.", fields: [...fields] }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}
