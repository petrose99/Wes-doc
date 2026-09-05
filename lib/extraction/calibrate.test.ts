import { describe, expect, it } from "vitest"
import { ARITHMETIC_CONFIDENCE, calibrateFieldConfidence, numberVariants, UNGROUNDED_CAP, VERBATIM_CONFIDENCE, type CalibrationInput } from "./calibrate"

const INVOICE_FIELDS = [
  { key: "vendor", type: "string" },
  { key: "issue_date", type: "date" },
  { key: "subtotal", type: "number" },
  { key: "tax_total", type: "number" },
  { key: "shipping_total", type: "number" },
  { key: "total", type: "number" },
  { key: "line_items", type: "array" },
]

const base = (overrides: Partial<CalibrationInput> = {}): CalibrationInput => ({
  templateCode: "invoice",
  fields: INVOICE_FIELDS,
  extraction: { vendor: "Bioplex", subtotal: 5964.5, tax_total: 596.45, shipping_total: 50, total: 6610.95 },
  fieldConfidence: { vendor: 0.8, subtotal: 0.85, tax_total: 0.85, shipping_total: 0.8, total: 0.85 },
  ocrText: "INVOICE Bioplex SUBTOTAL 5,964.50 SALES TAX 596.45 SHIPPING & HANDLING 50.00 TOTAL DUE 6,610.95",
  ...overrides,
})

describe("calibrateFieldConfidence", () => {
  it("boosts every field in a reconciling header identity to 0.99", () => {
    const result = calibrateFieldConfidence(base())
    for (const key of ["subtotal", "tax_total", "shipping_total", "total"]) {
      expect(result.fieldConfidence[key]).toBe(ARITHMETIC_CONFIDENCE)
      expect(result.corroborated).toContain(key)
    }
  })

  it("does not boost a header whose math does not reconcile", () => {
    const result = calibrateFieldConfidence(base({
      extraction: { subtotal: 100, tax_total: 20, total: 999 },
      fieldConfidence: { subtotal: 0.85, tax_total: 0.85, total: 0.85 },
      ocrText: null,
    }))
    expect(result.fieldConfidence.total).toBe(0.85)
    expect(result.corroborated).toEqual([])
  })

  it("works without shipping when the two-term identity holds", () => {
    const result = calibrateFieldConfidence(base({
      extraction: { subtotal: 100, tax_total: 20, total: 120 },
      fieldConfidence: { subtotal: 0.7, tax_total: 0.7, total: 0.7 },
      ocrText: null,
    }))
    expect(result.fieldConfidence.subtotal).toBe(ARITHMETIC_CONFIDENCE)
    expect(result.corroborated).not.toContain("shipping_total")
  })

  it("corroborates line items that sum to the subtotal", () => {
    const result = calibrateFieldConfidence(base({
      extraction: { subtotal: 100, line_items: [{ amount: 60 }, { amount: 40 }] },
      fieldConfidence: { subtotal: 0.8, line_items: 0.75 },
      ocrText: null,
    }))
    expect(result.fieldConfidence.line_items).toBe(ARITHMETIC_CONFIDENCE)
    expect(result.fieldConfidence.subtotal).toBe(ARITHMETIC_CONFIDENCE)
  })

  it("skips the line-item identity when any row is missing an amount", () => {
    const result = calibrateFieldConfidence(base({
      extraction: { subtotal: 100, line_items: [{ amount: 60 }, { description: "orphan" }] },
      fieldConfidence: { subtotal: 0.8, line_items: 0.75 },
      ocrText: null,
    }))
    expect(result.fieldConfidence.line_items).toBe(0.75)
  })

  it("corroborates a receipt's items + tax = total", () => {
    const result = calibrateFieldConfidence(base({
      templateCode: "receipt",
      fields: [{ key: "total", type: "number" }, { key: "tax_total", type: "number" }, { key: "line_items", type: "array" }],
      extraction: { total: 120, tax_total: 20, line_items: [{ amount: 60 }, { amount: 40 }] },
      fieldConfidence: { total: 0.8, tax_total: 0.8, line_items: 0.8 },
      ocrText: null,
    }))
    expect(result.fieldConfidence.total).toBe(ARITHMETIC_CONFIDENCE)
    expect(result.fieldConfidence.line_items).toBe(ARITHMETIC_CONFIDENCE)
  })

  it("corroborates a bank statement whose balance reconciles", () => {
    const result = calibrateFieldConfidence(base({
      templateCode: "bank_statement",
      fields: [{ key: "opening_balance", type: "number" }, { key: "closing_balance", type: "number" }, { key: "transactions", type: "array" }],
      extraction: { opening_balance: 1000, closing_balance: 1150, transactions: [{ credit: 200, debit: null }, { credit: null, debit: 50 }] },
      fieldConfidence: { opening_balance: 0.8, closing_balance: 0.8, transactions: 0.7 },
      ocrText: null,
    }))
    expect(result.fieldConfidence.opening_balance).toBe(ARITHMETIC_CONFIDENCE)
    expect(result.fieldConfidence.closing_balance).toBe(ARITHMETIC_CONFIDENCE)
    expect(result.fieldConfidence.transactions).toBe(ARITHMETIC_CONFIDENCE)
  })

  it("leaves a non-reconciling bank statement alone", () => {
    const result = calibrateFieldConfidence(base({
      templateCode: "bank_statement",
      fields: [{ key: "opening_balance", type: "number" }, { key: "closing_balance", type: "number" }, { key: "transactions", type: "array" }],
      extraction: { opening_balance: 1000, closing_balance: 9999, transactions: [{ credit: 200, debit: 50 }] },
      fieldConfidence: { opening_balance: 0.8, closing_balance: 0.8, transactions: 0.7 },
      ocrText: null,
    }))
    expect(result.fieldConfidence.closing_balance).toBe(0.8)
  })

  it("boosts a string found verbatim in the OCR text", () => {
    const result = calibrateFieldConfidence(base())
    expect(result.fieldConfidence.vendor).toBe(VERBATIM_CONFIDENCE)
  })

  it("finds a number printed with thousand separators", () => {
    const result = calibrateFieldConfidence(base({
      templateCode: null,
      extraction: { total: 6610.95 },
      fieldConfidence: { total: 0.8 },
      fields: [{ key: "total", type: "number" }],
      ocrText: "TOTAL DUE 6,610.95",
    }))
    expect(result.fieldConfidence.total).toBe(VERBATIM_CONFIDENCE)
  })

  it("caps a number found nowhere in the text", () => {
    const result = calibrateFieldConfidence(base({
      templateCode: null,
      extraction: { total: 1234.56 },
      fieldConfidence: { total: 0.97 },
      fields: [{ key: "total", type: "number" }],
      ocrText: "TOTAL DUE 9,999.00",
    }))
    expect(result.fieldConfidence.total).toBe(UNGROUNDED_CAP)
  })

  it("never dampens strings or dates", () => {
    const result = calibrateFieldConfidence(base({
      templateCode: null,
      extraction: { vendor: "Nowhere Corp", issue_date: "2026-01-15" },
      fieldConfidence: { vendor: 0.9, issue_date: 0.9 },
      fields: [{ key: "vendor", type: "string" }, { key: "issue_date", type: "date" }],
      ocrText: "completely unrelated text",
    }))
    expect(result.fieldConfidence.vendor).toBe(0.9)
    expect(result.fieldConfidence.issue_date).toBe(0.9)
  })

  it("arithmetic wins over the ungrounded cap", () => {
    // OCR garbled the subtotal's printed form, but the identity still proves the value.
    const result = calibrateFieldConfidence(base({
      ocrText: "INVOICE Bioplex garbled numbers here",
    }))
    expect(result.fieldConfidence.subtotal).toBe(ARITHMETIC_CONFIDENCE)
  })

  it("does no arithmetic for an unknown template", () => {
    const result = calibrateFieldConfidence(base({ templateCode: "custom_thing", ocrText: null }))
    expect(result.corroborated).toEqual([])
  })
})

