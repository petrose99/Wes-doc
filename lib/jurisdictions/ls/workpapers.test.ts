/** LS VAT-12 workpaper — per-bucket routing, RSA cross-border predicate (inside window,
 * outside window, malformed VAT no.), zero-rate net-only invariant. */
import { describe, expect, it } from "vitest"
import type { Period, WorkpaperBill } from "../_shared/workpaper"
import { computeWorkpaper } from "../_shared/compute-workpaper"
import { isRsaCrossBorder, lsVat12 } from "./workpapers"

const period: Period = {
  id: "LS-2026-M03",
  startDate: new Date("2026-03-01"),
  endDate: new Date("2026-03-31"),
  workspaceBaseCurrency: "LSL",
}

function bill(id: string, overrides: Partial<WorkpaperBill> = {}): WorkpaperBill {
  return {
    id,
    invoiceDate: new Date("2026-03-15"),
    receivedAt: new Date("2026-03-16"),
    currency: "LSL",
    net: 1000,
    vat: 150,
    gross: 1150,
    taxRate: 15,
    category: "expense",
    supplier: { id: `s-${id}`, country: "LS", vatNumber: null, name: "Local supplier" },
    isImport: false,
    isCapital: false,
    fieldConfidence: 1,
    codingConfidence: 1,
    ...overrides,
  }
}

describe("lsVat12 workpaper", () => {
  it("has stable metadata for close-checklist wiring", () => {
    expect(lsVat12.id).toBe("LS_VAT12")
    expect(lsVat12.cadence).toBe("monthly")
    expect(lsVat12.outputVatAsserted).toBe(true)
    // 10 primary (5 local + 5 import) + 1 crossCutting
    expect(lsVat12.columns).toHaveLength(11)
    const primary = lsVat12.columns.filter((c) => c.role === "primary").length
    const cc = lsVat12.columns.filter((c) => c.role === "crossCutting").length
    expect(primary).toBe(10)
    expect(cc).toBe(1)
  })

  it("routes one bill per bucket to the correct column", () => {
    const bills: WorkpaperBill[] = [
      bill("l15", { isImport: false, taxRate: 15, net: 1000, vat: 150 }),
      bill("l10", { isImport: false, taxRate: 10, net: 2000, vat: 200 }),
      bill("l0",  { isImport: false, taxRate: 0,  net: 3000, vat: 0 }),
      bill("i15", { isImport: true,  taxRate: 15, net: 4000, vat: 600 }),
      bill("i10", { isImport: true,  taxRate: 10, net: 5000, vat: 500 }),
      bill("i0",  { isImport: true,  taxRate: 0,  net: 6000, vat: 0 }),
    ]
    const result = computeWorkpaper(lsVat12, bills, period)

    expect(result.totals.input_local_15_net).toBe(1000)
    expect(result.totals.input_local_15_vat).toBe(150)
    expect(result.totals.input_local_10_net).toBe(2000)
    expect(result.totals.input_local_10_vat).toBe(200)
    expect(result.totals.input_local_0_net).toBe(3000)
    expect(result.totals.input_import_15_net).toBe(4000)
    expect(result.totals.input_import_15_vat).toBe(600)
    expect(result.totals.input_import_10_net).toBe(5000)
    expect(result.totals.input_import_10_vat).toBe(500)
    expect(result.totals.input_import_0_net).toBe(6000)
  })

  it("zero-rate rows have net-only (no vat column exists)", () => {
    const ids = new Set(lsVat12.columns.map((c) => c.id))
    expect(ids.has("input_local_0_net")).toBe(true)
    expect(ids.has("input_local_0_vat")).toBe(false)
    expect(ids.has("input_import_0_net")).toBe(true)
    expect(ids.has("input_import_0_vat")).toBe(false)
  })
})

describe("isRsaCrossBorder + crossCutting slice", () => {
  const rsaSupplier = { id: "s-rsa", country: "ZA", vatNumber: "4001234567", name: "SA vendor" }

  it("includes an RSA bill inside the 90-day window", () => {
    const b = bill("in", {
      isImport: true,
      taxRate: 15,
      net: 1000, vat: 150,
      invoiceDate: new Date("2026-01-05"), // 85 days before 2026-03-31
      supplier: rsaSupplier,
    })
    expect(isRsaCrossBorder(b, period)).toBe(true)

    const result = computeWorkpaper(lsVat12, [b], period)
    expect(result.totals.input_rsa_cross_border_vat).toBe(150)
    // Bill also lands in the import × 15 bucket — the crossCutting slice does not remove
    // the row from its primary bucket.
    expect(result.totals.input_import_15_vat).toBe(150)
  })

  it("excludes an RSA bill outside the 90-day window", () => {
    const b = bill("out", {
      isImport: true,
      taxRate: 15,
      net: 1000, vat: 150,
      invoiceDate: new Date("2025-12-01"), // 120 days before 2026-03-31
      supplier: rsaSupplier,
    })
    expect(isRsaCrossBorder(b, period)).toBe(false)

    const result = computeWorkpaper(lsVat12, [b], period)
    expect(result.totals.input_rsa_cross_border_vat).toBe(0)
    // Still in the primary import × 15 bucket.
    expect(result.totals.input_import_15_vat).toBe(150)
  })

  it("excludes a bill with a malformed RSA VAT number", () => {
    const shortNumber = bill("short", {
      isImport: true, taxRate: 15,
      supplier: { ...rsaSupplier, vatNumber: "400123456" }, // 9 digits, not 10
    })
    const wrongPrefix = bill("prefix", {
      isImport: true, taxRate: 15,
      supplier: { ...rsaSupplier, vatNumber: "5001234567" }, // doesn't start with 4
    })
    const nullNumber = bill("null", {
      isImport: true, taxRate: 15,
      supplier: { ...rsaSupplier, vatNumber: null },
    })

    expect(isRsaCrossBorder(shortNumber, period)).toBe(false)
    expect(isRsaCrossBorder(wrongPrefix, period)).toBe(false)
    expect(isRsaCrossBorder(nullNumber, period)).toBe(false)
  })

  it("excludes a non-ZA supplier regardless of VAT number shape", () => {
    const b = bill("nz", {
      isImport: true, taxRate: 15,
      supplier: { id: "s", country: "GB", vatNumber: "4001234567", name: "UK vendor" },
    })
    expect(isRsaCrossBorder(b, period)).toBe(false)
  })
})

describe("column citations", () => {
  it("every column cites an rsl.org.ls source", () => {
    for (const column of lsVat12.columns) {
      expect(column.sourceRef).toContain("rsl.org.ls")
    }
  })
})
