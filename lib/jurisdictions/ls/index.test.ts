import { describe, expect, it } from "vitest"
import lsPack, {
  lsBorder,
  lsFilings,
  lsInputTax,
  lsInvoiceValidity,
  lsRetention,
  lsThresholds,
} from "@/lib/jurisdictions/ls"
import { lsVat12FieldFor } from "@/lib/jurisdictions/ls/input-tax"
import { lsThresholdAt, lsThresholdRules } from "@/lib/jurisdictions/ls/thresholds"
import type { InvoiceLike, RuleResult } from "@/lib/jurisdictions/types"

const validFullInvoice: InvoiceLike = {
  hasTaxInvoiceWording: true,
  supplierName: "Highland Supplies (Pty) Ltd",
  supplierAddress: "Kingsway Rd, Maseru",
  supplierVatNumber: "LS-VAT-001234",
  recipientName: "DocuBite (Pty) Ltd",
  recipientAddress: "Nightingale, Maseru",
  recipientVatNumber: "LS-VAT-005678",
  recipientIsRegisteredVendor: true,
  invoiceNumber: "INV-2026-0001",
  issueDate: "2026-08-01",
  description: "Office consumables — August 2026",
  quantity: 12,
  netAmount: 10000,
  vatAmount: 1500,
  totalAmount: 11500,
  vatShownSeparately: true,
  currency: "LSL",
  consideration: 11500,
}

function runAll<D>(rules: { apply: (d: D) => RuleResult }[], d: D): RuleResult[] {
  return rules.map((r) => r.apply(d))
}

describe("lsPack shape", () => {
  it("exports a v1 packVersion and every topic under one import", () => {
    expect(lsPack.code).toBe("LS")
    expect(lsPack.packVersion).toBe("ls-v1-2026-09")
    expect(lsPack.invoiceValidity).toBeDefined()
    expect(lsPack.inputTax).toBeDefined()
    expect(lsPack.filings).toBeDefined()
    expect(lsPack.retention).toBeDefined()
    expect(lsPack.thresholds).toBeDefined()
    expect(lsPack.border).toBeDefined()
    expect(lsPack.workpapers).toBeDefined()
    expect(lsPack.workpapers!.length).toBeGreaterThan(0)
  })
})

describe("invoice-validity", () => {
  it("passes a complete Schedule III invoice through every rule", () => {
    const results = runAll(lsInvoiceValidity.fullInvoiceRules, validFullInvoice)
    for (const r of results) expect(r.ok).toBe(true)
  })

  it("fails when the tax-invoice wording is missing", () => {
    const bad: InvoiceLike = { ...validFullInvoice, hasTaxInvoiceWording: false }
    const results = runAll(lsInvoiceValidity.fullInvoiceRules, bad)
    const fails = results.filter((r) => !r.ok)
    expect(fails.length).toBeGreaterThan(0)
    expect(
      fails.some((r) => r.ok === false && r.ruleId === "ls.s24.8.a.tax-invoice-wording"),
    ).toBe(true)
  })

  it("fails when the supplier TIN is missing", () => {
    const bad: InvoiceLike = { ...validFullInvoice, supplierVatNumber: undefined }
    const results = runAll(lsInvoiceValidity.fullInvoiceRules, bad)
    expect(results.some((r) => r.ok === false && r.ruleId === "ls.s24.8.b.supplier-identity")).toBe(true)
  })
})

describe("input-tax", () => {
  it("passes when a valid tax invoice is held", () => {
    const [r] = runAll(lsInputTax.rules, {
      hasValidTaxInvoice: true, isCapital: false, isImported: false,
    })
    expect(r.ok).toBe(true)
  })

  it("fails when no valid tax invoice is held", () => {
    const [r] = runAll(lsInputTax.rules, {
      hasValidTaxInvoice: false, isCapital: false, isImported: false,
    })
    expect(r.ok).toBe(false)
    if (r.ok === false) expect(r.ruleId).toBe("ls.s23.4.valid-invoice-held")
  })

  it("routes each (isImport, isService, isDeferred) bucket to the correct VAT-12 line", () => {
    expect(lsVat12FieldFor({ isImport: false, isService: false })).toBe("vat12.7a")
    expect(lsVat12FieldFor({ isImport: false, isService: true })).toBe("vat12.7b")
    expect(lsVat12FieldFor({ isImport: true, isService: false, isDeferred: true })).toBe("vat12.8a")
    expect(lsVat12FieldFor({ isImport: true, isService: true, isDeferred: true })).toBe("vat12.8b")
    expect(lsVat12FieldFor({ isImport: true, isService: false })).toBe("vat12.8c")
    expect(lsVat12FieldFor({ isImport: true, isService: true })).toBe("vat12.8d")
  })
})

