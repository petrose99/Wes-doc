import { describe, expect, it } from "vitest"
import { toQuickBooksBillBody } from "@/lib/integrations/quickbooks/bill-mapper"
import { BillMappingError, type NormalizedBill } from "@/lib/integration-bill-mapping"

const bill: NormalizedBill = {
  documentId: "d1", filename: "invoice.pdf", vendorName: "Acme", referenceNumber: "INV-1",
  issueDate: "2026-08-01", dueDate: "2026-08-31", total: 40, currencyCode: null,
  lineItems: [{ description: "Widget", quantity: 1, unitPrice: 40, amount: 40, accountExternalId: "a1" }],
}

describe("toQuickBooksBillBody", () => {
  it("omits CurrencyRef when no currency code is known", () => {
    const body = toQuickBooksBillBody(bill, "v1")
    expect(body).not.toHaveProperty("CurrencyRef")
  })

  it("includes CurrencyRef when a currency code is present", () => {
    const body = toQuickBooksBillBody({ ...bill, currencyCode: "GBP" }, "v1")
    expect(body.CurrencyRef).toEqual({ value: "GBP" })
  })

  it("codes each line to its OWN resolved account (#429)", () => {
    const twoLines: NormalizedBill = {
      ...bill,
      lineItems: [
        { description: "Widget", quantity: 1, unitPrice: 10, amount: 10, accountExternalId: "a1" },
        { description: "Gadget", quantity: 1, unitPrice: 30, amount: 30, accountExternalId: "a2" },
      ],
    }
    const body = toQuickBooksBillBody(twoLines, "v1")
    expect(body.Line.map((line) => line.AccountBasedExpenseLineDetail.AccountRef.value)).toEqual(["a1", "a2"])
  })

  it("refuses a line with no resolved account", () => {
    const missing: NormalizedBill = { ...bill, lineItems: [{ description: "Widget", quantity: 1, unitPrice: 40, amount: 40, accountExternalId: null }] }
    expect(() => toQuickBooksBillBody(missing, "v1")).toThrow(BillMappingError)
  })
})
