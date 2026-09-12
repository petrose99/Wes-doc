/** LS_VAT12_RETURN — exhaustive coverage of the (isImport × isService × isDeferred) triples
 * against VAT-12 lines 7a–8d at the standard 15% rate, plus null-projection silent-pass and
 * zero-rated contribution. */
import { describe, expect, it } from "vitest"
import { computeWorkpaper } from "../_shared/compute-workpaper"
import type { Period, WorkpaperBill } from "../_shared/workpaper"
import { lsVat12FieldFor } from "./input-tax"
import { lsVat12Return, lsWorkpaperGroups, lsWorkpapers } from "./workpapers"

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
    isService: false,
    isDeferred: null,
    fieldConfidence: 1,
    codingConfidence: 1,
    ...overrides,
  }
}

const colId = (field: string, leg: "net" | "vat") => `${field.replace(".", "_")}_${leg}`

describe("lsVat12Return workpaper — metadata", () => {
  it("has stable id, cadence, and 12 columns (6 lines × net+vat)", () => {
    expect(lsVat12Return.id).toBe("LS_VAT12_RETURN")
    expect(lsVat12Return.cadence).toBe("monthly")
    expect(lsVat12Return.outputVatAsserted).toBe(true)
    expect(lsVat12Return.columns).toHaveLength(12)
    expect(lsVat12Return.columns.every((c) => c.role === "primary")).toBe(true)
  })

  it("every column cites an rsl.org.ls source and carries its VAT-12 box code", () => {
    for (const column of lsVat12Return.columns) {
      expect(column.sourceRef).toContain("rsl.org.ls")
      expect(column.box).toMatch(/^vat12\.(7a|7b|8a|8b|8c|8d)\.(net|vat)$/)
    }
  })

  it("both workpapers are registered on the pack, reconciliation first", () => {
    expect(lsWorkpapers.map((w) => w.id)).toEqual(["LS_VAT12", "LS_VAT12_RETURN"])
  })
})

describe("lsVat12Return — every (isImport × isService × isDeferred) permutation at 15%", () => {
  // The six meaningful buckets — locals ignore isDeferred (router doesn't consult it there),
  // imports need both flags. Amounts are distinct primes so cross-column bleed shows up loudly.
  const cases: Array<{
    label: string
    field: string
    bill: Partial<WorkpaperBill>
  }> = [
    {
      label: "local goods → 7a",
      field: "vat12.7a",
      bill: { isImport: false, isService: false, net: 100, vat: 15 },
    },
    {
      label: "local services → 7b",
      field: "vat12.7b",
      bill: { isImport: false, isService: true, net: 200, vat: 30 },
    },
    {
      label: "import goods deferred → 8a",
      field: "vat12.8a",
      bill: { isImport: true, isService: false, isDeferred: true, net: 300, vat: 45 },
    },
    {
      label: "import services deferred → 8b",
      field: "vat12.8b",
      bill: { isImport: true, isService: true, isDeferred: true, net: 500, vat: 75 },
    },
    {
      label: "import goods other → 8c",
      field: "vat12.8c",
      bill: { isImport: true, isService: false, isDeferred: false, net: 700, vat: 105 },
    },
    {
      label: "import services other → 8d",
      field: "vat12.8d",
      bill: { isImport: true, isService: true, isDeferred: false, net: 1100, vat: 165 },
    },
  ]

  for (const c of cases) {
    it(c.label, () => {
      const b = bill("b", c.bill)
      const result = computeWorkpaper(lsVat12Return, [b], period)
      // Router agrees on the target field.
      expect(
        lsVat12FieldFor({
          isImport: b.isImport,
          isService: b.isService as boolean,
          isDeferred: b.isDeferred ?? undefined,
        }),
      ).toBe(c.field)
      // Only the matching column's net + vat get the money; every other column stays at 0.
      for (const column of lsVat12Return.columns) {
        const expected =
          column.id === colId(c.field, "net")
            ? b.net
            : column.id === colId(c.field, "vat")
              ? b.vat
              : 0
        expect(result.totals[column.id]).toBe(expected)
      }
    })
  }

  it("all six buckets together fill exactly their own columns", () => {
    const bills = cases.map((c, i) => bill(`b${i}`, c.bill))
    const result = computeWorkpaper(lsVat12Return, bills, period)
    for (const c of cases) {
      expect(result.totals[colId(c.field, "net")]).toBe(c.bill.net)
      expect(result.totals[colId(c.field, "vat")]).toBe(c.bill.vat)
    }
    // Box map exposes each 1:1 column contribution too.
    for (const c of cases) {
      expect(result.boxes[`${c.field}.net`]).toBe(c.bill.net)
      expect(result.boxes[`${c.field}.vat`]).toBe(c.bill.vat)
    }
  })
})

