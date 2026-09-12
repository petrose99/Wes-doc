import { describe, expect, it } from "vitest"
import zaPack, {
  zaBorder,
  zaFilings,
  zaInputTax,
  zaInvoiceValidity,
  zaRetention,
  zaThresholds,
} from "@/lib/jurisdictions/za"
import { zaVat201FieldFor } from "@/lib/jurisdictions/za/input-tax"
import { zaThresholdAt, zaThresholdRules } from "@/lib/jurisdictions/za/thresholds"
import type { InvoiceLike, RuleResult } from "@/lib/jurisdictions/types"

const validFullInvoice: InvoiceLike = {
  hasTaxInvoiceWording: true,
  supplierName: "Acme (Pty) Ltd",
  supplierAddress: "1 Long St, Cape Town",
  supplierVatNumber: "4123456789",
  recipientName: "DocuBite (Pty) Ltd",
  recipientAddress: "2 Loop St, Cape Town",
  recipientVatNumber: "4987654321",
  recipientIsRegisteredVendor: true,
  invoiceNumber: "INV-2026-0001",
  issueDate: "2026-08-01",
  description: "Consulting services — August 2026",
  quantity: 1,
  netAmount: 10000,
  vatAmount: 1500,
  totalAmount: 11500,
  vatShownSeparately: true,
  currency: "ZAR",
  consideration: 11500,
}

function runAll<D>(rules: { apply: (d: D) => RuleResult }[], d: D): RuleResult[] {
  return rules.map((r) => r.apply(d))
}

describe("zaPack shape", () => {
  it("exports a v1 packVersion and every topic under one import", () => {
    expect(zaPack.code).toBe("ZA")
    expect(zaPack.packVersion).toBe("za-v1-2026-09")
    expect(zaPack.invoiceValidity).toBeDefined()
    expect(zaPack.inputTax).toBeDefined()
    expect(zaPack.filings).toBeDefined()
    expect(zaPack.retention).toBeDefined()
    expect(zaPack.thresholds).toBeDefined()
    expect(zaPack.border).toBeDefined()
  })
})

describe("invoice-validity", () => {
  it("passes a complete full tax invoice through every s20(4) rule", () => {
    const results = runAll(zaInvoiceValidity.fullInvoiceRules, validFullInvoice)
    for (const r of results) expect(r.ok).toBe(true)
  })

  it("fails when the 'Tax Invoice' wording is missing", () => {
    const bad: InvoiceLike = { ...validFullInvoice, hasTaxInvoiceWording: false }
    const results = runAll(zaInvoiceValidity.fullInvoiceRules, bad)
    const fails = results.filter((r) => !r.ok)
    expect(fails.length).toBeGreaterThan(0)
    expect(fails.some((r) => r.ok === false && r.ruleId === "za.s20.4.a.tax-invoice-wording")).toBe(true)
  })
})

describe("input-tax", () => {
  it("passes when a valid tax invoice is held", () => {
    const [r] = runAll(zaInputTax.rules, { hasValidTaxInvoice: true, isCapital: false, isImported: false })
    expect(r.ok).toBe(true)
  })

  it("fails when no valid tax invoice is held", () => {
    const [r] = runAll(zaInputTax.rules, { hasValidTaxInvoice: false, isCapital: false, isImported: false })
    expect(r.ok).toBe(false)
    if (r.ok === false) expect(r.ruleId).toBe("za.s16.2.a.valid-invoice-held")
  })

  it("routes each (capital, imported) claim to the correct VAT201 field", () => {
    expect(zaVat201FieldFor({ isCapital: true, isImported: false })).toBe("vat201.14")
    expect(zaVat201FieldFor({ isCapital: true, isImported: true })).toBe("vat201.14A")
    expect(zaVat201FieldFor({ isCapital: false, isImported: false })).toBe("vat201.15")
    expect(zaVat201FieldFor({ isCapital: false, isImported: true })).toBe("vat201.15A")
  })
})

