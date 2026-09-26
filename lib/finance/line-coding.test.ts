import { describe, expect, it } from "vitest"
import { inferTaxBasis, resolveBillCoding, resolveLineCoding, type CodingReferences, type CodingRule } from "@/lib/finance/line-coding"
import type { LedgerCapabilities } from "@/lib/integrations/ledger-capabilities"

const caps: LedgerCapabilities = { vat: true, tracking: [{ id: "region", name: "Region" }], location: true, customer: true, billable: true, itemLines: false }
const refs: CodingReferences = {
  taxCodes: new Set(["INPUT", "EXEMPT", "ITEM"]),
  trackingOptions: new Set(["region:north", "region:south"]),
  locations: new Set(["loc1"]),
}
const rule: CodingRule = { accountExternalId: "acme_usual", taxCodeExternalId: "INPUT", tracking: [{ categoryId: "region", optionId: "north" }], locationExternalId: "loc1" }
const accountDefaults = { acme_usual: "EXEMPT", other: "EXEMPT", archived_code: "GONE" }

describe("inferTaxBasis", () => {
  it("lines summing to the subtotal with tax on top are exclusive", () => {
    expect(inferTaxBasis({ lines: [40, 60], subtotal: 100, taxTotal: 15, total: 115, currency: "ZAR" })).toBe("exclusive")
  })
  it("lines summing to the total with tax inside are inclusive", () => {
    expect(inferTaxBasis({ lines: [46, 69], subtotal: 100, taxTotal: 15, total: 115, currency: "ZAR" })).toBe("inclusive")
  })
  it("no tax and lines summing to the total is none", () => {
    expect(inferTaxBasis({ lines: [100], subtotal: null, taxTotal: 0, total: 100, currency: "ZAR" })).toBe("none")
    expect(inferTaxBasis({ lines: [100], subtotal: null, taxTotal: null, total: 100, currency: "ZAR" })).toBe("none")
  })
  it("lines that sum to neither leave the basis unclear", () => {
    expect(inferTaxBasis({ lines: [50], subtotal: 100, taxTotal: 15, total: 115, currency: "ZAR" })).toBeNull()
  })
  it("tolerance grows with the line count (half a minor unit per line)", () => {
    expect(inferTaxBasis({ lines: [33.334, 33.334, 33.334], subtotal: 100, taxTotal: 15, total: 115, currency: "ZAR" })).toBe("exclusive")
    expect(inferTaxBasis({ lines: [100.02], subtotal: 100, taxTotal: 15, total: 115, currency: "ZAR" })).toBeNull()
  })
  it("zero-decimal currencies compare to whole units", () => {
    expect(inferTaxBasis({ lines: [1000.4], subtotal: 1000, taxTotal: 100, total: 1100, currency: "JPY" })).toBe("exclusive")
  })
  it("a document with no line items reads as one line of the total", () => {
    expect(inferTaxBasis({ lines: [], subtotal: 100, taxTotal: 15, total: 115, currency: "ZAR" })).toBe("inclusive")
  })
})