describe("lsVat12Return — null projection silent-passes", () => {
  it("skips a bill with isService = null (local)", () => {
    const b = bill("null-svc", { isImport: false, isService: null })
    const result = computeWorkpaper(lsVat12Return, [b], period)
    for (const column of lsVat12Return.columns) {
      expect(result.totals[column.id]).toBe(0)
    }
  })

  it("skips a bill with isService = null (import)", () => {
    const b = bill("null-svc-i", { isImport: true, isService: null, isDeferred: true })
    const result = computeWorkpaper(lsVat12Return, [b], period)
    for (const column of lsVat12Return.columns) {
      expect(result.totals[column.id]).toBe(0)
    }
  })

  it("skips an import bill with isDeferred = null (workspace hasn't stated the scheme)", () => {
    const b = bill("null-def", { isImport: true, isService: false, isDeferred: null })
    const result = computeWorkpaper(lsVat12Return, [b], period)
    for (const column of lsVat12Return.columns) {
      expect(result.totals[column.id]).toBe(0)
    }
  })

  it("still routes a local bill whose isDeferred is null (locals ignore it)", () => {
    const b = bill("loc", {
      isImport: false,
      isService: false,
      isDeferred: null,
      net: 400,
      vat: 60,
    })
    const result = computeWorkpaper(lsVat12Return, [b], period)
    expect(result.totals[colId("vat12.7a", "net")]).toBe(400)
    expect(result.totals[colId("vat12.7a", "vat")]).toBe(60)
  })
})

describe("lsVat12Return — zero-rated bills contribute net, vat = 0", () => {
  it("a zero-rated local-goods bill lands on 7a net with 0 vat", () => {
    const b = bill("zr", {
      isImport: false,
      isService: false,
      taxRate: 0,
      net: 800,
      vat: 0,
      gross: 800,
    })
    const result = computeWorkpaper(lsVat12Return, [b], period)
    expect(result.totals[colId("vat12.7a", "net")]).toBe(800)
    expect(result.totals[colId("vat12.7a", "vat")]).toBe(0)
  })

  it("a zero-rated import-services-other bill lands on 8d net with 0 vat", () => {
    const b = bill("zri", {
      isImport: true,
      isService: true,
      isDeferred: false,
      taxRate: 0,
      net: 900,
      vat: 0,
      gross: 900,
    })
    const result = computeWorkpaper(lsVat12Return, [b], period)
    expect(result.totals[colId("vat12.8d", "net")]).toBe(900)
    expect(result.totals[colId("vat12.8d", "vat")]).toBe(0)
  })
})

describe("close-checklist grouping", () => {
  it("bundles both LS workpapers under one item, reconciliation first", () => {
    expect(lsWorkpaperGroups).toHaveLength(1)
    const [group] = lsWorkpaperGroups
    expect(group.id).toBe("ls_vat12_workpaper")
    expect(group.label).toBe("LS VAT-12 workpaper")
    expect(group.workpaperIds).toEqual(["LS_VAT12", "LS_VAT12_RETURN"])
  })

  it("every id in the group actually resolves on the pack", () => {
    const packIds = new Set(lsWorkpapers.map((w) => w.id))
    for (const group of lsWorkpaperGroups) {
      for (const id of group.workpaperIds) {
        expect(packIds.has(id)).toBe(true)
      }
    }
  })
})
