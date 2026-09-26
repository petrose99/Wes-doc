import { describe, expect, it } from "vitest"
import { toXeroBillBody } from "@/lib/integrations/xero/bill-mapper"
import { BillMappingError, type NormalizedBill } from "@/lib/integration-bill-mapping"

const noCoding = { taxCode: null, tracking: [], customer: null, billable: false }

const bill: NormalizedBill = {
  taxBasis: "none", location: null, subtotal: null, taxTotal: null,
  documentId: "d1", filename: "invoice.pdf", vendorName: "Acme", referenceNumber: "INV-1",
  issueDate: "2026-08-01", dueDate: "2026-08-31", total: 40, currencyCode: null,
  lineItems: [{ description: "Widget", quantity: 1, unitPrice: 40, amount: 40, accountExternalId: "a1", ...noCoding }],
}

describe("toXeroBillBody", () => {
  it("omits CurrencyCode when no currency code is known", () => {
    const body = toXeroBillBody(bill, "c1")
    expect(body).not.toHaveProperty("CurrencyCode")
  })

  it("includes CurrencyCode when a currency code is present", () => {
    const body = toXeroBillBody({ ...bill, currencyCode: "GBP" }, "c1")
    expect(body.CurrencyCode).toBe("GBP")
  })

  it("codes each line to its OWN resolved account (#429)", () => {
    const twoLines: NormalizedBill = {
      ...bill,
      lineItems: [
        { description: "Widget", quantity: 1, unitPrice: 10, amount: 10, accountExternalId: "a1", ...noCoding },
        { description: "Gadget", quantity: 1, unitPrice: 30, amount: 30, accountExternalId: "a2", ...noCoding },
      ],
    }
    const body = toXeroBillBody(twoLines, "c1")
    expect(body.LineItems.map((line) => line.AccountCode)).toEqual(["a1", "a2"])
  })

  it("maps the Tax basis to LineAmountTypes and each line's Tax code to TaxType (ADR 0014)", () => {
    const coded: NormalizedBill = { ...bill, lineItems: [{ ...bill.lineItems[0], taxCode: "INPUT2" }] }
    expect(toXeroBillBody({ ...coded, taxBasis: "inclusive" }, "c1").LineAmountTypes).toBe("Inclusive")
    expect(toXeroBillBody({ ...coded, taxBasis: "exclusive" }, "c1").LineAmountTypes).toBe("Exclusive")
    const none = toXeroBillBody({ ...coded, taxBasis: "none" }, "c1")
    expect(none.LineAmountTypes).toBe("NoTax")
    expect(none.LineItems[0]).not.toHaveProperty("TaxType")
    expect(toXeroBillBody({ ...coded, taxBasis: "exclusive" }, "c1").LineItems[0].TaxType).toBe("INPUT2")
  })

  it("sends Tracking by the names the snapshot carries", () => {
    const coded: NormalizedBill = {
      ...bill,
      lineItems: [{ ...bill.lineItems[0], tracking: [{ categoryId: "t1", categoryName: "Region", optionId: "o1", optionName: "North" }] }],
    }
    expect(toXeroBillBody(coded, "c1").LineItems[0].Tracking).toEqual([{ Name: "Region", Option: "North" }])
    expect(toXeroBillBody(bill, "c1").LineItems[0]).not.toHaveProperty("Tracking")
  })

  it("refuses a line with no resolved account", () => {
    const missing: NormalizedBill = { ...bill, lineItems: [{ description: "Widget", quantity: 1, unitPrice: 40, amount: 40, accountExternalId: null, ...noCoding }] }
    expect(() => toXeroBillBody(missing, "c1")).toThrow(BillMappingError)
  })
})