describe("resolveLineCoding", () => {
  const base = { rule, accountDefaults, capabilities: caps, references: refs, prior: null }

  it("a line kept on the rule's Account takes the rule's Tax code and Tracking", () => {
    expect(resolveLineCoding({ ...base, line: { account_external_id: "acme_usual" } })).toEqual({
      tax_code: "INPUT", tax_code_source: "supplier", tracking: [{ category_id: "region", option_id: "north" }], customer: null, billable: false,
    })
  })
  it("a line moved off the rule's Account takes that Account's default and no Tracking", () => {
    expect(resolveLineCoding({ ...base, line: { account_external_id: "other" } })).toEqual({
      tax_code: "EXEMPT", tax_code_source: "account_default", tracking: [], customer: null, billable: false,
    })
  })
  it("with no rule the Account's default fills; with neither it stays null", () => {
    expect(resolveLineCoding({ ...base, rule: null, line: { account_external_id: "acme_usual" } }).tax_code).toBe("EXEMPT")
    expect(resolveLineCoding({ ...base, rule: null, line: { account_external_id: "no_default" } })).toMatchObject({ tax_code: null, tax_code_source: null })
  })
  it("a manual Tax code, Customer and Billable are kept as they are", () => {
    const prior = { tax_code: "ZERO", tax_code_source: "manual" as const, tracking: [], customer: "cust1", billable: true }
    expect(resolveLineCoding({ ...base, prior, line: { account_external_id: "acme_usual" } })).toMatchObject({ tax_code: "ZERO", tax_code_source: "manual", customer: "cust1", billable: true })
  })
  it("a non-manual prior value is re-derived", () => {
    const prior = { tax_code: "OLD", tax_code_source: "supplier" as const, tracking: [{ category_id: "region", option_id: "south" }], customer: null, billable: false }
    expect(resolveLineCoding({ ...base, prior, line: { account_external_id: "other" } })).toMatchObject({ tax_code: "EXEMPT", tracking: [] })
  })
  it("never pre-fills a value the ledger can't take now", () => {
    const staleRule: CodingRule = { ...rule, accountExternalId: "archived_code", taxCodeExternalId: "GONE", tracking: [{ categoryId: "region", optionId: "gone" }, { categoryId: "dept", optionId: "x" }] }
    expect(resolveLineCoding({ ...base, rule: staleRule, line: { account_external_id: "archived_code" } })).toMatchObject({ tax_code: null, tax_code_source: null, tracking: [] })
    expect(resolveLineCoding({ ...base, capabilities: { ...caps, tracking: [] }, line: { account_external_id: "acme_usual" } }).tracking).toEqual([])
  })
  it("an invalid rule code falls through to a valid Account default", () => {
    const staleRule: CodingRule = { ...rule, taxCodeExternalId: "GONE" }
    expect(resolveLineCoding({ ...base, rule: staleRule, line: { account_external_id: "acme_usual" } })).toMatchObject({ tax_code: "EXEMPT", tax_code_source: "account_default" })
  })
  it("a ledger with VAT off gets no Tax code", () => {
    expect(resolveLineCoding({ ...base, capabilities: { ...caps, vat: false }, line: { account_external_id: "acme_usual" } })).toMatchObject({ tax_code: null, tax_code_source: null })
  })
  it("#459: an item's own tax code wins over the supplier rule and the account default", () => {
    expect(resolveLineCoding({ ...base, itemTaxCode: "ITEM", line: { account_external_id: "acme_usual" } })).toMatchObject({ tax_code: "ITEM", tax_code_source: "item" })
  })
  it("#459: falls through to the supplier rule when the item's tax code isn't a valid reference", () => {
    expect(resolveLineCoding({ ...base, itemTaxCode: "GONE", line: { account_external_id: "acme_usual" } })).toMatchObject({ tax_code: "INPUT", tax_code_source: "supplier" })
  })
})

describe("resolveBillCoding", () => {
  const base = { rule, capabilities: caps, references: refs, prior: null, inferredBasis: "exclusive" as const }

  it("takes the rule's Location and the inferred basis", () => {
    expect(resolveBillCoding(base)).toEqual({ location: "loc1", location_source: "supplier", tax_basis: "exclusive", tax_basis_source: "inferred" })
  })
  it("keeps a manual Location and basis", () => {
    const prior = { location: "loc9", location_source: "manual" as const, tax_basis: "inclusive" as const, tax_basis_source: "manual" as const }
    expect(resolveBillCoding({ ...base, prior })).toEqual(prior)
  })
  it("leaves Location null when the ledger can't take it or it is gone", () => {
    expect(resolveBillCoding({ ...base, capabilities: { ...caps, location: false } }).location).toBeNull()
    expect(resolveBillCoding({ ...base, rule: { ...rule, locationExternalId: "gone" } }).location).toBeNull()
  })
  it("a ledger with VAT off posts with basis none", () => {
    expect(resolveBillCoding({ ...base, capabilities: { ...caps, vat: false } })).toMatchObject({ tax_basis: "none", tax_basis_source: "inferred" })
  })
  it("an unclear basis stays null", () => {
    expect(resolveBillCoding({ ...base, inferredBasis: null })).toMatchObject({ tax_basis: null, tax_basis_source: null })
  })
})
