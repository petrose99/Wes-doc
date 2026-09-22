import { tokenSetRatio } from "@/lib/suppliers/normalize"

/** #228 / #250: the Line match — one invoice line against the PO line it is assigned to, cell by
 * cell. This is #206's internal best-line assignment made visible: the same description-similarity
 * guess (no item code / SKU exists in this schema), the same cumulative-consumption rule for
 * quantity, plus a unit-price comparison within the workspace match-variance percent. Pure — the
 * check (`lib/checks/po-line-consumption.ts`), the Detail pane's View PO row, the Purchase Orders
 * column's red count and the PO pane's Ordered / Invoiced / Remaining table all read from here so
 * a badge and a pane can never disagree (#228 Q5).
 *
 * A manual assignment (`lineAssignments` on `DocumentMatch`, #228 Q10) wins over the guess: a row
 * mapped to `null` is "No PO line" and is never judged. */

export const LINE_MATCH_THRESHOLD = 0.6

export type LineCellStatus = "match" | "mismatch" | "not_compared"

/** A Check status for one line (#228 Q3 — the words come from #233's vocabulary; "Not matched"
 * is the one state this surface adds: the line has no PO line at all). */
export type LineMatchStatus = "match" | "mismatch" | "not_compared" | "not_matched"

export type SiblingConsumption = { documentId: string; label: string; quantity: number }

export type LineMatch = {
  rowIndex: number
  /** The PO line this row is assigned to; null when no PO line is above the threshold or the
   * assignment was set to "No PO line" by hand. */
  poLineIndex: number | null
  /** True when `poLineIndex` came from `lineAssignments`, not the similarity guess. */
  assigned: boolean
  status: LineMatchStatus
  description: { status: LineCellStatus; invoice: string | null; po: string | null; similarity: number | null }
  quantity: {
    status: LineCellStatus
    invoice: number | null
    /** Ordered on the PO line. */
    po: number | null
    /** Every other invoice already consuming this PO line, named so the sentence can say so. */
    alreadyInvoiced: SiblingConsumption[]
    thisInvoice: number | null
    allowancePercent: number
    /** Ordered × (1 + allowance). */
    allowance: number | null
    /** Cumulative consumption over the allowance; 0 when inside it. */
    overBy: number | null
    /** Consumption over *ordered* as a percent, the number the sentence leads with. */
    overPercent: number | null
  }
  unitPrice: {
    status: LineCellStatus
    invoice: number | null
    po: number | null
    allowancePercent: number
    /** |invoice − po| / po as a percent. */
    variancePercent: number | null
  }
}

export type LineMatchInput = {
  poLineItems: Array<{ description: string | null; quantity: number | null; unitPrice: number | null }>
  /** Every line item from every invoice matched to this PO, including the one under review. */
  invoiceLineItems: Array<{ documentId: string; rowIndex: number; description: string | null; quantity: number | null; unitPrice: number | null }>
  currentDocumentId: string
  /** Quantity allowance over the ordered quantity, as a percent (5 = 5 % over is still fine). */
  quantityTolerancePercent: number
  /** Unit-price allowance either side of the PO price, as a percent (#228 Q12: the workspace
   * match-variance percent). */
  priceTolerancePercent: number
  /** `invoiceRow → poLineIndex | null` from `DocumentMatch.lineAssignments`. */
  lineAssignments?: Record<string, number | null> | null
  /** How to name a sibling invoice in the breakdown ("INV-2041"); falls back to the id. */
  siblingLabels?: Record<string, string>
}

export function bestPoLineIndex(description: string | null, poDescriptions: Array<string | null>): { index: number | null; similarity: number | null } {
  let bestIndex: number | null = null
  let bestScore = LINE_MATCH_THRESHOLD
  let seen: number | null = null
  poDescriptions.forEach((candidate, index) => {
    const score = tokenSetRatio(description, candidate)
    if (seen === null || score > seen) seen = score
    if (score > bestScore) { bestScore = score; bestIndex = index }
  })
  return { index: bestIndex, similarity: bestIndex === null ? seen : bestScore }
}

