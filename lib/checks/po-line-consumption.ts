import type { CheckResult } from "@/lib/checks/types"
import { computeLineMatches, quantitySentence, unitPriceSentence, type LineMatch, type LineMatchInput } from "@/lib/matching/line-match"

/** #206 (map #177's ticket 15), reshaped by #228 / #250: per-line consumption of a PO against
 * every invoice matched to it, plus a unit-price comparison per line. Per-line pairing is still
 * not a second matching engine — each invoice line is assigned to its best-matching PO line by
 * description similarity (or by hand, `lineAssignments`), quantities from every matched invoice
 * are summed per PO line, and a line is flagged only once cumulative consumption exceeds the
 * ordered quantity by more than the workspace's tolerance, or its unit price sits outside the
 * match-variance percent. A description with no PO-line match above the threshold is not judged
 * — an unmatched item is a matching problem, not a consumption one, and inventing a comparison
 * would teach the reviewer to distrust the check.
 *
 * The result always carries the full `LineMatch[]` in `detail.lines` (#228 Q4's structured
 * breakdown), and it is emitted as a `pass` when a PO is compared and nothing fails — the View
 * PO row needs the `=` cells as much as the `≠` ones. A document with no compared PO gets no
 * result at all. */

export type PoLineConsumptionInput = LineMatchInput & {
  poDocumentId: string
  poNumber: string | null
}

export type PoLineConsumptionDetail = {
  poDocumentId: string
  poNumber: string | null
  quantityTolerancePercent: number
  priceTolerancePercent: number
  lines: LineMatch[]
}

export function checkPoLineConsumption(input: PoLineConsumptionInput): CheckResult | null {
  if (!input.poLineItems.length) return null
  const lines = computeLineMatches(input)
  const issues: string[] = []
  const fields: string[] = []

  for (const line of lines) {
    const name = line.description.po ?? (line.poLineIndex !== null ? `PO line ${line.poLineIndex + 1}` : `line ${line.rowIndex + 1}`)
    if (line.quantity.status === "mismatch") {
      issues.push(`"${name}": ${quantitySentence(line)}`)
      fields.push(`line_items[${line.rowIndex}].quantity`)
    }
    if (line.unitPrice.status === "mismatch") {
      issues.push(`"${name}": ${unitPriceSentence(line)}`)
      fields.push(`line_items[${line.rowIndex}].unit_price`)
    }
  }

  const detail: PoLineConsumptionDetail = {
    poDocumentId: input.poDocumentId, poNumber: input.poNumber,
    quantityTolerancePercent: input.quantityTolerancePercent, priceTolerancePercent: input.priceTolerancePercent,
    lines,
  }
  const compared = lines.filter((line) => line.status !== "not_matched").length
  if (!issues.length) {
    return {
      checkCode: "po_line_consumption", status: "pass",
      message: compared ? `${compared} of ${lines.length} line${lines.length === 1 ? "" : "s"} matched to ${input.poNumber ?? "the PO"} within tolerance.` : `No line on this invoice could be matched to a line on ${input.poNumber ?? "the PO"}.`,
      fields: [], detail: detail as unknown as Record<string, unknown>,
    }
  }
  return { checkCode: "po_line_consumption", status: "fail", message: issues.join(" "), fields, detail: detail as unknown as Record<string, unknown> }
}
