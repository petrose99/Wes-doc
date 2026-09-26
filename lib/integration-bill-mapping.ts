/** Provider-agnostic normalization of a reviewed document into a bill shape, shared by both
 * QuickBooks and Xero. Pure: takes the document's already-reviewed data and returns a plain object
 * neither provider's SDK/API knows about yet — lib/integrations/{quickbooks,xero}/bill-mapper.ts each
 * take this and produce the exact provider request body.
 *
 * Field names mirror the finance domain pack (lib/domains/finance.ts): invoice uses vendor/
 * invoice_number/issue_date/due_date, receipt uses merchant/receipt_number/purchase_date (no
 * due_date — a receipt is already paid). Both share total and line_items. */
import type { BillCoding, LineCoding, TaxBasis } from "@/lib/finance/line-coding"

export type NormalizedLineItem = {
  description: string
  quantity: number
  unitPrice: number
  amount: number
  /** #429: the ledger account this line posts to, resolved supplier rule → connection Default
   * (lib/finance/line-account-resolution.ts) and carried on Document.codingData.items per line.
   * Null when no rule and no Default have resolved yet — a line in that state is a mapping error
   * at push time (BillMappingError), not a silent post to nothing. */
  accountExternalId: string | null
  /** ADR 0014: the rest of the line's coding as Save review resolved it (codingData.items[i]).
   * Tracking carries its names, resolved when the snapshot is taken, so a retry resends exactly
   * what was checked even if the option is renamed in the ledger meanwhile. */
  taxCode: string | null
  tracking: { categoryId: string; categoryName: string; optionId: string; optionName: string }[]
  customer: string | null
  billable: boolean
  /** #459: the item this line resolved to (item-line-resolution.ts), carried on codingData.items
   * per line same as accountExternalId — null for an ordinary account line. */
  itemExternalId: string | null
}

export type NormalizedBill = {
  /** ADR 0014: the bill's Tax basis and Location (codingData), and the invoice's own subtotal and
   * VAT (after fxOverride's scaling) — what the push gate and the mappers read. */
  taxBasis: TaxBasis | null
  location: string | null
  subtotal: number | null
  taxTotal: number | null
  documentId: string
  filename: string
  vendorName: string
  referenceNumber: string | null
  issueDate: string | null
  dueDate: string | null
  total: number
  lineItems: NormalizedLineItem[]
  currencyCode: string | null
}

export class BillMappingError extends Error {}

type ReviewedLineItem = { description?: unknown; quantity?: unknown; unit_price?: unknown; amount?: unknown }

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function asCurrencyCode(value: unknown): string | null {
  const code = asString(value)?.toUpperCase() ?? null
  return code && /^[A-Z]{3}$/.test(code) ? code : null
}

/** `lineAccounts[i]` is Document.codingData.items[i] (#429) — same array, same index, as the raw
 * `line_items` rows this function reads, matched BEFORE the zero-amount filter below so a filtered
 * row never shifts a later row onto the wrong account. Optional: a document coded before #429, or
 * with no connection to resolve against, has no items array, so every line's accountExternalId is
 * null (bill-mapper.ts / xero's mapper refuse a post with a null account, per spec). */
type CodingRow = { account_external_id: string | null; item_external_id?: string | null } & Partial<LineCoding>

function lineCoding(row: CodingRow | undefined, names: Record<string, string>) {
  const tracking = (row?.tracking ?? []).map((t) => ({ categoryId: t.category_id, categoryName: names[t.category_id] ?? t.category_id, optionId: t.option_id, optionName: names[`${t.category_id}:${t.option_id}`] ?? t.option_id }))
  return { accountExternalId: row?.account_external_id ?? null, taxCode: row?.tax_code ?? null, tracking, customer: row?.customer ?? null, billable: row?.billable === true, itemExternalId: row?.item_external_id ?? null }
}

