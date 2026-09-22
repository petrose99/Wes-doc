/** #228 Q11 / Q13: what a `po_to_invoice` DocumentMatch means to the invoice it points at.
 *
 * - `confirmed` — a person confirmed it in Match manually (or replaced the PO with it).
 * - `auto` — the matcher found it and the invoice cites the same PO number, so the cells are
 *   compared without anyone confirming (the same standing #206 gave every match).
 * - `suggested` — the matcher found a likely PO but the invoice cites no PO number (or a
 *   different one). Shown as a dashed chip with the confidence; nothing is compared until it is
 *   confirmed, so the reviewer is never shown an `=` the system only guessed at.
 * - `rejected` — a person rejected it; it is kept for the audit trail and ignored everywhere.
 *
 * `compared` is the one question the check, the gate and the pane ask. */

export type PoLinkKind = "confirmed" | "auto" | "suggested" | "rejected"

export const CONFIRMED_MATCH_STATUS = "confirmed"
export const REJECTED_MATCH_STATUS = "rejected"

function normalizePoNumber(value: string | null | undefined): string | null {
  if (!value) return null
  const normalized = value.replace(/[^0-9a-z]/gi, "").toLowerCase()
  return normalized.length ? normalized : null
}

export function poLinkKind(input: { status: string; invoicePoNumber: string | null; poNumber: string | null }): PoLinkKind {
  if (input.status === REJECTED_MATCH_STATUS) return "rejected"
  if (input.status === CONFIRMED_MATCH_STATUS) return "confirmed"
  const cited = normalizePoNumber(input.invoicePoNumber)
  const actual = normalizePoNumber(input.poNumber)
  return cited !== null && actual !== null && cited === actual ? "auto" : "suggested"
}

export function isComparedLink(kind: PoLinkKind): boolean {
  return kind === "confirmed" || kind === "auto"
}

/** Ranks the matches on one invoice so "the" PO is stable: confirmed first, then auto, then the
 * most confident suggestion. Rejected links never win. */
export function rankPoLinks<T extends { kind: PoLinkKind; confidence: number }>(links: T[]): T[] {
  const order: Record<PoLinkKind, number> = { confirmed: 0, auto: 1, suggested: 2, rejected: 3 }
  return [...links].sort((a, b) => order[a.kind] - order[b.kind] || b.confidence - a.confidence)
}
