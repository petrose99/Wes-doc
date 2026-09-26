/** ADR 0014: whether the ledger can take a bill's coding — each line's Tax code, Tracking,
 * Customer and Billable, the bill's Location and Tax basis. One pure function over one input
 * shape, read three ways: the document's persisted Checks (models/document-checks.ts), the fresh
 * push-eligibility reason, and the push gate over the snapshot (lib/integration-push.ts). Every
 * result is a "fail" — a value the ledger can't take is never dropped silently, nothing posts. A
 * clean bill returns []; the caller clears any earlier fail. */
import { PROVIDER_LABELS } from "@/lib/checks/ledger-currency"
import { amountTolerance, type CheckResult } from "@/lib/checks/types"
import { formatCurrency } from "@/lib/money"
import type { CodingReferences, TaxBasis, TrackingSelection } from "@/lib/finance/line-coding"
import type { LedgerCapabilities } from "@/lib/integrations/ledger-capabilities"

export type LineCodingInput = {
  provider: string
  capabilities: LedgerCapabilities
  /** The ledger's active references (codingReferencesFrom). */
  references: CodingReferences
  /** Purchase rate percent per Tax code; null or absent when the ledger didn't say. */
  taxRates: Record<string, number | null>
  /** Display names: a Tracking category by its id, an option by `category:option`. */
  names: Record<string, string>
  lines: { amount: number; tax_code: string | null; tracking: TrackingSelection[]; customer: string | null; billable: boolean; item_external_id: string | null; quantity: number }[]
  bill: { location: string | null; tax_basis: TaxBasis | null; tax_total: number | null; currency: string | null }
}

export const LINE_CODING_CHECK_CODES = [
  "vat_off_in_quickbooks", "tax_code_not_in_ledger", "tax_code_missing", "tracking_off_in_ledger", "tracking_option_not_in_ledger",
  "ledger_has_no_location", "ledger_cannot_take_customer", "billable_off_in_quickbooks", "billable_needs_customer",
  "tax_basis_unclear", "vat_mismatch_invoice", "item_lines_not_supported", "item_not_in_ledger", "item_quantity_needed",
] as const

