/** #68: shared workpaper substrate — projection, compute, layout.
 *
 * Uses a fake pack (two primary VAT columns split by isImport + one crossCutting slice for
 * "supplier VAT no. starts with 4") to exercise every branch without leaning on ZA/LS content. */
import { describe, expect, it } from "vitest"
import type { Period, Workpaper, WorkpaperBill } from "./workpaper"
import { resolveWorkpaperById, resolveWorkpapersForJurisdiction } from "./workpaper"
import { projectWorkpaperBill } from "./project-bill"
import { computeWorkpaper } from "./compute-workpaper"
import { layoutWorkpaper } from "./layout-workpaper"

const period: Period = {
  id: "TEST-2026-M03",
  startDate: new Date("2026-03-01"),
  endDate: new Date("2026-03-31"),
  workspaceBaseCurrency: "ZAR",
}

const fakePack: Workpaper = {
  id: "TEST_WP",
  label: "Test workpaper",
  sourceRef: "https://example.gov/test",
  cadence: "monthly",
  columns: [
    {
      id: "input_domestic_vat",
      label: "Input VAT (domestic)",
      sourceRef: "https://example.gov/test#domestic",
      select: (bill) => (bill.isImport ? null : bill.vat),
      role: "primary",
      box: "A",
    },
    {
      id: "input_imported_vat",
      label: "Input VAT (imported)",
      sourceRef: "https://example.gov/test#imported",
      select: (bill) => (bill.isImport ? bill.vat : null),
      role: "primary",
      box: "B",
    },
    {
      id: "cross_border_slice",
      label: "Cross-border slice",
      sourceRef: "https://example.gov/test#slice",
      select: (bill) => (bill.supplier.vatNumber?.startsWith("4") ? bill.vat : null),
      role: "crossCutting",
    },
  ],
  boxes: {
    TOTAL: (sums) => sums.input_domestic_vat + sums.input_imported_vat,
  },
  outputVatAsserted: true,
}

function bill(overrides: Partial<WorkpaperBill> = {}): WorkpaperBill {
  return {
    id: "b1",
    invoiceDate: new Date("2026-03-15"),
    receivedAt: new Date("2026-03-16"),
    currency: "ZAR",
    net: 100,
    vat: 15,
    gross: 115,
    taxRate: 15,
    category: "expense",
    supplier: { id: "s1", country: "ZA", vatNumber: "4001234567", name: "Acme" },
    isImport: false,
    isCapital: false,
    fieldConfidence: 1,
    codingConfidence: 1,
    ...overrides,
  }
}

describe("projectWorkpaperBill", () => {
  it("prefers reviewedData over fieldSnapshot field-by-field", () => {
    const projected = projectWorkpaperBill(
      { invoiceDate: "2026-03-15", net: 100, vat: 15, supplier: { country: "ZA" } },
      { invoiceDate: "2020-01-01", net: 9999, vat: 9999, currency: "USD" },
      { country: "ZA" },
      "b1",
    )
    expect(projected).not.toBeNull()
    expect(projected!.net).toBe(100)
    expect(projected!.vat).toBe(15)
    expect(projected!.currency).toBe("USD") // filled from fieldSnapshot where reviewedData was silent
    expect(projected!.invoiceDate.toISOString()).toBe("2026-03-15T00:00:00.000Z")
  })

  it("returns null when the invoice date is missing entirely", () => {
    expect(
      projectWorkpaperBill({ net: 100, vat: 15 }, null, { country: "ZA" }, "b1"),
    ).toBeNull()
  })

  it("reconciles missing gross from net + vat", () => {
    const p = projectWorkpaperBill(
      { invoiceDate: "2026-03-15", net: 100, vat: 15 },
      null,
      { country: "ZA" },
      "b1",
    )
    expect(p!.gross).toBe(115)
  })

  it("marks isImport true when supplier country differs from workspace country", () => {
    const p = projectWorkpaperBill(
      { invoiceDate: "2026-03-15", net: 100, vat: 15, supplier: { country: "za" } },
      null,
      { country: "LS" },
      "b1",
    )
    expect(p!.isImport).toBe(true)
    expect(p!.supplier.country).toBe("ZA") // normalised uppercase
  })

  it("returns isImport false when supplier country is absent", () => {
    const p = projectWorkpaperBill(
      { invoiceDate: "2026-03-15", net: 100, vat: 15, supplier: {} },
      null,
      { country: "ZA" },
      "b1",
    )
    expect(p!.isImport).toBe(false)
  })

  it("normalises category — 'capital' becomes isCapital, everything else expense", () => {
    const cap = projectWorkpaperBill(
      { invoiceDate: "2026-03-15", net: 100, vat: 15, category: "capital" },
      null, { country: "ZA" }, "b1",
    )
    expect(cap!.isCapital).toBe(true)
    const other = projectWorkpaperBill(
      { invoiceDate: "2026-03-15", net: 100, vat: 15, category: "office_supplies" },
      null, { country: "ZA" }, "b1",
    )
    expect(other!.isCapital).toBe(false)
    expect(other!.category).toBe("expense")
  })

  it("infers taxRate from net and vat when not given", () => {
    const p = projectWorkpaperBill(
      { invoiceDate: "2026-03-15", net: 200, vat: 30 },
      null, { country: "ZA" }, "b1",
    )
    expect(p!.taxRate).toBe(15)
  })
})

