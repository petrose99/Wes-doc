import { tokenSetRatio } from "@/lib/suppliers/normalize"
import type { CheckResult } from "@/lib/checks/types"

/** #206 (map #177's ticket 15): per-line-consumption of a PO against every invoice matched to it.
 * Per-line pairing (invoice line N ↔ PO line N) is explicitly out of scope — a second matching
 * engine. Instead, each invoice line is assigned to its best-matching PO line by description
 * similarity (no item code/SKU exists in this schema), quantities from every matched invoice are
 * summed per PO line, and the group is flagged only once cumulative consumption exceeds the
 * ordered quantity by more than the workspace's tolerance. A description with no PO-line match
 * above MATCH_THRESHOLD is not judged — an unmatched item is a matching problem, not a
 * consumption one, and inventing a comparison would teach the reviewer to distrust the check. */

const MATCH_THRESHOLD = 0.6

export type PoLineConsumptionInput = {
  poLineItems: Array<{ description: string | null; quantity: number | null }>
  /** Every line item from every invoice matched to this PO, including the invoice under review —
   * tagged with the source document so the message can name where the overage came from. */
  invoiceLineItems: Array<{ documentId: string; rowIndex: number; description: string | null; quantity: number | null }>
  /** Acceptable overage over the ordered quantity, as a percentage (5 = 5% over is still fine). */
  tolerancePercent: number
  /** The document under review — only its own line items are addressed in `fields`, so a
   * mismatch surfaced while reviewing one invoice never points the reviewer at another
   * document's cells. */
  currentDocumentId: string
}

function bestPoLineIndex(description: string | null, poDescriptions: Array<string | null>): number | null {
  let bestIndex: number | null = null
  let bestScore = MATCH_THRESHOLD
  poDescriptions.forEach((candidate, index) => {
    const score = tokenSetRatio(description, candidate)
    if (score > bestScore) { bestScore = score; bestIndex = index }
  })
  return bestIndex
}

export function checkPoLineConsumption(input: PoLineConsumptionInput): CheckResult | null {
  const poDescriptions = input.poLineItems.map((item) => item.description)
  const consumedByLine = new Map<number, number>()
  const contributingRowsByLine = new Map<number, number[]>()

  for (const item of input.invoiceLineItems) {
    if (item.quantity === null) continue
    const lineIndex = bestPoLineIndex(item.description, poDescriptions)
    if (lineIndex === null) continue
    consumedByLine.set(lineIndex, (consumedByLine.get(lineIndex) ?? 0) + item.quantity)
    if (item.documentId === input.currentDocumentId) {
      const rows = contributingRowsByLine.get(lineIndex) ?? []
      rows.push(item.rowIndex)
      contributingRowsByLine.set(lineIndex, rows)
    }
  }

  const issues: string[] = []
  const fields = new Set<string>()

  input.poLineItems.forEach((poLine, index) => {
    if (poLine.quantity === null) return
    const consumed = consumedByLine.get(index)
    if (consumed === undefined) return
    const allowance = poLine.quantity * (1 + input.tolerancePercent / 100)
    if (consumed <= allowance) return
    const rows = contributingRowsByLine.get(index)
    if (!rows?.length) return // this invoice's own lines didn't push it over — not this document's problem to flag
    issues.push(`"${poLine.description ?? `PO line ${index + 1}`}": ordered ${poLine.quantity}, invoiced ${consumed} across matched invoices (tolerance ${input.tolerancePercent}%)`)
    for (const row of rows) fields.add(`line_items[${row}].quantity`)
  })

  if (!issues.length) return null
  return { checkCode: "po_line_consumption", status: "fail", message: issues.join("; "), fields: [...fields] }
}