export function checkLineCoding(input: LineCodingInput): CheckResult[] {
  const { capabilities: cap, references, lines, bill } = input
  const ledger = PROVIDER_LABELS[input.provider] ?? input.provider
  const results: CheckResult[] = []
  const fail = (checkCode: (typeof LINE_CODING_CHECK_CODES)[number], message: string, text: string, fields: string[], extraDetail?: Record<string, unknown>) =>
    results.push({ checkCode, status: "fail", message, fields, detail: { text, ...extraDetail } })
  const linesWhere = (field: string, test: (line: LineCodingInput["lines"][number]) => boolean) =>
    lines.flatMap((line, index) => (test(line) ? [`line_items[${index}].${field}`] : []))

  if (!cap.vat) {
    const held = linesWhere("tax_code", (line) => Boolean(line.tax_code))
    if (held.length && input.provider === "quickbooks") fail("vat_off_in_quickbooks", "VAT is off in QuickBooks", "Turn VAT on in QuickBooks and sync accounts, or save review to clear the Tax codes.", held)
  } else {
    const unknown = linesWhere("tax_code", (line) => Boolean(line.tax_code) && !references.taxCodes.has(line.tax_code as string))
    if (unknown.length) fail("tax_code_not_in_ledger", `Tax code not in ${ledger}`, `Set a purchase tax code on the line's account in ${ledger}, sync accounts, then save review.`, unknown)
    const missing = linesWhere("tax_code", (line) => !line.tax_code)
    if (missing.length) fail("tax_code_missing", "Tax code missing", `Set a default tax code on the line's account in ${ledger}, sync accounts, then save review.`, missing)
  }

  const offered = new Set(cap.tracking.map((category) => category.id))
  const heldOff = lines.flatMap((line) => line.tracking).find((t) => !offered.has(t.category_id))
  if (heldOff) {
    const category = input.names[heldOff.category_id] ?? "Tracking"
    fail("tracking_off_in_ledger", `${category} tracking is off in ${ledger}`, `Turn ${category} tracking on in ${ledger} and sync accounts, or save review to clear it.`,
      linesWhere("tracking", (line) => line.tracking.some((t) => !offered.has(t.category_id))))
  }
  const optionGone = (t: TrackingSelection) => offered.has(t.category_id) && !references.trackingOptions.has(`${t.category_id}:${t.option_id}`)
  const heldGone = lines.flatMap((line) => line.tracking).find(optionGone)
  if (heldGone) {
    const option = input.names[`${heldGone.category_id}:${heldGone.option_id}`] ?? heldGone.option_id
    fail("tracking_option_not_in_ledger", `${option} isn't in ${ledger}`, `Restore ${option} in ${ledger} and sync accounts, or save review to clear it.`, linesWhere("tracking", (line) => line.tracking.some(optionGone)))
  }

  if (bill.location && !cap.location) fail("ledger_has_no_location", `${ledger} has no Location`, `Turn on Locations in ${ledger} and sync accounts, or save review to clear it.`, ["location"])
  const customers = linesWhere("customer", (line) => Boolean(line.customer))
  if (customers.length && !cap.customer) fail("ledger_cannot_take_customer", `${ledger} can't take a Customer`, "Save review to clear the Customer.", customers)
  const billable = linesWhere("billable", (line) => line.billable)
  if (billable.length && !cap.billable && input.provider === "quickbooks") fail("billable_off_in_quickbooks", "Billable is off in QuickBooks", "Turn on billable expenses in QuickBooks and sync accounts.", billable)
  const orphaned = linesWhere("billable", (line) => line.billable && !line.customer)
  if (orphaned.length) fail("billable_needs_customer", "Billable needs a Customer", "Save review to clear Billable.", orphaned)

  // #459: item lines, always a fail (never a silent post to nothing) — never mutually exclusive
  // with the coding checks above, since an item line can still carry a Tax code/Tracking of its own.
  if (!cap.itemLines) {
    const held = linesWhere("item_external_id", (line) => Boolean(line.item_external_id))
    if (held.length) {
      // #460 (UI, out of scope here): the bound action clears the item and keeps the item's own
      // account, via setLineToAccount — never automatic.
      fail("item_lines_not_supported", `${ledger} can't take item lines`, "Code this line to an account instead, or upgrade the plan and sync accounts.", held,
        { actionLabel: "Code to the item's account instead", actionCode: "code_to_item_account" })
    }
  } else {
    const gone = lines.find((line) => line.item_external_id && !references.items.has(line.item_external_id))
    if (gone) {
      const item = input.names[gone.item_external_id as string] ?? "That item"
      fail("item_not_in_ledger", `${item} isn't in ${ledger}`, `Restore ${item} in ${ledger} and sync accounts, or save review to code this line to an account instead.`,
        linesWhere("item_external_id", (line) => Boolean(line.item_external_id) && !references.items.has(line.item_external_id as string)))
    }
    const needsQuantity = lines.find((line) => line.item_external_id && references.items.get(line.item_external_id)?.trackedInventory && !line.quantity)
    if (needsQuantity) {
      const item = input.names[needsQuantity.item_external_id as string] ?? "that item"
      fail("item_quantity_needed", `Quantity needed for ${item}`, `Enter the quantity for ${item} on this line, then save review.`,
        linesWhere("item_external_id", (line) => Boolean(line.item_external_id) && references.items.get(line.item_external_id as string)?.trackedInventory === true && !line.quantity))
    }
  }

  if (!bill.tax_basis) {
    fail("tax_basis_unclear", "Tax basis unclear", "Check the subtotal, VAT and total on the document match its lines, then save review.", ["subtotal", "tax_total", "total"])
  } else if (cap.vat && bill.tax_basis !== "none" && bill.tax_total !== null) {
    // Only when every line's rate is known: a missing or unknown code is its own Check above.
    const rates = lines.map((line) => (line.tax_code ? input.taxRates[line.tax_code] : null))
    if (rates.every((rate) => typeof rate === "number")) {
      const vat = lines.reduce((sum, line, index) => {
        const rate = rates[index] as number
        return sum + (bill.tax_basis === "exclusive" ? (line.amount * rate) / 100 : (line.amount * rate) / (100 + rate))
      }, 0)
      if (Math.abs(vat - bill.tax_total) > Math.max(amountTolerance(bill.currency), 0.01 * lines.length)) {
        fail("vat_mismatch_invoice", "VAT won't match the invoice", `Check the VAT on the document, and each line's account's tax code in ${ledger}.`, ["tax_total"])
      }
    }
  }
  return results
}

