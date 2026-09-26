import { describe, expect, it } from "vitest"
import { normalizeCreditNoteSign } from "./sign"

describe("normalizeCreditNoteSign (#463 Q2)", () => {
  it("takes the absolute value of top-level amount fields", () => {
    const out = normalizeCreditNoteSign({
      total: -150, subtotal: -125, tax_total: -25, shipping_total: -10,
    })
    expect(out.total).toBe(150)
    expect(out.subtotal).toBe(125)
    expect(out.tax_total).toBe(25)
    expect(out.shipping_total).toBe(10)
  })

  it("takes the absolute value of each line item's amount and unit_price", () => {
    const out = normalizeCreditNoteSign({
      line_items: [
        { description: "Widget", amount: -50, unit_price: -25 },
        { description: "Gadget", amount: 30, unit_price: 15 },
      ],
    })
    expect(out.line_items).toEqual([
      { description: "Widget", amount: 50, unit_price: 25 },
      { description: "Gadget", amount: 30, unit_price: 15 },
    ])
  })

  it("leaves already-positive fields unchanged", () => {
    const out = normalizeCreditNoteSign({ total: 150, subtotal: 125 })
    expect(out.total).toBe(150)
    expect(out.subtotal).toBe(125)
  })

  it("leaves missing or non-numeric fields untouched", () => {
    const out = normalizeCreditNoteSign({ total: "not a number", vendor: "Acme" })
    expect(out.total).toBe("not a number")
    expect(out.vendor).toBe("Acme")
  })

  it("does not mutate the input object", () => {
    const input = { total: -150, line_items: [{ amount: -10 }] }
    normalizeCreditNoteSign(input)
    expect(input.total).toBe(-150)
    expect(input.line_items[0].amount).toBe(-10)
  })

  it("handles missing line_items gracefully", () => {
    const out = normalizeCreditNoteSign({ total: -150 })
    expect(out.line_items).toBeUndefined()
  })
})
