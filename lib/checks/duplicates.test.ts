import { describe, expect, it } from "vitest"
import { findNearDuplicate, type DocumentIdentity } from "@/lib/checks/duplicates"

const identity = (overrides: Partial<DocumentIdentity> = {}): DocumentIdentity => ({
  documentId: "d1", supplier: "Acme Supplies", invoiceNumber: "INV-100", total: 500, currencyCode: "USD",
  ...overrides,
})

describe("findNearDuplicate", () => {
  it("returns null without a supplier, invoice number, or total", () => {
    expect(findNearDuplicate(identity({ supplier: null }), [])).toBeNull()
    expect(findNearDuplicate(identity({ invoiceNumber: "" }), [])).toBeNull()
    expect(findNearDuplicate(identity({ total: null }), [])).toBeNull()
  })

  it("passes with no other documents", () => {
    expect(findNearDuplicate(identity(), [])?.status).toBe("pass")
  })

  it("warns when another document matches supplier, invoice number, and total", () => {
    const other = identity({ documentId: "d2" })
    expect(findNearDuplicate(identity(), [other])?.status).toBe("warn")
  })

  it("matches case-insensitively and across surrounding whitespace", () => {
    const other = identity({ documentId: "d2", supplier: "  ACME SUPPLIES  ", invoiceNumber: " inv-100 " })
    expect(findNearDuplicate(identity(), [other])?.status).toBe("warn")
  })

  it("does not match itself", () => {
    expect(findNearDuplicate(identity(), [identity()])?.status).toBe("pass")
  })

  it("does not match a substantively different invoice number from the same supplier", () => {
    // A2.3: the fuzzy match tolerates ONE character (OCR misread). "INV-100" vs "INV-999"
    // is a three-character jump — that must stay unambiguous "not a duplicate".
    const other = identity({ documentId: "d2", invoiceNumber: "INV-999" })
    expect(findNearDuplicate(identity(), [other])?.status).toBe("pass")
  })

  it("does not match the same supplier and invoice number with a materially different total", () => {
    const other = identity({ documentId: "d2", total: 700 })
    expect(findNearDuplicate(identity(), [other])?.status).toBe("pass")
  })

  it("tolerates rounding noise in the total", () => {
    const other = identity({ documentId: "d2", total: 500.001 })
    expect(findNearDuplicate(identity(), [other])?.status).toBe("warn")
  })
})

describe("findNearDuplicate — A2.3 normalized invoice numbers + credit-note pairs", () => {
  const base = { documentId: "d1", supplier: "Acme Ltd", invoiceNumber: "INV-2026/0442", total: 100, currencyCode: "USD" }
  const other = { documentId: "d2", supplier: "ACME LIMITED", invoiceNumber: "INV 2026 0442", total: 100, currencyCode: "USD" }

  it("normalizes both sides of the invoice number", () => {
    const result = findNearDuplicate(base, [other])
    expect(result?.status).toBe("warn")
    expect(result?.detail?.matchedDocumentId).toBe("d2")
  })

  it("warns on a one-character invoice-number difference (OCR misread)", () => {
    const typo = { documentId: "d3", supplier: "Acme Ltd", invoiceNumber: "INV20260443", total: 100, currencyCode: "USD" }
    const result = findNearDuplicate({ ...base, invoiceNumber: "INV20260442" }, [typo])
    expect(result?.detail?.fuzzy).toBe(true)
  })

  it("does NOT warn when the sign-opposite counterpart is a credit note", () => {
    const credit = { documentId: "d4", supplier: "Acme Ltd", invoiceNumber: "INV-2026/0442", total: -100, currencyCode: "USD", isCreditNote: true }
    const result = findNearDuplicate(base, [credit])
    expect(result?.status).toBe("pass")
  })
})