describe("filings", () => {
  const baseDraft = {
    formId: "VAT201",
    fields: {
      "vat201.4": 1500,
      "vat201.4A": 0,
      "vat201.9": 0,
      "vat201.11": 0,
      "vat201.12": 0,
      "vat201.13": 1500,
      "vat201.14": 200,
      "vat201.14A": 0,
      "vat201.15": 500,
      "vat201.15A": 0,
      "vat201.16": 0,
      "vat201.17": 0,
      "vat201.18": 0,
      "vat201.19": 700,
    },
  }

  it("passes when field 13 = 4+4A+9+11+12 and field 19 = 14+14A+15+15A+16+17+18", () => {
    for (const rule of zaFilings.rules) {
      expect(rule.apply(baseDraft).ok).toBe(true)
    }
  })

  it("fails when field 19 does not equal the sum of its input-tax fields", () => {
    const draft = { ...baseDraft, fields: { ...baseDraft.fields, "vat201.19": 999 } }
    const results = zaFilings.rules.map((r) => r.apply(draft))
    const fails = results.filter((r) => !r.ok)
    expect(fails.length).toBe(1)
    expect(fails[0].ok === false && fails[0].ruleId).toBe("za.vat201.field-19.input-total")
  })
})

describe("retention", () => {
  it("passes for an invoice inside the 5-year window", () => {
    const [r] = runAll(zaRetention.rules, { invoiceDate: "2024-01-01", today: "2026-09-11" })
    expect(r.ok).toBe(true)
  })

  it("fails for an invoice older than 5 years", () => {
    const [r] = runAll(zaRetention.rules, { invoiceDate: "2018-01-01", today: "2026-09-11" })
    expect(r.ok).toBe(false)
    if (r.ok === false) expect(r.ruleId).toBe("za.s55.retention.5y")
  })
})

describe("thresholds", () => {
  it("picks the pre-1-Apr-2026 R1m compulsory row for a pre-jump date", () => {
    const row = zaThresholdAt(zaThresholds.compulsoryRegistration, "2026-03-15")
    expect(row?.amount).toBe(1_000_000)
  })

  it("picks the post-1-Apr-2026 R2.3m compulsory row for a post-jump date", () => {
    const row = zaThresholdAt(zaThresholds.compulsoryRegistration, "2026-05-15")
    expect(row?.amount).toBe(2_300_000)
  })

  it("passes when declared turnover is under threshold or workspace is registered", () => {
    const [r] = zaThresholdRules.map((rule) =>
      rule.apply({ declaredTurnoverZar: 500_000, asOfDate: "2026-05-15", isRegistered: false }),
    )
    expect(r.ok).toBe(true)
  })

  it("fails when declared turnover exceeds threshold and workspace is not registered", () => {
    const [r] = zaThresholdRules.map((rule) =>
      rule.apply({ declaredTurnoverZar: 3_000_000, asOfDate: "2026-05-15", isRegistered: false }),
    )
    expect(r.ok).toBe(false)
    if (r.ok === false) expect(r.ruleId).toBe("za.s23.1.compulsory.crossed")
  })
})

describe("border", () => {
  it("passes for a valid 10-digit ZA→LS invoice ≤ 90 days old", () => {
    const [r] = runAll(zaBorder.rules, {
      originCountry: "ZA",
      destinationCountry: "LS",
      supplierVatNumber: "4123456789",
      issueDate: "2026-08-01",
      today: "2026-09-01",
    })
    expect(r.ok).toBe(true)
  })

  it("fails when the ZA VAT number does not match ^4\\d{9}$", () => {
    const [r] = runAll(zaBorder.rules, {
      originCountry: "ZA",
      destinationCountry: "LS",
      supplierVatNumber: "9123456789",
      issueDate: "2026-08-01",
      today: "2026-09-01",
    })
    expect(r.ok).toBe(false)
    if (r.ok === false) expect(r.ruleId).toBe("za.rsa-rsl.invoice-usable-at-lesotho-border")
  })

  it("skips silently for non-ZA-to-LS trades", () => {
    const [r] = runAll(zaBorder.rules, {
      originCountry: "ZA",
      destinationCountry: "ZA",
      supplierVatNumber: "9123456789",
    })
    expect(r.ok).toBe(true)
  })
})
