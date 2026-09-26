/** #463 Q2: a credit note's printed total is sometimes shown negative on the source document, but
 * DocuBite stores the printed magnitude under either doc type — the type itself carries the
 * direction, not the sign. Called once at the post-extraction merge point
 * (lib/document-processing.ts) and again on a reclassify that crosses invoice ↔ credit_note
 * (app/(app)/workspaces/[workspaceId]/actions.ts). Pure, no I/O. */

const AMOUNT_FIELDS = ["total", "subtotal", "tax_total", "shipping_total"] as const

function absIfNumber(value: unknown): unknown {
  return typeof value === "number" && Number.isFinite(value) ? Math.abs(value) : value
}

export function normalizeCreditNoteSign(extraction: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...extraction }
  for (const field of AMOUNT_FIELDS) {
    if (field in out) out[field] = absIfNumber(out[field])
  }
  if (Array.isArray(out.line_items)) {
    out.line_items = out.line_items.map((item) => {
      if (!item || typeof item !== "object") return item
      const line = item as Record<string, unknown>
      return { ...line, amount: absIfNumber(line.amount), unit_price: absIfNumber(line.unit_price) }
    })
  }
  return out
}
