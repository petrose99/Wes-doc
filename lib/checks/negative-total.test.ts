import { describe, expect, it } from "vitest"
import { checkCreditExceedsInvoice, checkCreditNoInvoiceMatch, checkNegativeTotal } from "@/lib/checks/negative-total"

describe("checkNegativeTotal", () => {
  it("fires for an invoice with a negative total", () => {
    const result = checkNegativeTotal({ docType: "invoice", total: -50 })
    expect(result?.checkCode).toBe("invoice_negative_total")
    expect(result?.status).toBe("fail")
    expect(result?.detail).toEqual({ suggestedAction: "move_to_credit_note" })
  })

  it("passes an invoice with a non-negative total", () => {
    expect(checkNegativeTotal({ docType: "invoice", total: 50 })).toBeNull()
  })

  it("never fires for a credit note, even a negative one", () => {
    expect(checkNegativeTotal({ docType: "credit_note", total: -50 })).toBeNull()
  })

  it("never fires when total is unresolved", () => {
    expect(checkNegativeTotal({ docType: "invoice", total: null })).toBeNull()
  })
})

describe("checkCreditExceedsInvoice", () => {
  it("warns when the credit total exceeds the invoice's due", () => {
    const result = checkCreditExceedsInvoice({ creditTotal: 150, invoiceNumber: "INV-1", invoiceDue: 100 })
    expect(result?.checkCode).toBe("credit_exceeds_invoice")
    expect(result?.status).toBe("warn")
    expect(result?.message).toContain("INV-1")
  })

  it("passes when the credit total is within the invoice's due", () => {
    expect(checkCreditExceedsInvoice({ creditTotal: 100, invoiceNumber: "INV-1", invoiceDue: 100 })).toBeNull()
  })
})

describe("checkCreditNoInvoiceMatch", () => {
  it("warns naming the missing invoice and supplier", () => {
    const result = checkCreditNoInvoiceMatch({ invoiceNumber: "INV-9", supplier: "Acme" })
    expect(result?.checkCode).toBe("credit_no_matching_invoice")
    expect(result?.status).toBe("warn")
    expect(result?.message).toContain("INV-9")
    expect(result?.message).toContain("Acme")
  })
})