describe("suspect tracking", () => {
  it("flags header fields when the identity fails to reconcile", () => {
    const result = calibrateFieldConfidence(base({
      extraction: { subtotal: 100, tax_total: 20, total: 999 },
      fieldConfidence: { subtotal: 0.85, tax_total: 0.85, total: 0.85 },
      ocrText: null,
    }))
    expect(result.suspect).toEqual(["subtotal", "tax_total", "total"])
  })

  it("flags an ungrounded number as suspect", () => {
    const result = calibrateFieldConfidence(base({
      templateCode: null,
      extraction: { total: 1234.56 },
      fieldConfidence: { total: 0.97 },
      fields: [{ key: "total", type: "number" }],
      ocrText: "TOTAL DUE 9,999.00",
    }))
    expect(result.suspect).toEqual(["total"])
  })

  it("never marks a corroborated field suspect, even if its printed form is garbled", () => {
    const result = calibrateFieldConfidence(base({ ocrText: "INVOICE Bioplex garbled numbers here" }))
    expect(result.suspect).toEqual([])
  })

  it("flags balance fields when a statement does not reconcile", () => {
    const result = calibrateFieldConfidence(base({
      templateCode: "bank_statement",
      fields: [{ key: "opening_balance", type: "number" }, { key: "closing_balance", type: "number" }, { key: "transactions", type: "array" }],
      extraction: { opening_balance: 1000, closing_balance: 9999, transactions: [{ credit: 200, debit: 50 }] },
      fieldConfidence: { opening_balance: 0.8, closing_balance: 0.8, transactions: 0.7 },
      ocrText: null,
    }))
    expect(result.suspect).toEqual(["closing_balance", "opening_balance", "transactions"])
  })

  it("reports nothing suspect for a clean reconciling document", () => {
    const result = calibrateFieldConfidence(base())
    expect(result.suspect).toEqual([])
  })
})

describe("numberVariants", () => {
  it("covers plain, fixed-2, and comma-grouped forms", () => {
    const variants = numberVariants(6610.95)
    expect(variants).toContain("6610.95")
    expect(variants).toContain("6,610.95")
  })

  it("covers integers with and without decimals", () => {
    const variants = numberVariants(400)
    expect(variants).toContain("400")
    expect(variants).toContain("400.00")
  })

  it("covers negative and parenthesised forms", () => {
    const variants = numberVariants(-1250.5)
    expect(variants).toContain("-1,250.50")
    expect(variants).toContain("(1,250.50)")
  })
})