function normalizeLineItems(raw: unknown, total: number, lineAccounts: Array<CodingRow | undefined> | undefined, names: Record<string, string>): NormalizedLineItem[] {
  const rows = Array.isArray(raw) ? (raw as ReviewedLineItem[]) : []
  const items = rows
    .map((row, index) => {
      const amount = asNumber(row.amount) ?? 0
      const quantity = asNumber(row.quantity) ?? 1
      const unitPrice = asNumber(row.unit_price) ?? (quantity ? amount / quantity : amount)
      return { description: asString(row.description) ?? "Line item", quantity, unitPrice, amount, ...lineCoding(lineAccounts?.[index], names) }
    })
    .filter((item) => item.amount !== 0 || item.description !== "Line item")
  // No usable line items — synthesize one that covers the whole total, so the provider's bill body
  // (which requires at least one line) always has something to post. No single line to key off of
  // for its coding, so this synthesized line takes the first row with a resolved account, if any.
  if (!items.length) {
    // #459: a synthesized whole-bill line has no single line item to attribute an Item to —
    // falls back to account only, never an item, even if the donor row happened to carry one.
    const fallback = lineCoding(lineAccounts?.find((row) => row?.account_external_id), names)
    return [{ description: "Total", quantity: 1, unitPrice: total, amount: total, ...fallback, itemExternalId: null }]
  }
  return items
}

/** A7.3: makes the pushed lines sum EXACTLY to the header total when the difference is plain
 * per-line rounding, so the provider never rejects (or silently adjusts) a bill over a stray
 * cent. Every amount is first rounded to the currency's minor unit; any residual against the
 * header total is then allocated by largest remainder — one minor unit per line, biggest
 * pre-rounding fractional loser first — but ONLY when the residual is small enough to actually
 * be rounding (≤ one minor unit per line). A larger discrepancy is a real extraction problem
 * that must stay visible to the arithmetic check, not be silently "fixed" here. */
export function reconcileLineItemRounding(items: NormalizedLineItem[], total: number, currencyCode: string | null): NormalizedLineItem[] {
  if (!items.length) return items
  // Zero-decimal currencies (JPY & co) round to whole units; everything else to cents. Mirrors
  // lib/checks/types.ts's amountTolerance cutoff without importing its private currency set.
  const zeroDecimal = ["JPY", "KRW", "VND", "CLP", "ISK", "UGX", "XOF", "XAF"].includes((currencyCode ?? "").toUpperCase())
  const unit = zeroDecimal ? 1 : 0.01
  const toMinor = (value: number) => Math.round(value / unit)

  const rounded = items.map((item) => ({ ...item, amount: toMinor(item.amount) * unit }))
  const residualMinor = toMinor(total) - rounded.reduce((sum, item) => sum + toMinor(item.amount), 0)
  if (residualMinor === 0) return rounded
  if (Math.abs(residualMinor) > items.length) return rounded

  // Largest remainder: the lines that lost the most in rounding (or gained the most, when the
  // residual is negative) absorb one minor unit each.
  const order = items
    .map((item, index) => ({ index, remainder: item.amount / unit - Math.floor(item.amount / unit) }))
    .sort((a, b) => (residualMinor > 0 ? b.remainder - a.remainder : a.remainder - b.remainder))
  const step = residualMinor > 0 ? 1 : -1
  for (let i = 0; i < Math.abs(residualMinor); i++) {
    const target = order[i % order.length].index
    rounded[target] = { ...rounded[target], amount: toMinor(rounded[target].amount + step * unit) * unit }
  }
  return rounded
}

