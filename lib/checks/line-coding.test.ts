import { describe, expect, it } from "vitest"
import { checkLineCoding, firstLineCodingFail, lineCodingInputFromBill, lineCodingInputFromDocument, type LineCodingInput } from "@/lib/checks/line-coding"

const ON = { vat: true, tracking: [{ id: "class", name: "Class" }], location: true, customer: true, billable: true }

function input(over: Partial<LineCodingInput> = {}, line: Partial<LineCodingInput["lines"][number]> = {}, bill: Partial<LineCodingInput["bill"]> = {}): LineCodingInput {
  return {
    provider: "quickbooks",
    capabilities: ON,
    references: { taxCodes: new Set(["TAX15"]), trackingOptions: new Set(["class:c1"]), locations: new Set(["loc1"]) },
    taxRates: { TAX15: 15 },
    names: { class: "Class", "class:c1": "Retail", "class:c9": "Wholesale" },
    lines: [{ amount: 100, tax_code: "TAX15", tracking: [{ category_id: "class", option_id: "c1" }], customer: null, billable: false, ...line }],
    bill: { location: null, tax_basis: "exclusive", tax_total: 15, currency: "ZAR", ...bill },
    ...over,
  }
}

const codes = (value: LineCodingInput) => checkLineCoding(value).map((result) => result.checkCode)
const only = (value: LineCodingInput) => {
  const results = checkLineCoding(value)
  expect(results).toHaveLength(1)
  return results[0]
}

describe("checkLineCoding", () => {
  it("a clean bill fires nothing", () => {
    expect(checkLineCoding(input())).toEqual([])
  })

  it("every result is a fail with a title, a fix sentence naming the ledger, and line anchors", () => {
    const result = only(input({}, { tax_code: null }))
    expect(result).toMatchObject({ checkCode: "tax_code_missing", status: "fail", message: "Tax code missing", fields: ["line_items[0].tax_code"] })
    expect(result.detail?.text).toBe("Set a default tax code on the line's account in QuickBooks, sync accounts, then save review.")
  })

  it("vat_off_in_quickbooks: QuickBooks VAT off and a line holds a Tax code", () => {
    const result = only(input({ capabilities: { ...ON, vat: false } }, {}, { tax_basis: "none", tax_total: 0 }))
    expect(result).toMatchObject({ checkCode: "vat_off_in_quickbooks", message: "VAT is off in QuickBooks" })
  })

  it("VAT off with no Tax codes held is clean", () => {
    expect(codes(input({ capabilities: { ...ON, vat: false } }, { tax_code: null }, { tax_basis: "none", tax_total: 0 }))).toEqual([])
  })

  it("tax_code_not_in_ledger: the held code is not an active purchase code", () => {
    expect(only(input({ provider: "xero" }, { tax_code: "GONE" })).message).toBe("Tax code not in Xero")
  })

  it("tracking_off_in_ledger: a held category the ledger no longer offers", () => {
    expect(only(input({ capabilities: { ...ON, tracking: [] } })).message).toBe("Class tracking is off in QuickBooks")
  })

  it("tracking_option_not_in_ledger: the option is inactive or unknown, named", () => {
    const result = only(input({}, { tracking: [{ category_id: "class", option_id: "c9" }] }))
    expect(result).toMatchObject({ checkCode: "tracking_option_not_in_ledger", message: "Wholesale isn't in QuickBooks", fields: ["line_items[0].tracking"] })
  })

  it("ledger_has_no_location: the bill holds a Location the ledger can't take", () => {
    expect(only(input({ capabilities: { ...ON, location: false } }, {}, { location: "loc1" })).message).toBe("QuickBooks has no Location")
  })

  it("ledger_cannot_take_customer", () => {
    expect(only(input({ capabilities: { ...ON, customer: false } }, { customer: "cus1" })).checkCode).toBe("ledger_cannot_take_customer")
  })

  it("billable_off_in_quickbooks", () => {
    expect(only(input({ capabilities: { ...ON, billable: false } }, { customer: "cus1", billable: true })).message).toBe("Billable is off in QuickBooks")
  })

  it("billable_needs_customer", () => {
    expect(only(input({}, { billable: true })).message).toBe("Billable needs a Customer")
  })

  it("tax_basis_unclear", () => {
    expect(only(input({}, {}, { tax_basis: null })).checkCode).toBe("tax_basis_unclear")
  })

  it("vat_mismatch_invoice: exclusive lines × rate against the invoice VAT", () => {
    expect(only(input({}, {}, { tax_total: 20 })).message).toBe("VAT won't match the invoice")
  })

  it("vat_mismatch_invoice reads inclusive lines as tax inside the amount", () => {
    expect(codes(input({}, { amount: 115 }, { tax_basis: "inclusive", tax_total: 15 }))).toEqual([])
    expect(codes(input({}, { amount: 115 }, { tax_basis: "inclusive", tax_total: 17.25 }))).toEqual(["vat_mismatch_invoice"])
  })

  it("vat_mismatch_invoice tolerates a cent per line", () => {
    expect(codes(input({}, {}, { tax_total: 15.01 }))).toEqual([])
  })

  it("one result per code, anchored to every offending line", () => {
    const value = input()
    value.lines = [value.lines[0], { ...value.lines[0], tax_code: null }, { ...value.lines[0], tax_code: null }]
    value.bill.tax_total = 15
    const result = checkLineCoding(value).find((r) => r.checkCode === "tax_code_missing")
    expect(result?.fields).toEqual(["line_items[1].tax_code", "line_items[2].tax_code"])
  })
})

