import { describe, expect, it } from "vitest"
import { toQuickBooksBillBody } from "@/lib/integrations/quickbooks/bill-mapper"
import { BillMappingError, type NormalizedBill } from "@/lib/integration-bill-mapping"

const noCoding = { taxCode: null, tracking: [], customer: null, billable: false, itemExternalId: null }

const bill: NormalizedBill = {
  taxBasis: "none", location: null, subtotal: null, taxTotal: null,
  documentId: "d1", filename: "invoice.pdf", vendorName: "Acme", referenceNumber: "INV-1",
  issueDate: "2026-08-01", dueDate: "2026-08-31", total: 40, currencyCode: null,
  lineItems: [{ description: "Widget", quantity: 1, unitPrice: 40, amount: 40, accountExternalId: "a1", ...noCoding }],
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
        { description: "Widget", quantity: 1, unitPrice: 10, amount: 10, accountExternalId: "a1", ...noCoding },
        { description: "Gadget", quantity: 1, unitPrice: 30, amount: 30, accountExternalId: "a2", ...noCoding },
      ],
    }
    const body = toQuickBooksBillBody(twoLines, "v1")
    expect(body.Line.map((line) => line.AccountBasedExpenseLineDetail.AccountRef.value)).toEqual(["a1", "a2"])
  })

  it("maps the Tax basis to GlobalTaxCalculation and lets the ledger compute TotalAmt (ADR 0014)", () => {
    const coded: NormalizedBill = { ...bill, lineItems: [{ ...bill.lineItems[0], taxCode: "TX20" }] }
    const inclusive = toQuickBooksBillBody({ ...coded, taxBasis: "inclusive" }, "v1")
    expect(inclusive.GlobalTaxCalculation).toBe("TaxInclusive")
    expect(inclusive).not.toHaveProperty("TotalAmt")
    expect(inclusive.Line[0].AccountBasedExpenseLineDetail.TaxCodeRef).toEqual({ value: "TX20" })
    const exclusive = toQuickBooksBillBody({ ...coded, taxBasis: "exclusive" }, "v1")
    expect(exclusive.GlobalTaxCalculation).toBe("TaxExcluded")
    expect(exclusive).not.toHaveProperty("TotalAmt")
    const none = toQuickBooksBillBody({ ...coded, taxBasis: "none" }, "v1")
    expect(none.GlobalTaxCalculation).toBe("NotApplicable")
    expect(none.TotalAmt).toBe(40)
    expect(none.Line[0].AccountBasedExpenseLineDetail).not.toHaveProperty("TaxCodeRef")
  })

  it("carries Class, Customer, billable status per line and Location on the bill", () => {
    const coded: NormalizedBill = {
      ...bill, location: "dep1",
      lineItems: [{ ...bill.lineItems[0], customer: "cu1", billable: true, tracking: [{ categoryId: "class", categoryName: "Class", optionId: "cl1", optionName: "Retail" }] }],
    }
    const body = toQuickBooksBillBody(coded, "v1")
    expect(body.DepartmentRef).toEqual({ value: "dep1" })
    const detail = body.Line[0].AccountBasedExpenseLineDetail
    expect(detail.ClassRef).toEqual({ value: "cl1" })
    expect(detail.CustomerRef).toEqual({ value: "cu1" })
    expect(detail.BillableStatus).toBe("Billable")
    const plain = toQuickBooksBillBody(bill, "v1")
    expect(plain).not.toHaveProperty("DepartmentRef")
    expect(plain.Line[0].AccountBasedExpenseLineDetail).toEqual({ AccountRef: { value: "a1" } })
  })

  it("refuses a line with no resolved account and no item (#459: widened guard)", () => {
    const missing: NormalizedBill = { ...bill, lineItems: [{ description: "Widget", quantity: 1, unitPrice: 40, amount: 40, accountExternalId: null, ...noCoding }] }
    expect(() => toQuickBooksBillBody(missing, "v1")).toThrow(BillMappingError)
  })

  it("#459: an item line uses ItemBasedExpenseLineDetail with no AccountRef", () => {
    const itemLine: NormalizedBill = {
      ...bill,
      lineItems: [{ description: "Widget", quantity: 3, unitPrice: 10, amount: 30, accountExternalId: null, ...noCoding, itemExternalId: "i1" }],
    }
    const body = toQuickBooksBillBody(itemLine, "v1")
    expect(body.Line[0].DetailType).toBe("ItemBasedExpenseLineDetail")
    expect(body.Line[0].ItemBasedExpenseLineDetail).toEqual({ ItemRef: { value: "i1" }, Qty: 3, UnitPrice: 10 })
    expect(body.Line[0]).not.toHaveProperty("AccountBasedExpenseLineDetail")
  })

  it("#459: a service/non-inventory item with no extracted quantity posts 1 x the amount (ADR 0015)", () => {
    const itemLine: NormalizedBill = {
      ...bill,
      lineItems: [{ description: "Consulting", quantity: 1, unitPrice: 40, amount: 40, accountExternalId: null, ...noCoding, itemExternalId: "i2" }],
    }
    const body = toQuickBooksBillBody(itemLine, "v1")
    expect(body.Line[0].ItemBasedExpenseLineDetail).toMatchObject({ Qty: 1, UnitPrice: 40 })
  })

  it("#459: an item line still carries TaxCodeRef, ClassRef, CustomerRef and BillableStatus", () => {
    const itemLine: NormalizedBill = {
      ...bill,
      lineItems: [{
        description: "Widget", quantity: 1, unitPrice: 40, amount: 40, accountExternalId: null,
        taxCode: "TX20", tracking: [{ categoryId: "class", categoryName: "Class", optionId: "cl1", optionName: "Retail" }],
        customer: "cu1", billable: true, itemExternalId: "i1",
      }],
    }
    const body = toQuickBooksBillBody({ ...itemLine, taxBasis: "exclusive" }, "v1")
    expect(body.Line[0].ItemBasedExpenseLineDetail).toMatchObject({
      TaxCodeRef: { value: "TX20" }, ClassRef: { value: "cl1" }, CustomerRef: { value: "cu1" }, BillableStatus: "Billable",
    })
  })

  it("#459: a line with neither account nor item still refuses (widened guard)", () => {
    const missing: NormalizedBill = { ...bill, lineItems: [{ description: "Widget", quantity: 1, unitPrice: 40, amount: 40, accountExternalId: null, ...noCoding }] }
    expect(() => toQuickBooksBillBody(missing, "v1")).toThrow(BillMappingError)
  })
})
