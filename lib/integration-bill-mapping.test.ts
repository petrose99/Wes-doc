import { BillMappingError, normalizeBillFromDocument, reconcileLineItemRounding } from "@/lib/integration-bill-mapping"
import { describe, expect, it } from "vitest"

const makeDoc = (overrides: Partial<Parameters<typeof normalizeBillFromDocument>[0]> = {}) => ({
  documentId: "doc1",
  filename: "invoice.pdf",
  templateCode: "invoice",
  reviewedData: {
    vendor: "Acme Corp",
    invoice_number: "INV-1",
    issue_date: "2026-08-01",
    due_date: "2026-08-31",
    total: 42.5,
    line_items: [{ description: "Widget", quantity: 2, unit_price: 20, amount: 40 }, { description: "Tax", amount: 2.5 }],
  },
  ...overrides,
})

describe("normalizeBillFromDocument", () => {
  it("reads vendor/invoice fields for an invoice", () => {
    const bill = normalizeBillFromDocument(makeDoc())
    expect(bill.vendorName).toBe("Acme Corp")
    expect(bill.referenceNumber).toBe("INV-1")
    expect(bill.issueDate).toBe("2026-08-01")
    expect(bill.dueDate).toBe("2026-08-31")
    expect(bill.total).toBe(42.5)
    expect(bill.lineItems).toHaveLength(2)
    expect(bill.lineItems[0]).toEqual({ description: "Widget", quantity: 2, unitPrice: 20, amount: 40, accountExternalId: null, itemExternalId: null, taxCode: null, tracking: [], customer: null, billable: false })
  })

  it("threads codingData.items[i].account_external_id onto the matching line, by index (#429)", () => {
    const bill = normalizeBillFromDocument(makeDoc({
      lineAccounts: [{ account_external_id: "acc-widget" }, { account_external_id: "acc-tax" }],
    }))
    expect(bill.lineItems[0].accountExternalId).toBe("acc-widget")
    expect(bill.lineItems[1].accountExternalId).toBe("acc-tax")
  })

  it("snapshots each line's coding with Tracking names resolved, and the bill's (ADR 0014)", () => {
    const bill = normalizeBillFromDocument(makeDoc({
      lineAccounts: [
        { account_external_id: "a", tax_code: "TAX15", tracking: [{ category_id: "class", option_id: "c1" }], customer: "cus1", billable: true },
        { account_external_id: "a", tax_code: null, tracking: [], customer: null, billable: false },
      ],
      billCoding: { location: "loc1", tax_basis: "inclusive" },
      names: { class: "Class", "class:c1": "Retail" },
    }))
    expect(bill.lineItems[0]).toMatchObject({ taxCode: "TAX15", tracking: [{ categoryId: "class", categoryName: "Class", optionId: "c1", optionName: "Retail" }], customer: "cus1", billable: true })
    expect(bill.lineItems[1]).toMatchObject({ taxCode: null, tracking: [], customer: null, billable: false })
    expect(bill).toMatchObject({ taxBasis: "inclusive", location: "loc1", subtotal: null, taxTotal: null })
  })

  it("an uncoded document snapshots no Tax basis and no Location", () => {
    expect(normalizeBillFromDocument(makeDoc())).toMatchObject({ taxBasis: null, location: null })
  })

  it("exclusive: lines reconcile to the subtotal, not the total", () => {
    const bill = normalizeBillFromDocument(makeDoc({
      reviewedData: { vendor: "Acme", subtotal: 100, tax_total: 15, total: 115, line_items: [{ description: "A", amount: 33.333 }, { description: "B", amount: 66.667 }] },
      billCoding: { tax_basis: "exclusive" },
    }))
    expect(bill).toMatchObject({ total: 115, subtotal: 100, taxTotal: 15, taxBasis: "exclusive" })
    expect(bill.lineItems.reduce((sum, l) => sum + l.amount, 0)).toBeCloseTo(100, 2)
  })

  it("exclusive with no lines synthesizes one line of the subtotal", () => {
    const bill = normalizeBillFromDocument(makeDoc({ reviewedData: { vendor: "Acme", subtotal: 100, tax_total: 15, total: 115 }, billCoding: { tax_basis: "exclusive" } }))
    expect(bill.lineItems).toMatchObject([{ description: "Total", amount: 100 }])
  })

  it("scales the subtotal and VAT with the total under fxOverride", () => {
    const bill = normalizeBillFromDocument(makeDoc({ reviewedData: { vendor: "Acme", subtotal: 100, tax_total: 15, total: 115, currency_code: "EUR" }, fxOverride: { total: 230, currencyCode: "ZAR" } }))
    expect(bill).toMatchObject({ subtotal: 200, taxTotal: 30 })
  })

  it("reads merchant/receipt fields for a receipt, with no due date", () => {
    const bill = normalizeBillFromDocument(makeDoc({
      templateCode: "receipt",
      reviewedData: { merchant: "Store", receipt_number: "R-9", purchase_date: "2026-08-10", due_date: "2026-08-20", total: 12 },
    }))
    expect(bill.vendorName).toBe("Store")
    expect(bill.referenceNumber).toBe("R-9")
    expect(bill.issueDate).toBe("2026-08-10")
    expect(bill.dueDate).toBeNull()
  })

  it("synthesizes one line item covering the total when line_items is empty", () => {
    const bill = normalizeBillFromDocument(makeDoc({ reviewedData: { vendor: "Acme", total: 99, line_items: [] } }))
    expect(bill.lineItems).toEqual([{ description: "Total", quantity: 1, unitPrice: 99, amount: 99, accountExternalId: null, itemExternalId: null, taxCode: null, tracking: [], customer: null, billable: false }])
  })

  it("synthesizes one line item when line_items is missing entirely", () => {
    const bill = normalizeBillFromDocument(makeDoc({ reviewedData: { vendor: "Acme", total: 50 } }))
    expect(bill.lineItems).toEqual([{ description: "Total", quantity: 1, unitPrice: 50, amount: 50, accountExternalId: null, itemExternalId: null, taxCode: null, tracking: [], customer: null, billable: false }])
  })

  it("falls back to 'Unknown vendor' when no vendor/merchant is present", () => {
    const bill = normalizeBillFromDocument(makeDoc({ reviewedData: { total: 5 } }))
    expect(bill.vendorName).toBe("Unknown vendor")
  })

  it("throws BillMappingError when total is missing", () => {
    expect(() => normalizeBillFromDocument(makeDoc({ reviewedData: { vendor: "Acme" } }))).toThrow(BillMappingError)
  })

  it("throws BillMappingError when total is not a finite number", () => {
    expect(() => normalizeBillFromDocument(makeDoc({ reviewedData: { vendor: "Acme", total: Number.NaN } }))).toThrow(BillMappingError)
  })

  it("reads a valid 3-letter currency code, uppercased", () => {
    const bill = normalizeBillFromDocument(makeDoc({ reviewedData: { vendor: "Acme", total: 5, currency_code: "usd" } }))
    expect(bill.currencyCode).toBe("USD")
  })

  it("returns null currency code when absent or malformed", () => {
    expect(normalizeBillFromDocument(makeDoc({ reviewedData: { vendor: "Acme", total: 5 } })).currencyCode).toBeNull()
    expect(normalizeBillFromDocument(makeDoc({ reviewedData: { vendor: "Acme", total: 5, currency_code: "US" } })).currencyCode).toBeNull()
    expect(normalizeBillFromDocument(makeDoc({ reviewedData: { vendor: "Acme", total: 5, currency_code: "USDOLLAR" } })).currencyCode).toBeNull()
  })

  it("swaps to the workspace-base amount + currency when fxOverride is provided", () => {
    const bill = normalizeBillFromDocument(makeDoc({
      reviewedData: {
        vendor: "Acme", total: 100, currency_code: "EUR",
        line_items: [{ description: "Widget", quantity: 1, unit_price: 60, amount: 60 }, { description: "Tax", amount: 40 }],
      },
      fxOverride: { total: 108.91, currencyCode: "USD" },
    }))
    expect(bill.total).toBe(108.91)
    expect(bill.currencyCode).toBe("USD")
    // Line items scaled by the same 1.0891 ratio and reconciled to sum exactly to 108.91.
    expect(bill.lineItems.reduce((sum, l) => sum + l.amount, 0)).toBeCloseTo(108.91, 2)
    expect(bill.lineItems).toHaveLength(2)
  })
})

