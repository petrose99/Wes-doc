import { describe, expect, it } from "vitest"
import { mergeContinuationRows, type MergeRowsInput } from "./merge-rows"

const itemFields = [
  { key: "description", type: "string" },
  { key: "quantity", type: "number" },
  { key: "unit_price", type: "number" },
  { key: "amount", type: "number" },
]

function makeInput(overrides: Partial<MergeRowsInput>): MergeRowsInput {
  return { itemFields, rows: [], hints: [], passBoundaries: new Set(), ...overrides }
}

describe("mergeContinuationRows", () => {
  it("merges a string-only fragment at a pass boundary onto the preceding numeric row", () => {
    const rows = [
      { description: "Widget Alpha", quantity: 10, unit_price: 5, amount: 50 },
      { description: "continued description" },
    ]
    const hints = [{ page: 1 }, { page: 2 }]
    const result = mergeContinuationRows(makeInput({ rows, hints, passBoundaries: new Set([1]) }))
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].description).toBe("Widget Alpha continued description")
    expect(result.merges).toBe(1)
    expect(result.dropped).toBe(0)
  })

  it("merges when page hint evidence exists (consecutive pages, no boundary)", () => {
    const rows = [
      { description: "Base item", quantity: 2, amount: 100 },
      { description: "extra detail" },
    ]
    const hints = [{ page: 3 }, { page: 4 }]
    const result = mergeContinuationRows(makeInput({ rows, hints }))
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].description).toBe("Base item extra detail")
    expect(result.merges).toBe(1)
  })

  it("refuses merge without boundary evidence", () => {
    const rows = [
      { description: "Row A", amount: 100 },
      { description: "Row B" },
    ]
    const hints = [{ page: 1 }, { page: 1 }]
    const result = mergeContinuationRows(makeInput({ rows, hints }))
    expect(result.rows).toHaveLength(2)
    expect(result.merges).toBe(0)
  })

  it("refuses merge when fragment has a numeric value", () => {
    const rows = [
      { description: "Item", amount: 100 },
      { description: "Another", amount: 50 },
    ]
    const hints = [{ page: 1 }, { page: 2 }]
    const result = mergeContinuationRows(makeInput({ rows, hints, passBoundaries: new Set([1]) }))
    expect(result.rows).toHaveLength(2)
    expect(result.merges).toBe(0)
  })

  it("refuses merge when previous row has no numeric values", () => {
    const rows = [
      { description: "Header only" },
      { description: "Fragment" },
    ]
    const hints = [{ page: 1 }, { page: 2 }]
    const result = mergeContinuationRows(makeInput({ rows, hints, passBoundaries: new Set([1]) }))
    expect(result.rows).toHaveLength(2)
    expect(result.merges).toBe(0)
  })

  it("chains multiple fragments onto one base row via consecutive page hints", () => {
    const rows = [
      { description: "Base", quantity: 1, amount: 10 },
      { description: "line two" },
      { description: "line three" },
    ]
    // Each fragment is on the next consecutive page from its predecessor
    const hints = [{ page: 1 }, { page: 2 }, { page: 3 }]
    const result = mergeContinuationRows(makeInput({ rows, hints }))
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].description).toBe("Base line two line three")
    expect(result.merges).toBe(2)
  })

  it("drops continuation marker rows", () => {
    const rows = [
      { description: "Item", amount: 200 },
      { description: "Subtotal" },
    ]
    const hints = [{ page: 1 }, { page: 2 }]
    const result = mergeContinuationRows(makeInput({ rows, hints, passBoundaries: new Set([1]) }))
    expect(result.rows).toHaveLength(1)
    expect(result.dropped).toBe(1)
    expect(result.merges).toBe(0)
  })

  it("drops 'Balance carried forward' marker", () => {
    const rows = [
      { description: "Item", amount: 100 },
      { description: "Balance carried forward" },
    ]
    const hints = [{ page: 1 }, { page: 2 }]
    const result = mergeContinuationRows(makeInput({ rows, hints, passBoundaries: new Set([1]) }))
    expect(result.rows).toHaveLength(1)
    expect(result.dropped).toBe(1)
  })

  it("drops 'Continued on next page' marker", () => {
    const rows = [
      { description: "Item", amount: 100 },
      { description: "Continued on next page" },
    ]
    const hints = [{ page: 1 }, { page: 2 }]
    const result = mergeContinuationRows(makeInput({ rows, hints, passBoundaries: new Set([1]) }))
    expect(result.rows).toHaveLength(1)
    expect(result.dropped).toBe(1)
  })

  it("drops repeated header rows", () => {
    const rows = [
      { description: "Widget", quantity: 5, amount: 25 },
      { description: "Description" },
    ]
    const hints = [{ page: 1 }, { page: 2 }]
    const result = mergeContinuationRows(makeInput({ rows, hints, passBoundaries: new Set([1]) }))
    expect(result.rows).toHaveLength(1)
    expect(result.dropped).toBe(1)
  })

  it("keeps hint arrays index-aligned after merge", () => {
    const rows = [
      { description: "A", amount: 10 },
      { description: "frag" },
      { description: "B", amount: 20 },
    ]
    const hints = [{ page: 1 }, { page: 2 }, { page: 2 }]
    const result = mergeContinuationRows(makeInput({ rows, hints, passBoundaries: new Set([1]) }))
    expect(result.rows).toHaveLength(2)
    expect(result.hints).toHaveLength(2)
    expect(result.hints[0]).toEqual({ page: 2 })
    expect(result.hints[1]).toEqual({ page: 2 })
  })

  it("returns unchanged arrays on empty input", () => {
    const result = mergeContinuationRows(makeInput({ rows: [], hints: [] }))
    expect(result.rows).toHaveLength(0)
    expect(result.merges).toBe(0)
    expect(result.dropped).toBe(0)
  })

  it("returns unchanged on single-row input", () => {
    const result = mergeContinuationRows(makeInput({ rows: [{ description: "A", amount: 10 }], hints: [{ page: 1 }] }))
    expect(result.rows).toHaveLength(1)
    expect(result.merges).toBe(0)
  })
})