describe("line coding inputs", () => {
  it("reads a document's coding rows beside its reviewed lines", () => {
    const value = lineCodingInputFromDocument({
      codingData: { location: "loc1", tax_basis: "exclusive", items: [{ account_external_id: "a", tax_code: "TAX15", tracking: [{ category_id: "class", option_id: "c1" }], customer: null, billable: false }] },
      reviewedData: { tax_total: 15, currency_code: "ZAR", line_items: [{ amount: 100 }] },
    })
    expect(value).toEqual({ lines: [{ amount: 100, tax_code: "TAX15", tracking: [{ category_id: "class", option_id: "c1" }], customer: null, billable: false }], bill: { location: "loc1", tax_basis: "exclusive", tax_total: 15, currency: "ZAR" } })
  })

  it("a document with no coding rows has nothing to check", () => {
    expect(lineCodingInputFromDocument({ codingData: {}, reviewedData: {} })).toBeNull()
  })

  it("reads a snapshot's coding back into the same shape", () => {
    const value = lineCodingInputFromBill({
      taxBasis: "inclusive", location: null, taxTotal: 15, currencyCode: "ZAR",
      lineItems: [{ amount: 115, taxCode: "TAX15", tracking: [{ categoryId: "class", categoryName: "Class", optionId: "c1", optionName: "Retail" }], customer: null, billable: false }],
    })
    expect(value).toEqual({ lines: [{ amount: 115, tax_code: "TAX15", tracking: [{ category_id: "class", option_id: "c1" }], customer: null, billable: false }], bill: { location: null, tax_basis: "inclusive", tax_total: 15, currency: "ZAR" } })
  })
})

describe("firstLineCodingFail", () => {
  const { lines: _lines, bill: _bill, ...context } = input()
  it("names only the document's first fail, judged over the context passed in", () => {
    const doc = { codingData: { tax_basis: null, items: [{ tax_code: null, tracking: [] }] }, reviewedData: { line_items: [{ amount: 10 }] } }
    expect(firstLineCodingFail(context, doc)?.checkCode).toBe("tax_code_missing")
  })
  it("is null with nothing resolved to judge, or before the ledger's capabilities were read", () => {
    expect(firstLineCodingFail(context, { codingData: {}, reviewedData: {} })).toBeNull()
    expect(firstLineCodingFail(null, { codingData: { items: [{ tax_code: null }] }, reviewedData: {} })).toBeNull()
  })
})