function round(value: number, places = 1): number {
  const factor = 10 ** places
  return Math.round(value * factor) / factor
}

/** Resolves every invoice line (from every matched invoice) to a PO line, honouring the manual
 * assignments for the invoice under review only — a sibling invoice's own assignments live on
 * its own DocumentMatch and are not this call's business. */
function resolveAssignment(input: LineMatchInput, item: LineMatchInput["invoiceLineItems"][number], poDescriptions: Array<string | null>) {
  const isCurrent = item.documentId === input.currentDocumentId
  const key = String(item.rowIndex)
  if (isCurrent && input.lineAssignments && Object.prototype.hasOwnProperty.call(input.lineAssignments, key)) {
    const assigned = input.lineAssignments[key]
    const index = typeof assigned === "number" && assigned >= 0 && assigned < poDescriptions.length ? assigned : null
    return { index, similarity: index === null ? null : tokenSetRatio(item.description, poDescriptions[index]), assigned: true }
  }
  const guess = bestPoLineIndex(item.description, poDescriptions)
  return { ...guess, assigned: false }
}

export function computeLineMatches(input: LineMatchInput): LineMatch[] {
  const poDescriptions = input.poLineItems.map((line) => line.description)
  const consumedByLine = new Map<number, number>()
  const siblingsByLine = new Map<number, SiblingConsumption[]>()
  const current: Array<{ item: LineMatchInput["invoiceLineItems"][number]; index: number | null; similarity: number | null; assigned: boolean }> = []

  for (const item of input.invoiceLineItems) {
    const resolved = resolveAssignment(input, item, poDescriptions)
    if (item.documentId === input.currentDocumentId) current.push({ item, ...resolved })
    if (resolved.index === null || item.quantity === null) continue
    consumedByLine.set(resolved.index, (consumedByLine.get(resolved.index) ?? 0) + item.quantity)
    if (item.documentId !== input.currentDocumentId) {
      const list = siblingsByLine.get(resolved.index) ?? []
      const existing = list.find((entry) => entry.documentId === item.documentId)
      if (existing) existing.quantity += item.quantity
      else list.push({ documentId: item.documentId, label: input.siblingLabels?.[item.documentId] ?? item.documentId.slice(0, 8), quantity: item.quantity })
      siblingsByLine.set(resolved.index, list)
    }
  }

  return current
    .sort((a, b) => a.item.rowIndex - b.item.rowIndex)
    .map(({ item, index, similarity, assigned }) => {
      const poLine = index === null ? null : input.poLineItems[index]
      const description: LineMatch["description"] = {
        status: poLine ? "match" : "not_compared",
        invoice: item.description, po: poLine?.description ?? null, similarity,
      }

      let quantity: LineMatch["quantity"] = {
        status: "not_compared", invoice: item.quantity, po: poLine?.quantity ?? null,
        alreadyInvoiced: index === null ? [] : siblingsByLine.get(index) ?? [],
        thisInvoice: item.quantity, allowancePercent: input.quantityTolerancePercent, allowance: null, overBy: null, overPercent: null,
      }
      if (poLine && poLine.quantity !== null && item.quantity !== null && index !== null) {
        const consumed = consumedByLine.get(index) ?? 0
        const allowance = poLine.quantity * (1 + input.quantityTolerancePercent / 100)
        const overBy = Math.max(0, consumed - allowance)
        const overPercent = poLine.quantity > 0 ? round(((consumed - poLine.quantity) / poLine.quantity) * 100) : null
        quantity = { ...quantity, status: consumed > allowance ? "mismatch" : "match", allowance: round(allowance, 4), overBy: round(overBy, 4), overPercent }
      }

      let unitPrice: LineMatch["unitPrice"] = { status: "not_compared", invoice: item.unitPrice, po: poLine?.unitPrice ?? null, allowancePercent: input.priceTolerancePercent, variancePercent: null }
      if (poLine && poLine.unitPrice !== null && item.unitPrice !== null) {
        const variancePercent = poLine.unitPrice === 0
          ? (item.unitPrice === 0 ? 0 : Infinity)
          : round((Math.abs(item.unitPrice - poLine.unitPrice) / Math.abs(poLine.unitPrice)) * 100, 2)
        unitPrice = { ...unitPrice, status: variancePercent > input.priceTolerancePercent ? "mismatch" : "match", variancePercent: Number.isFinite(variancePercent) ? variancePercent : null }
      }

      const status: LineMatchStatus = !poLine ? "not_matched"
        : quantity.status === "mismatch" || unitPrice.status === "mismatch" ? "mismatch"
          : quantity.status === "match" || unitPrice.status === "match" ? "match"
            : "not_compared"

      return { rowIndex: item.rowIndex, poLineIndex: index, assigned, status, description, quantity, unitPrice }
    })
}