describe("reconcileLineItemRounding", () => {
  const item = (amount: number) => ({ description: "x", quantity: 1, unitPrice: amount, amount })

  it("returns lines untouched (post-round) when they already sum to the total", () => {
    const lines = reconcileLineItemRounding([item(10), item(5.5)], 15.5, "USD")
    expect(lines.map((l) => l.amount)).toEqual([10, 5.5])
  })

  it("allocates a one-cent rounding residual to the line with the largest remainder", () => {
    // 3 × 33.333 rounds to 3 × 33.33 = 99.99 against a 100.00 header — one line absorbs the cent.
    const lines = reconcileLineItemRounding([item(33.333), item(33.333), item(33.334)], 100, "USD")
    expect(lines.reduce((s, l) => s + l.amount, 0)).toBeCloseTo(100, 10)
    expect(lines.filter((l) => l.amount === 33.34)).toHaveLength(1)
  })

  it("handles a negative residual", () => {
    const lines = reconcileLineItemRounding([item(33.335), item(33.335), item(33.335)], 100, "USD")
    expect(lines.reduce((s, l) => s + l.amount, 0)).toBeCloseTo(100, 10)
  })

  it("leaves a real discrepancy (bigger than rounding could explain) alone", () => {
    const lines = reconcileLineItemRounding([item(40), item(40)], 100, "USD")
    expect(lines.reduce((s, l) => s + l.amount, 0)).toBeCloseTo(80, 10)
  })

  it("rounds to whole units for zero-decimal currencies", () => {
    const lines = reconcileLineItemRounding([item(33.4), item(33.4), item(33.4)], 100, "JPY")
    expect(lines.every((l) => Number.isInteger(l.amount))).toBe(true)
    expect(lines.reduce((s, l) => s + l.amount, 0)).toBe(100)
  })

  it("property: whenever the residual is within one minor unit per line, lines sum exactly to the header", () => {
    let seed = 42
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31
    for (let trial = 0; trial < 200; trial++) {
      const n = 1 + Math.floor(rand() * 8)
      const items = Array.from({ length: n }, () => item(Math.round(rand() * 100000) / 1000))
      const exact = items.reduce((s, l) => s + l.amount, 0)
      // Header rounded to cents, so the residual is pure rounding.
      const total = Math.round(exact * 100) / 100
      const lines = reconcileLineItemRounding(items, total, "USD")
      const sum = Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100
      expect(sum).toBe(total)
    }
  })
})
