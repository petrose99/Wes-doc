/** ADR 0014: pure pre-fill of the rest of a bill's coding — each line's Tax code and Tracking, the
 * bill's Location and Tax basis — once its Accounts are resolved (line-account-resolution.ts). A
 * value a person set (`manual`) is kept even if the ledger can no longer take it: the line-coding
 * Check reports it rather than this module silently swapping it. Anything else is re-derived on
 * every Save review, and a value the ledger can't take now (inactive, not for purchases, the
 * capability off) is never pre-filled — it stays null. Customer and Billable are only ever set by
 * a person, so they are carried over untouched. */
import { amountTolerance } from "@/lib/checks/types"
import type { LedgerCapabilities } from "@/lib/integrations/ledger-capabilities"

export type TaxBasis = "inclusive" | "exclusive" | "none"
export type TaxCodeSource = "account_default" | "supplier" | "manual" | "item"
export type TrackingSelection = { category_id: string; option_id: string }

/** What `codingData.items[i]` carries beyond its Account (snake_case, as LineAccountRow). */
export type LineCoding = {
  tax_code: string | null
  tax_code_source: TaxCodeSource | null
  tracking: TrackingSelection[]
  customer: string | null
  billable: boolean
}

/** What `codingData` carries for the whole bill. */
export type BillCoding = {
  location: string | null
  location_source: "supplier" | "manual" | null
  tax_basis: TaxBasis | null
  tax_basis_source: "inferred" | "manual" | null
}

/** The supplier's usual coding set (SupplierAccountRule). */
export type CodingRule = {
  accountExternalId: string
  taxCodeExternalId: string | null
  tracking: { categoryId: string; optionId: string }[]
  locationExternalId: string | null
}

/** The ledger references a bill can use now: active purchase Tax codes, active Tracking options
 * keyed `category:option`, active Locations. */
export type CodingReferences = {
  taxCodes: ReadonlySet<string>
  trackingOptions: ReadonlySet<string>
  locations: ReadonlySet<string>
}

type ReferenceRow = { entityType: string; externalId: string; parentExternalId: string | null; forPurchases: boolean | null; active?: boolean }

/** The ledger's synced AccountingEntity rows as the references a bill can use now — inactive rows
 * (kept for their names) are left out. */
export function codingReferencesFrom(entities: ReferenceRow[]): CodingReferences {
  const active = (type: string) => entities.filter((entity) => entity.entityType === type && entity.active !== false)
  return {
    taxCodes: new Set(active("tax_rate").filter((code) => code.forPurchases === true).map((code) => code.externalId)),
    trackingOptions: new Set(active("tracking_option").map((option) => `${option.parentExternalId}:${option.externalId}`)),
    locations: new Set(active("location").map((location) => location.externalId)),
  }
}

/** Which way the invoice's line amounts read against its totals: summing to the subtotal with tax
 * on top is exclusive, summing to the total with tax inside is inclusive, no tax is none. Null
 * when it can't tell (the Tax basis unclear Check). A document with no lines reads as one line of
 * the total, as the bill mapper sends it. */
export function inferTaxBasis(input: { lines: number[]; subtotal: number | null; taxTotal: number | null; total: number | null; currency: string | null }): TaxBasis | null {
  const lines = input.lines.length ? input.lines : input.total !== null ? [input.total] : []
  if (!lines.length) return null
  const sum = lines.reduce((acc, amount) => acc + amount, 0)
  const tolerance = amountTolerance(input.currency) * lines.length
  const near = (target: number | null) => target !== null && Math.abs(sum - target) <= tolerance
  const taxed = (input.taxTotal ?? 0) > 0
  if (taxed && near(input.subtotal)) return "exclusive"
  if (taxed && near(input.total)) return "inclusive"
  if (!taxed && near(input.total)) return "none"
  return null
}

export function resolveLineCoding(input: {
  line: { account_external_id: string | null }
  prior: Partial<LineCoding> | null
  rule: CodingRule | null
  accountDefaults: Record<string, string | null | undefined>
  capabilities: LedgerCapabilities | null
  references: CodingReferences
  /** #459: the resolved item's own purchase tax code, when the line is coded to an Item — wins
   * over the supplier rule and the account default. */
  itemTaxCode?: string | null
}): LineCoding {
  const { line, prior, rule, capabilities, references } = input
  const account = line.account_external_id
  const onRuleAccount = Boolean(rule && account && rule.accountExternalId === account)
  let tax_code: string | null = null
  let tax_code_source: TaxCodeSource | null = null
  if (prior?.tax_code_source === "manual") {
    tax_code = prior.tax_code ?? null
    tax_code_source = "manual"
  } else if (capabilities?.vat !== false) {
    const candidates: [string | null | undefined, TaxCodeSource][] = [
      [input.itemTaxCode ?? null, "item"],
      [onRuleAccount ? rule?.taxCodeExternalId : null, "supplier"],
      [account ? input.accountDefaults[account] : null, "account_default"],
    ]
    const hit = candidates.find(([code]) => code && references.taxCodes.has(code))
    if (hit) [tax_code, tax_code_source] = [hit[0] as string, hit[1]]
  }
  // ponytail: Tracking has no source field until #369 lets a person pick it, so it is always the
  // rule's; #369 adds a manual source here the way tax_code_source works.
  const categories = new Set(capabilities?.tracking.map((category) => category.id) ?? [])
  const tracking = onRuleAccount && rule
    ? rule.tracking
        .filter((t) => categories.has(t.categoryId) && references.trackingOptions.has(`${t.categoryId}:${t.optionId}`))
        .map((t) => ({ category_id: t.categoryId, option_id: t.optionId }))
    : []
  return { tax_code, tax_code_source, tracking, customer: prior?.customer ?? null, billable: prior?.billable ?? false }
}

export function resolveBillCoding(input: {
  prior: Partial<BillCoding> | null
  rule: CodingRule | null
  capabilities: LedgerCapabilities | null
  references: CodingReferences
  inferredBasis: TaxBasis | null
}): BillCoding {
  const { prior, rule, capabilities, references } = input
  const ruleLocation = capabilities?.location && rule?.locationExternalId && references.locations.has(rule.locationExternalId) ? rule.locationExternalId : null
  const [location, location_source] = prior?.location_source === "manual"
    ? [prior.location ?? null, "manual" as const]
    : [ruleLocation, ruleLocation ? "supplier" as const : null]
  // A ledger with VAT off takes no Tax code, so the bill goes as no-tax whatever the invoice shows.
  const inferred = capabilities?.vat === false ? "none" : input.inferredBasis
  const [tax_basis, tax_basis_source] = prior?.tax_basis_source === "manual"
    ? [prior.tax_basis ?? null, "manual" as const]
    : [inferred, inferred ? "inferred" as const : null]
  return { location, location_source, tax_basis, tax_basis_source }
}
