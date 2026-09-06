/** Q3 A1.6 (3-way match): PO ↔ invoice ↔ receipt. Given three documents' identifying facts,
 * report whether the trio matches within tolerance. Pure. The existing matching engine only
 * pairs two — this composes to a full 3-way verdict, with per-signal reasons, so a matched
 * trio can bypass the readiness confidence gate for touchless PO customers. */

export type ThreeWayInput = {
  po: { vendor: string | null; amount: number | null; poNumber: string | null }
  invoice: { vendor: string | null; amount: number | null; poNumber: string | null }
  receipt: { vendor: string | null; amount: number | null; poNumber: string | null } | null
  /** Amount tolerance as a fraction (e.g. 0.02 for 2%). */
  tolerancePct?: number
}

export type ThreeWayVerdict = {
  matched: boolean
  score: number
  reasons: string[]
  discrepancies: string[]
}

const DEFAULT_TOL = 0.02

function amountsClose(a: number | null, b: number | null, tol: number): boolean {
  if (a === null || b === null) return false
  const base = Math.max(Math.abs(a), Math.abs(b))
  if (base === 0) return true
  return Math.abs(a - b) / base <= tol
}

function vendorsAgree(a: string | null, b: string | null): boolean {
  if (!a || !b) return false
  return a.trim().toLowerCase().replace(/\s+/g, " ") === b.trim().toLowerCase().replace(/\s+/g, " ")
}

export function evaluateThreeWayMatch(input: ThreeWayInput): ThreeWayVerdict {
  const tol = input.tolerancePct ?? DEFAULT_TOL
  const reasons: string[] = []
  const discrepancies: string[] = []

  const poNumbersMatch = input.po.poNumber && input.invoice.poNumber && input.po.poNumber.trim().toLowerCase() === input.invoice.poNumber.trim().toLowerCase()
  if (poNumbersMatch) reasons.push("po_number_match")
  else discrepancies.push("po_number_mismatch")

  if (vendorsAgree(input.po.vendor, input.invoice.vendor)) reasons.push("vendor_match")
  else discrepancies.push("vendor_mismatch")

  if (amountsClose(input.po.amount, input.invoice.amount, tol)) reasons.push("po_invoice_amount_close")
  else discrepancies.push("po_invoice_amount_diff")

  if (input.receipt) {
    if (amountsClose(input.invoice.amount, input.receipt.amount, tol)) reasons.push("invoice_receipt_amount_close")
    else discrepancies.push("invoice_receipt_amount_diff")
    if (vendorsAgree(input.invoice.vendor, input.receipt.vendor)) reasons.push("receipt_vendor_match")
    else discrepancies.push("receipt_vendor_mismatch")
  }

  const requiredSignals = input.receipt ? 5 : 3
  const score = reasons.length / requiredSignals
  return {
    matched: score === 1,
    score,
    reasons,
    discrepancies,
  }
}
