import { checkInvoiceArithmetic } from "@/lib/checks/arithmetic"
import { checkLineItemArithmetic } from "@/lib/checks/line-item-arithmetic"
import type { FieldCheck } from "./check-types"

/** Re-runs the pure numeric checks against the form's current values. Checks whose evidence is
 * server-side (matches, supplier history, PDF metadata, and so on) remain visible but become
 * explicitly stale after an edit rather than pretending the saved verdict describes new values. */
export function rebuildLiveChecks(checks: FieldCheck[], values: Record<string, unknown>, dirty: boolean): FieldCheck[] {
  const currencyCode = asString(values.currency_code)
  const lineItems = Array.isArray(values.line_items) ? values.line_items.map((item) => {
    const row = asRecord(item)
    return { quantity: asNumber(row?.quantity), unitPrice: asNumber(row?.unit_price), amount: asNumber(row?.amount) }
  }) : []

  return checks.flatMap((check) => {
    if (check.checkCode === "invoice_arithmetic") {
      const result = checkInvoiceArithmetic({
        currencyCode,
        subtotal: asNumber(values.subtotal),
        taxTotal: asNumber(values.tax_total),
        shippingTotal: asNumber(values.shipping_total),
        otherCharges: asCharges(values.other_charges),
        total: asNumber(values.total),
        lineItems,
      })
      return result ? [{ ...check, status: result.status, message: result.message, fields: result.fields ?? check.fields, detail: result.detail, stale: false }] : []
    }
    if (check.checkCode === "line_item_arithmetic") {
      const result = checkLineItemArithmetic({ currencyCode, lineItems })
      return result ? [{ ...check, status: result.status, message: result.message, fields: result.fields ?? check.fields, detail: result.detail, stale: false }] : []
    }
    return [{ ...check, stale: dirty }]
  })
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return null
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function asCharges(value: unknown): { amount: number | null }[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => ({ amount: asNumber(asRecord(item)?.amount) }))
}

const LINE_ITEM_CELL = /^(line_items|other_charges)\[(\d+)\]\[([a-z0-9_]+)\]$/

/** Reads only the scalar and line-item fields the arithmetic checks above compare, out of the
 * form's current (uncontrolled-input) values, keyed the same way rebuildLiveChecks expects.
 * Deliberately narrow rather than a general form-to-object parser — the full field set is
 * server-side's job (saveDocumentReviewAction); this only needs enough to recompute two checks
 * on every keystroke without turning every input into a controlled component. */
export function parseLiveCheckValues(formData: FormData): Record<string, unknown> {
  const values: Record<string, unknown> = {}
  const lineItems: Record<number, Record<string, unknown>> = {}
  const otherCharges: Record<number, Record<string, unknown>> = {}
  for (const [name, value] of formData.entries()) {
    if (typeof value !== "string") continue
    const match = name.match(LINE_ITEM_CELL)
    if (match) {
      const [, group, indexPart, key] = match
      const bucket = (group === "line_items" ? lineItems : otherCharges)
      const row = (bucket[Number(indexPart)] ||= {})
      row[key] = value
      continue
    }
    if (["subtotal", "tax_total", "shipping_total", "total", "currency_code"].includes(name)) values[name] = value
  }
  values.line_items = Object.keys(lineItems).map(Number).sort((a, b) => a - b).map((index) => lineItems[index])
  values.other_charges = Object.keys(otherCharges).map(Number).sort((a, b) => a - b).map((index) => otherCharges[index])
  return values
}