describe("computeWorkpaper", () => {
  it("sums per-column contributions and skips null selects", () => {
    const domestic = bill({ id: "b1", vat: 15, isImport: false })
    const imported = bill({ id: "b2", vat: 30, isImport: true })
    const zero = bill({ id: "b3", vat: 0, taxRate: 0, isImport: false })

    const result = computeWorkpaper(fakePack, [domestic, imported, zero], period)

    expect(result.rows).toHaveLength(3)
    expect(result.totals.input_domestic_vat).toBe(15)
    expect(result.totals.input_imported_vat).toBe(30)
    // Zero-rated bill contributed 0, not null — 0 is on the paper.
    expect(result.rows[2]!.values.input_domestic_vat).toBe(0)
  })

  it("routes 1:1 columns through their box and lets combiners override", () => {
    const domestic = bill({ id: "b1", vat: 15, isImport: false })
    const imported = bill({ id: "b2", vat: 30, isImport: true })
    const result = computeWorkpaper(fakePack, [domestic, imported], period)

    expect(result.boxes.A).toBe(15)
    expect(result.boxes.B).toBe(30)
    expect(result.boxes.TOTAL).toBe(45)
  })

  it("guards against a broken select returning NaN by treating it as null", () => {
    const brokenPack: Workpaper = {
      ...fakePack,
      columns: [
        {
          id: "broken",
          label: "Broken",
          sourceRef: "https://example.gov",
          select: () => NaN,
          role: "primary",
        },
      ],
      boxes: undefined,
    }
    const result = computeWorkpaper(brokenPack, [bill()], period)
    expect(result.totals.broken).toBe(0)
    expect(result.rows[0]!.values.broken).toBeNull()
  })
})

describe("layoutWorkpaper", () => {
  it("groups columns primary-then-crossCutting and pairs rows with per-column values", () => {
    const domestic = bill({ id: "b1", isImport: false, supplier: { ...bill().supplier, vatNumber: "4001234567" } })
    const imported = bill({ id: "b2", isImport: true, supplier: { ...bill().supplier, vatNumber: "9990000000" } })
    const result = computeWorkpaper(fakePack, [domestic, imported], period)
    const layout = layoutWorkpaper(fakePack, result)

    expect(layout.columnGroups[0]!.role).toBe("primary")
    expect(layout.columnGroups[0]!.columns.map((c) => c.id))
      .toEqual(["input_domestic_vat", "input_imported_vat"])
    expect(layout.columnGroups[1]!.role).toBe("crossCutting")
    expect(layout.columnGroups[1]!.columns.map((c) => c.id)).toEqual(["cross_border_slice"])

    expect(layout.rows).toHaveLength(2)
    expect(layout.totalsRow.map((t) => t.columnId))
      .toEqual(["input_domestic_vat", "input_imported_vat", "cross_border_slice"])
    expect(layout.outputVat.asserted).toBe(true)
  })

  it("surfaces contributingColumns per box (single, and `*` for combiners)", () => {
    const result = computeWorkpaper(fakePack, [bill()], period)
    const layout = layoutWorkpaper(fakePack, result)

    const boxA = layout.boxSummary.find((b) => b.box === "A")!
    expect(boxA.contributingColumns).toEqual(["input_domestic_vat"])

    const boxTotal = layout.boxSummary.find((b) => b.box === "TOTAL")!
    expect(boxTotal.contributingColumns).toEqual(["*"])
  })
})

describe("resolveWorkpapersForJurisdiction / resolveWorkpaperById", () => {
  it("returns an empty list when the pack is null or has no workpapers slot", () => {
    expect(resolveWorkpapersForJurisdiction(null)).toEqual([])
    // Cast: only the workpapers slot matters for this branch.
    expect(resolveWorkpapersForJurisdiction({ code: "ZA", packVersion: "x" } as never)).toEqual([])
  })

  it("finds a workpaper by id and returns null for a missing id", () => {
    const pack = { code: "ZA", packVersion: "x", workpapers: [fakePack] } as never
    expect(resolveWorkpaperById(pack, "TEST_WP")).toBe(fakePack)
    expect(resolveWorkpaperById(pack, "NOPE")).toBeNull()
  })
})
