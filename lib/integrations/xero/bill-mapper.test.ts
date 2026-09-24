import { describe, expect, it } from "vitest"
import { toXeroBillBody } from "@/lib/integrations/xero/bill-mapper"
import { BillMappingError, type NormalizedBill } from "@/lib/integration-bill-mapping"

const bill: NormalizedBill = {
  documentId: "d1", filename: "invoice.pdf", vendorName: "Acme", referenceNumber: "INV-1",
  issueDate: "2026-08-01", dueDate: "2026-08-31", total: 40, currencyCode: null,
  lineItems: [{ description: "Widget", quantity: 1, unitPrice: 40, amount: 40, accountExternalId: "a1" }],
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
        { description: "Widget", quantity: 1, unitPrice: 10, amount: 10, accountExternalId: "a1" },
        { description: "Gadget", quantity: 1, unitPrice: 30, amount: 30, accountExternalId: "a2" },
      ],
    }
    const body = toXeroBillBody(twoLines, "c1")
    expect(body.LineItems.map((line) => line.AccountCode)).toEqual(["a1", "a2"])
  })

  it("refuses a line with no resolved account", () => {
    const missing: NormalizedBill = { ...bill, lineItems: [{ description: "Widget", quantity: 1, unitPrice: 40, amount: 40, accountExternalId: null }] }
    expect(() => toXeroBillBody(missing, "c1")).toThrow(BillMappingError)
  })
})