/** Reads vendor/invoice or merchant/receipt fields off a reviewed document and produces a single
 * normalized bill. Throws BillMappingError if there is no total — a bill with no amount is not a
 * bill a provider can create, and this is the one case scope explicitly says to refuse rather than
 * guess. `reviewedData` is expected to be the document's reviewedData (falling back to rawExtraction
 * is the caller's job, matching lib/document-export.ts's convention).
 *
 * `fxOverride` swaps the bill's amount and currency to the workspace's base currency BEFORE the
 * line-item rounding runs, so the pushed bill's lines sum EXACTLY to the converted total in the
 * currency the ledger actually books at. When omitted, the bill goes out in the document's own
 * extracted currency (the pre-FX behaviour). Callers pass it in whenever the document has a
 * successful conversion (baseCurrencyTotal + fxRate); a document whose conversion is still
 * pending (currency ≠ base but no baseCurrencyTotal yet) is expected to be refused UPSTREAM
 * rather than pushed with a mismatched number. */
export function normalizeBillFromDocument(input: {
  documentId: string
  filename: string
  templateCode: string | null
  reviewedData: Record<string, unknown>
  fxOverride?: { total: number; currencyCode: string } | null
  /** #429: Document.codingData.items — one row per line_items row, same index, carrying the
   * account each line resolved to (lib/finance/line-account-resolution.ts). Omitted for a
   * document with no per-line resolution yet (pre-#429, or no connection) — every line's
   * accountExternalId is then null. */
  lineAccounts?: Array<CodingRow | undefined> | null
  /** ADR 0014: codingData's bill-level Location and Tax basis. */
  billCoding?: Partial<Pick<BillCoding, "location" | "tax_basis">> | null
  /** Tracking display names (loadLineCodingContext): a category by id, an option by `category:option`. */
  names?: Record<string, string>
}): NormalizedBill {
  const data = input.reviewedData
  const vendorName = asString(data.vendor) ?? asString(data.merchant) ?? "Unknown vendor"
  const referenceNumber = asString(data.invoice_number) ?? asString(data.receipt_number)
  const issueDate = asString(data.issue_date) ?? asString(data.purchase_date)
  // Receipts have no due_date field at all (already paid) — only read it for invoices.
  const dueDate = input.templateCode === "receipt" ? null : asString(data.due_date)
  const extractedTotal = asNumber(data.total)
  if (extractedTotal === null) throw new BillMappingError("bill_missing_total")
  const extractedCurrency = asCurrencyCode(data.currency_code)
  const total = input.fxOverride?.total ?? extractedTotal
  const currencyCode = input.fxOverride?.currencyCode ?? extractedCurrency
  // When converting to a different currency, scale each line item by the same ratio the total
  // was scaled by, then let reconcileLineItemRounding push any residual back into the largest
  // lines so they sum exactly to the converted header total. Without the scaling step the
  // reconciler would try to close a 20%+ gap in one-cent-per-line increments, which either loops
  // for thousands of lines or produces obviously-wrong per-line amounts.
  const taxBasis = input.billCoding?.tax_basis ?? null
  const extractedSubtotal = asNumber(data.subtotal)
  const extractedTaxTotal = asNumber(data.tax_total)
  // Exclusive lines are net of VAT, so they add up to the subtotal; the ledger adds the VAT on top.
  const linesTarget = taxBasis === "exclusive" && extractedSubtotal !== null ? extractedSubtotal : extractedTotal
  const rawItems = normalizeLineItems(data.line_items, linesTarget, input.lineAccounts ?? undefined, input.names ?? {})
  const ratio = extractedTotal !== 0 ? total / extractedTotal : 1
  const scale = (value: number | null) => (value === null ? null : Math.round(value * ratio * 100) / 100)
  const scaledItems = rawItems.map((item) => ({ ...item, unitPrice: item.unitPrice * ratio, amount: item.amount * ratio }))
  const lineItems = reconcileLineItemRounding(scaledItems, linesTarget * ratio, currencyCode)
  return {
    taxBasis,
    location: input.billCoding?.location ?? null,
    subtotal: scale(extractedSubtotal),
    taxTotal: scale(extractedTaxTotal),
    documentId: input.documentId,
    filename: input.filename,
    vendorName,
    referenceNumber,
    issueDate,
    dueDate,
    total,
    lineItems,
    currencyCode,
  }
}