/** The same instructional text as `checkLineCoding`'s and `ledgerReadBackChecks`'s `detail.text`,
 * generalised for the push-failure toast (action-helpers.ts BILLING_MESSAGES) which only has the
 * error code — never the ledger/category/option names this module fills in per bill. Kept here,
 * not copy-pasted, so the wording can only drift by editing this file. */
export const LINE_CODING_FALLBACK_TEXT: Record<(typeof LINE_CODING_CHECK_CODES)[number] | "ledger_vat_differs" | "ledger_warnings", string> = {
  vat_off_in_quickbooks: "Turn VAT on in QuickBooks and sync accounts, or save review to clear the Tax codes.",
  tax_code_not_in_ledger: "Set a purchase tax code on the line's account in your ledger, sync accounts, then save review.",
  tax_code_missing: "Set a default tax code on the line's account in your ledger, sync accounts, then save review.",
  tracking_off_in_ledger: "Turn that tracking on in your ledger and sync accounts, or save review to clear it.",
  tracking_option_not_in_ledger: "Restore that tracking option in your ledger and sync accounts, or save review to clear it.",
  ledger_has_no_location: "Turn on Locations in your ledger and sync accounts, or save review to clear it.",
  ledger_cannot_take_customer: "Save review to clear the Customer.",
  billable_off_in_quickbooks: "Turn on billable expenses in QuickBooks and sync accounts.",
  billable_needs_customer: "Save review to clear Billable.",
  tax_basis_unclear: "Check the subtotal, VAT and total on the document match its lines, then save review.",
  vat_mismatch_invoice: "Check the VAT on the document, and each line's account's tax code in your ledger.",
  item_lines_not_supported: "Code this line to an account instead, or upgrade the plan and sync accounts.",
  item_not_in_ledger: "Restore that item in your ledger and sync accounts, or save review to code this line to an account instead.",
  item_quantity_needed: "Enter the quantity for that item on this line, then save review.",
  ledger_vat_differs: "Open the bill in your ledger and check each line's tax code against the invoice.",
  ledger_warnings: "Open the bill in your ledger and check what it flagged.",
}

/** ADR 0014: what the ledger said back after a bill posted — its own VAT against the invoice's,
 * and the first warning it raised. Both are "warn": the bill is already in the ledger, so these
 * point the reviewer at it rather than block anything. */
export function ledgerReadBackChecks(
  provider: string,
  bill: { taxBasis: TaxBasis | null; taxTotal: number | null; currencyCode: string | null },
  readBack: { totalTax: number | null; warnings: string[] },
): CheckResult[] {
  const ledger = PROVIDER_LABELS[provider] ?? provider
  const results: CheckResult[] = []
  const { totalTax } = readBack
  if (bill.taxBasis && bill.taxBasis !== "none" && bill.taxTotal !== null && totalTax !== null && Math.abs(totalTax - bill.taxTotal) > amountTolerance(bill.currencyCode)) {
    const message = `${ledger} worked out VAT of ${formatCurrency(totalTax, bill.currencyCode)}; the invoice says ${formatCurrency(bill.taxTotal, bill.currencyCode)}`
    results.push({ checkCode: "ledger_vat_differs", status: "warn", message, fields: ["tax_total"], detail: { text: `Open the bill in ${ledger} and check each line's tax code against the invoice.` } })
  }
  if (readBack.warnings[0]) {
    results.push({ checkCode: "ledger_warnings", status: "warn", message: `${ledger} flagged this bill: ${readBack.warnings[0]}`, detail: { text: `Open the bill in ${ledger} and check what it flagged.` } })
  }
  return results
}