/** #228 Q5: the number of `≠` glyphs the reviewer will see on opening the row — one per failing
 * cell, plus one for the Total when the match-variance gate is open. */
export function countMismatchGlyphs(lines: LineMatch[], gateOpen: boolean): number {
  let count = 0
  for (const line of lines) {
    if (line.quantity.status === "mismatch") count++
    if (line.unitPrice.status === "mismatch") count++
  }
  return count + (gateOpen ? 1 : 0)
}

const percent = (value: number) => `${Number.isInteger(value) ? value : value.toFixed(1)} %`

/** #228 Q4: the sentence comes before the numbers. Written once here so the check message, the
 * breakdown popover and the sr-only description read the same words. */
export function quantitySentence(line: LineMatch): string | null {
  const q = line.quantity
  if (q.status === "not_compared") return q.po === null && line.poLineIndex !== null ? "The PO line has no quantity, so this cell is not compared." : null
  if (q.status === "match") return `Invoiced quantity is within what was ordered${q.allowancePercent > 0 ? ` (the workspace allows ${percent(q.allowancePercent)} over)` : ""}.`
  const others = q.alreadyInvoiced
  const lead = q.overPercent !== null ? `Invoiced quantity is ${percent(q.overPercent)} over what was ordered` : "Invoiced quantity is over what was ordered"
  const tail = q.allowancePercent > 0 ? `; the workspace allows ${percent(q.allowancePercent)}.` : "."
  if (others.length) return `${lead} once ${others.map((s) => s.label).join(", ")} ${others.length === 1 ? "is" : "are"} counted${tail}`
  return `${lead}${tail}`
}

export function unitPriceSentence(line: LineMatch): string | null {
  const p = line.unitPrice
  if (p.status === "not_compared") return p.po === null && line.poLineIndex !== null ? "The PO line has no unit price, so this cell is not compared." : null
  const v = p.variancePercent ?? 0
  if (p.status === "match") return `Unit price is within ${percent(p.allowancePercent)} of the PO price.`
  return `Unit price is ${percent(v)} off the PO price; the workspace allows ${percent(p.allowancePercent)}.`
}

export function descriptionSentence(line: LineMatch): string {
  if (line.poLineIndex === null) return "No PO line is similar enough to this description, so the line is not compared."
  const similarity = line.description.similarity === null ? null : Math.round(line.description.similarity * 100)
  return line.assigned
    ? `Matched to this PO line by hand${similarity !== null ? ` (${similarity} % similar)` : ""}.`
    : `Matched to the most similar PO line${similarity !== null ? ` (${similarity} % similar)` : ""}.`
}

export function parseLineAssignments(value: unknown): Record<string, number | null> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const out: Record<string, number | null> = {}
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!/^\d+$/.test(key)) continue
    if (raw === null) out[key] = null
    else if (typeof raw === "number" && Number.isInteger(raw) && raw >= 0) out[key] = raw
  }
  return out
}
