import { describe, expect, it } from "vitest"
import { capAllocationAmount, proposeAllocation, refuseIfOpenLine } from "@/lib/credits/allocation"

describe("capAllocationAmount", () => {
  it("caps to the smallest of requested, invoice due, and credit remaining", () => {
    expect(capAllocationAmount({ requestedAmount: 500, invoiceDue: 300, creditRemaining: 400 })).toBe(300)
    expect(capAllocationAmount({ requestedAmount: 500, invoiceDue: 400, creditRemaining: 300 })).toBe(300)
    expect(capAllocationAmount({ requestedAmount: 200, invoiceDue: 400, creditRemaining: 300 })).toBe(200)
  })

  it("floors at 0 when due or remaining is negative", () => {
    expect(capAllocationAmount({ requestedAmount: 100, invoiceDue: -50, creditRemaining: 100 })).toBe(0)
    expect(capAllocationAmount({ requestedAmount: 100, invoiceDue: 100, creditRemaining: -10 })).toBe(0)
  })
})

describe("proposeAllocation", () => {
  const candidate = { documentId: "inv-1", invoiceNumber: "INV-100", supplier: "Acme Supplies", due: 250 }

  it("matches on exact normalized invoice number and same normalized supplier", () => {
    const result = proposeAllocation({
      creditNote: { citedInvoiceNumber: " inv-100 ", supplier: "ACME SUPPLIES", remaining: 300 },
      candidates: [candidate],
    })
    expect(result).toEqual({ documentId: "inv-1", amount: 250 })
  })

  it("caps the proposed amount to the smaller of remaining and due", () => {
    const result = proposeAllocation({
      creditNote: { citedInvoiceNumber: "INV-100", supplier: "Acme Supplies", remaining: 100 },
      candidates: [candidate],
    })
    expect(result).toEqual({ documentId: "inv-1", amount: 100 })
  })

  it("returns null when the invoice number does not match exactly", () => {
    const result = proposeAllocation({
      creditNote: { citedInvoiceNumber: "INV-101", supplier: "Acme Supplies", remaining: 100 },
      candidates: [candidate],
    })
    expect(result).toBeNull()
  })

  it("returns null when the supplier does not match", () => {
    const result = proposeAllocation({
      creditNote: { citedInvoiceNumber: "INV-100", supplier: "Other Supplier", remaining: 100 },
      candidates: [candidate],
    })
    expect(result).toBeNull()
  })

  it("returns null when the credit note cites no invoice number", () => {
    const result = proposeAllocation({
      creditNote: { citedInvoiceNumber: null, supplier: "Acme Supplies", remaining: 100 },
      candidates: [candidate],
    })
    expect(result).toBeNull()
  })

  it("returns null with no candidates", () => {
    const result = proposeAllocation({
      creditNote: { citedInvoiceNumber: "INV-100", supplier: "Acme Supplies", remaining: 100 },
      candidates: [],
    })
    expect(result).toBeNull()
  })
})

describe("refuseIfOpenLine", () => {
  it("refuses when the invoice has an open payment line", () => {
    expect(refuseIfOpenLine({ hasOpenPaymentLine: true })).toEqual({ ok: false, reason: "open_payment_line" })
  })

  it("allows when there is no open payment line", () => {
    expect(refuseIfOpenLine({ hasOpenPaymentLine: false })).toEqual({ ok: true })
  })
})
