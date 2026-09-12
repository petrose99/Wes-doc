/** ZA VAT201 workpaper — one bill per bucket + a zero-rated bill + verify box[18] total.
 *
 * The isImport / isCapital flags are the projection layer's job (#68); this test constructs
 * `WorkpaperBill` values directly so the workpaper itself is exercised in isolation. */
import { describe, expect, it } from "vitest"
import type { Period, WorkpaperBill } from "../_shared/workpaper"
import { computeWorkpaper } from "../_shared/compute-workpaper"
import { zaVat201 } from "./workpapers"

const period: Period = {
  id: "ZA-2026-M03",
  startDate: new Date("2026-03-01"),
  endDate: new Date("2026-03-31"),
  workspaceBaseCurrency: "ZAR",
}

function bill(id: string, overrides: Partial<WorkpaperBill> = {}): WorkpaperBill {
  return {
    id,
    invoiceDate: new Date("2026-03-15"),
    receivedAt: new Date("2026-03-16"),
    currency: "ZAR",
    net: 1000,
    vat: 150,
    gross: 1150,
    taxRate: 15,
    category: "expense",
    supplier: { id: `s-${id}`, country: "ZA", vatNumber: "4001234567", name: "Acme" },
    isImport: false,
    isCapital: false,
    fieldConfidence: 1,
    codingConfidence: 1,
    ...overrides,
  }
}

describe("zaVat201 workpaper", () => {
  it("has stable metadata for close-checklist wiring", () => {
    expect(zaVat201.id).toBe("ZA_VAT201")
    expect(zaVat201.cadence).toBe("bimonthly")
    expect(zaVat201.outputVatAsserted).toBe(true)
    expect(zaVat201.columns).toHaveLength(8)
  })

  it("routes one bill per bucket to the correct VAT box", () => {
    const domesticOther = bill("b-do", { isImport: false, isCapital: false, net: 1000, vat: 150 })
    const domesticCapital = bill("b-dc", { isImport: false, isCapital: true, net: 2000, vat: 300, category: "capital" })
    const importedOther = bill("b-io", { isImport: true, isCapital: false, net: 3000, vat: 450 })
    const importedCapital = bill("b-ic", { isImport: true, isCapital: true, net: 4000, vat: 600, category: "capital" })

    const result = computeWorkpaper(zaVat201, [domesticOther, domesticCapital, importedOther, importedCapital], period)

    // Box mapping matches lib/jurisdictions/za/input-tax.ts (SARS VAT201 guide):
    expect(result.boxes["15"]).toBe(150)   // domestic non-capital
    expect(result.boxes["14"]).toBe(300)   // domestic capital
    expect(result.boxes["15A"]).toBe(450)  // imported non-capital
    expect(result.boxes["14A"]).toBe(600)  // imported capital
  })

  it("box[18] sums the four VAT columns (total input tax)", () => {
    const bills = [
      bill("b-do", { isImport: false, isCapital: false, net: 1000, vat: 150 }),
      bill("b-dc", { isImport: false, isCapital: true, net: 2000, vat: 300, category: "capital" }),
      bill("b-io", { isImport: true, isCapital: false, net: 3000, vat: 450 }),
      bill("b-ic", { isImport: true, isCapital: true, net: 4000, vat: 600, category: "capital" }),
    ]
    const result = computeWorkpaper(zaVat201, bills, period)
    expect(result.boxes["18"]).toBe(150 + 300 + 450 + 600)
  })

  it("zero-rated bill contributes net but not VAT (VAT column returns 0, not null)", () => {
    const zeroRated = bill("b-zr", { taxRate: 0, net: 500, vat: 0, gross: 500 })
    const result = computeWorkpaper(zaVat201, [zeroRated], period)

    expect(result.totals.input_domestic_other_net).toBe(500)
    expect(result.totals.input_domestic_other_vat).toBe(0)
    expect(result.boxes["15"]).toBe(0)
    expect(result.boxes["18"]).toBe(0)
    // The row records 0 for its column, not null — the paper shows the zero-rated bill.
    expect(result.rows[0]!.values.input_domestic_other_net).toBe(500)
    expect(result.rows[0]!.values.input_domestic_other_vat).toBe(0)
    // But other buckets record null (the bill isn't in that bucket).
    expect(result.rows[0]!.values.input_imported_capital_vat).toBeNull()
  })

  it("net columns carry no box (only VAT columns feed VAT201 fields)", () => {
    for (const column of zaVat201.columns) {
      if (column.id.endsWith("_net")) expect(column.box).toBeUndefined()
      if (column.id.endsWith("_vat")) expect(column.box).toBeDefined()
    }
  })

  it("every column cites the SARS VAT201 guide", () => {
    for (const column of zaVat201.columns) {
      expect(column.sourceRef).toContain("sars.gov.za")
      expect(column.sourceRef).toContain("vat201")
    }
  })
})