const asNumber = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null)
const asString = (value: unknown) => (typeof value === "string" && value ? value : null)
const asTracking = (value: unknown): TrackingSelection[] =>
  Array.isArray(value) ? value.filter((t) => t && typeof t.category_id === "string" && typeof t.option_id === "string").map((t) => ({ category_id: t.category_id, option_id: t.option_id })) : []

/** The document path: `codingData.items[i]` beside `reviewedData.line_items[i]`. Null when Save
 * review hasn't resolved any coding rows yet — there is nothing the ledger could refuse. */
export function lineCodingInputFromDocument(doc: { codingData: unknown; reviewedData: unknown }): Pick<LineCodingInput, "lines" | "bill"> | null {
  const coding = (doc.codingData ?? {}) as Record<string, unknown>
  const data = (doc.reviewedData ?? {}) as Record<string, unknown>
  if (!Array.isArray(coding.items) || !coding.items.length) return null
  const reviewedLines = Array.isArray(data.line_items) ? (data.line_items as Array<Record<string, unknown> | null>) : []
  const lines = (coding.items as Array<Record<string, unknown> | null>).map((item, index) => ({
    amount: asNumber(reviewedLines[index]?.amount) ?? 0,
    tax_code: asString(item?.tax_code),
    tracking: asTracking(item?.tracking),
    customer: asString(item?.customer),
    billable: item?.billable === true,
    item_external_id: asString(item?.item_external_id),
    quantity: asNumber(reviewedLines[index]?.quantity) ?? 0,
  }))
  const basis = coding.tax_basis
  return {
    lines,
    bill: {
      location: asString(coding.location),
      tax_basis: basis === "inclusive" || basis === "exclusive" || basis === "none" ? basis : null,
      tax_total: asNumber(data.tax_total),
      currency: asString(data.currency_code),
    },
  }
}

/** The push path's fresh judgement (selection eligibility, a single push): the document's first
 * fail over the ledger context loaded now, never the persisted Check rows a sync may have
 * outdated. Null with no context (capabilities never read — the push gate reads them before
 * anything posts) or nothing resolved to judge. */
export function firstLineCodingFail(context: Omit<LineCodingInput, "lines" | "bill"> | null, doc: { codingData: unknown; reviewedData: unknown }): CheckResult | null {
  const input = context && lineCodingInputFromDocument(doc)
  return (context && input && checkLineCoding({ ...context, ...input })[0]) || null
}

/** The snapshot path: the persisted push payload (NormalizedBill) read back into the same shape. */
export function lineCodingInputFromBill(bill: {
  taxBasis: TaxBasis | null; location: string | null; taxTotal: number | null; currencyCode: string | null
  lineItems: { amount: number; taxCode: string | null; tracking: { categoryId: string; optionId: string }[]; customer: string | null; billable: boolean; itemExternalId: string | null; quantity: number }[]
}): Pick<LineCodingInput, "lines" | "bill"> {
  return {
    lines: bill.lineItems.map((line) => ({
      amount: line.amount,
      tax_code: line.taxCode,
      tracking: line.tracking.map((t) => ({ category_id: t.categoryId, option_id: t.optionId })),
      customer: line.customer,
      billable: line.billable,
      item_external_id: line.itemExternalId,
      quantity: line.quantity,
    })),
    bill: { location: bill.location, tax_basis: bill.taxBasis, tax_total: bill.taxTotal, currency: bill.currencyCode },
  }
}