describe("filings", () => {
  const baseDraft = {
    formId: "VAT12",
    fields: {
      "vat12.5": 1500,
      "vat12.7a": 200,
      "vat12.7b": 100,
      "vat12.8a": 0,
      "vat12.8b": 0,
      "vat12.8c": 300,
      "vat12.8d": 0,
      "vat12.9": 600,
      "vat12.10": 600,
      "vat12.11": 900,
    },
  }

  it("passes when field 9 equals the sum of 7a + 7b + 8a-d and field 11 = 5 − 10", () => {
    for (const rule of lsFilings.rules) {
      const result = rule.apply(baseDraft)
      expect(result.ok).toBe(true)
    }
  })

  it("fails when field 9 does not equal the sum of its input-VAT rows", () => {
    const draft = { ...baseDraft, fields: { ...baseDraft.fields, "vat12.9": 999 } }
    const results = lsFilings.rules.map((r) => r.apply(draft))
    expect(results.some((r) => r.ok === false && r.ruleId === "ls.vat12.field-9.input-total")).toBe(true)
  })

  it("fails when field 11 does not equal 5 − 10", () => {
    const draft = { ...baseDraft, fields: { ...baseDraft.fields, "vat12.11": 0 } }
    const results = lsFilings.rules.map((r) => r.apply(draft))
    expect(results.some((r) => r.ok === false && r.ruleId === "ls.vat12.field-11.net-vat")).toBe(true)
  })

  it("declares monthly cadence, 15% standard rate, 20th due day", () => {
    expect(lsFilings.formId).toBe("VAT12")
    expect(lsFilings.standardRate).toBe(0.15)
    expect(lsFilings.dueDay).toBe(20)
  })

  it("carries the 10% electricity reduced rate", () => {
    const electricity = lsFilings.reducedRates.find((r) => r.id === "ls.electricity")
    expect(electricity?.rate).toBe(0.1)
  })
})

describe("retention", () => {
  it("passes for an invoice inside the 5-year window", () => {
    const [r] = runAll(lsRetention.rules, { invoiceDate: "2024-01-01", today: "2026-09-11" })
    expect(r.ok).toBe(true)
  })

  it("fails for an invoice older than 5 years", () => {
    const [r] = runAll(lsRetention.rules, { invoiceDate: "2018-01-01", today: "2026-09-11" })
    expect(r.ok).toBe(false)
    if (r.ok === false) expect(r.ruleId).toBe("ls.s48.retention.5y")
  })
})

describe("thresholds", () => {
  it("picks the pre-2025 M850k compulsory row for a pre-jump date", () => {
    const row = lsThresholdAt(lsThresholds.compulsoryRegistration, "2025-03-15")
    expect(row?.amount).toBe(850_000)
  })

  it("picks the post-25-Apr-2025 M2m compulsory row for a post-jump date", () => {
    const row = lsThresholdAt(lsThresholds.compulsoryRegistration, "2026-05-15")
    expect(row?.amount).toBe(2_000_000)
  })

  it("passes when declared turnover is under threshold", () => {
    const [r] = lsThresholdRules.map((rule) =>
      rule.apply({ declaredTurnoverLsl: 500_000, asOfDate: "2026-05-15", isRegistered: false }),
    )
    expect(r.ok).toBe(true)
  })

  it("fails when declared turnover exceeds threshold and workspace is not registered", () => {
    const [r] = lsThresholdRules.map((rule) =>
      rule.apply({ declaredTurnoverLsl: 3_000_000, asOfDate: "2026-05-15", isRegistered: false }),
    )
    expect(r.ok).toBe(false)
    if (r.ok === false) expect(r.ruleId).toBe("ls.s17.1.compulsory.crossed")
  })
})

describe("border", () => {
  it("passes for a valid 10-digit ZA→LS invoice ≤ 90 days old", () => {
    const [r] = runAll(lsBorder.rules, {
      originCountry: "ZA",
      destinationCountry: "LS",
      supplierVatNumber: "4123456789",
      issueDate: "2026-08-01",
      today: "2026-09-01",
    })
    expect(r.ok).toBe(true)
  })

  it("fails when the ZA VAT number does not match ^4\\d{9}$", () => {
    const [r] = runAll(lsBorder.rules, {
      originCountry: "ZA",
      destinationCountry: "LS",
      supplierVatNumber: "9123456789",
      issueDate: "2026-08-01",
      today: "2026-09-01",
    })
    expect(r.ok).toBe(false)
    if (r.ok === false) expect(r.ruleId).toBe("ls.rsa-rsl.invoice-payable-at-border")
  })

  it("fails when the invoice is older than 90 days", () => {
    const [r] = runAll(lsBorder.rules, {
      originCountry: "ZA",
      destinationCountry: "LS",
      supplierVatNumber: "4123456789",
      issueDate: "2026-04-01",
      today: "2026-09-01", // ~153 days later
    })
    expect(r.ok).toBe(false)
    if (r.ok === false) expect(r.ruleId).toBe("ls.rsa-rsl.invoice-payable-at-border")
  })

  it("skips silently for non-ZA-to-LS trades", () => {
    const [r] = runAll(lsBorder.rules, {
      originCountry: "GB",
      destinationCountry: "LS",
      supplierVatNumber: "9123456789",
    })
    expect(r.ok).toBe(true)
  })
})
