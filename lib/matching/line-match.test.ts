import { describe, expect, it } from "vitest"
import { computeLineMatches, countMismatchGlyphs, parseLineAssignments, quantitySentence } from "@/lib/matching/line-match"

const base = { currentDocumentId: "inv-1", quantityTolerancePercent: 5, priceTolerancePercent: 2 }

describe("computeLineMatches (#228 Q1)", () => {
  it("compares quantity by the cumulative rule, unit price within the percent, description as the line match", () => {
    const [line] = computeLineMatches({
      ...base,
      poLineItems: [{ description: "Widget A", quantity: 100, unitPrice: 12.5 }],
      invoiceLineItems: [{ documentId: "inv-1", rowIndex: 0, description: "Widget A", quantity: 104, unitPrice: 12.6 }],
    })
    expect(line.status).toBe("match")
    expect(line.description.similarity).toBe(1)
    expect(line.quantity).toMatchObject({ status: "match", po: 100, thisInvoice: 104, allowance: 105, overBy: 0, overPercent: 4 })
    expect(line.unitPrice).toMatchObject({ status: "match", po: 12.5, invoice: 12.6, variancePercent: 0.8 })
  })

  it("leaves a line below the similarity threshold Not matched and never judges it", () => {
    const [line] = computeLineMatches({
      ...base,
      poLineItems: [{ description: "Widget A", quantity: 1, unitPrice: 1 }],
      invoiceLineItems: [{ documentId: "inv-1", rowIndex: 0, description: "Site survey", quantity: 900, unitPrice: 900 }],
    })
    expect(line.status).toBe("not_matched")
    expect(line.poLineIndex).toBeNull()
    expect(line.quantity.status).toBe("not_compared")
    expect(line.unitPrice.status).toBe("not_compared")
  })

  it("reads Not compared when the PO line has no quantity or price", () => {
    const [line] = computeLineMatches({
      ...base,
      poLineItems: [{ description: "Widget A", quantity: null, unitPrice: null }],
      invoiceLineItems: [{ documentId: "inv-1", rowIndex: 0, description: "Widget A", quantity: 3, unitPrice: 3 }],
    })
    expect(line.status).toBe("not_compared")
    expect(quantitySentence(line)).toContain("no quantity")
  })

  it("names sibling invoices in the breakdown and only counts each once", () => {
    const [line] = computeLineMatches({
      ...base,
      poLineItems: [{ description: "Widget A", quantity: 100, unitPrice: 1 }],
      invoiceLineItems: [
        { documentId: "inv-1", rowIndex: 0, description: "Widget A", quantity: 10, unitPrice: 1 },
        { documentId: "inv-2", rowIndex: 0, description: "Widget A", quantity: 50, unitPrice: 1 },
        { documentId: "inv-2", rowIndex: 3, description: "Widget A (again)", quantity: 50, unitPrice: 1 },
      ],
      siblingLabels: { "inv-2": "NW-5490" },
    })
    expect(line.quantity.alreadyInvoiced).toEqual([{ documentId: "inv-2", label: "NW-5490", quantity: 100 }])
    expect(line.quantity.status).toBe("mismatch")
    expect(quantitySentence(line)).toBe("Invoiced quantity is 10 % over what was ordered once NW-5490 is counted; the workspace allows 5 %.")
  })

  it("counts the red glyphs the pane will show, plus one for an open Total gate", () => {
    const lines = computeLineMatches({
      ...base,
      poLineItems: [{ description: "Widget A", quantity: 100, unitPrice: 12.5 }, { description: "Bracket kit", quantity: 40, unitPrice: 8 }],
      invoiceLineItems: [
        { documentId: "inv-1", rowIndex: 0, description: "Widget A", quantity: 112, unitPrice: 12.5 },
        { documentId: "inv-1", rowIndex: 1, description: "Bracket kit", quantity: 20, unitPrice: 9.2 },
      ],
    })
    expect(countMismatchGlyphs(lines, false)).toBe(2)
    expect(countMismatchGlyphs(lines, true)).toBe(3)
  })

  it("item-match-first: a shared Item wins over description similarity, bypassing the threshold", () => {
    const [line] = computeLineMatches({
      ...base,
      poLineItems: [
        { description: "Widget A", quantity: 100, unitPrice: 12.5, itemExternalId: "item-1" },
        { description: "Totally unrelated text", quantity: 40, unitPrice: 8, itemExternalId: "item-2" },
      ],
      invoiceLineItems: [{ documentId: "inv-1", rowIndex: 0, description: "Widget A (slightly different wording)", quantity: 100, unitPrice: 12.5, itemExternalId: "item-2" }],
    })
    expect(line.poLineIndex).toBe(1)
    expect(line.description.similarity).toBe(1)
  })

  it("item-match-ambiguous: more than one PO line sharing the Item falls through to the description scan", () => {
    const [line] = computeLineMatches({
      ...base,
      poLineItems: [
        { description: "Zebra crossing signage", quantity: 100, unitPrice: 12.5, itemExternalId: "item-1" },
        { description: "Widget A", quantity: 40, unitPrice: 8, itemExternalId: "item-1" },
      ],
      invoiceLineItems: [{ documentId: "inv-1", rowIndex: 0, description: "Widget A", quantity: 40, unitPrice: 8, itemExternalId: "item-1" }],
    })
    // Both PO lines share the Item, so the shortcut is skipped; description similarity picks the
    // second line, not the first — proof the fallback ran rather than guessing between candidates.
    expect(line.poLineIndex).toBe(1)
  })

  it("item-mismatch-excluded: two different Items never auto-pair even at high description similarity", () => {
    const [line] = computeLineMatches({
      ...base,
      poLineItems: [{ description: "Widget A", quantity: 100, unitPrice: 12.5, itemExternalId: "item-1" }],
      invoiceLineItems: [{ documentId: "inv-1", rowIndex: 0, description: "Widget A", quantity: 100, unitPrice: 12.5, itemExternalId: "item-2" }],
    })
    expect(line.poLineIndex).toBeNull()
    expect(line.status).toBe("not_matched")
  })

  it("no-item-on-either-side: unchanged description-similarity behaviour", () => {
    const [line] = computeLineMatches({
      ...base,
      poLineItems: [{ description: "Widget A", quantity: 100, unitPrice: 12.5 }],
      invoiceLineItems: [{ documentId: "inv-1", rowIndex: 0, description: "Widget A", quantity: 104, unitPrice: 12.6 }],
    })
    expect(line.poLineIndex).toBe(0)
    expect(line.status).toBe("match")
  })

  it("parses line assignments defensively", () => {
    expect(parseLineAssignments({ "0": 2, "1": null, x: 1, "2": -1, "3": "1" })).toEqual({ "0": 2, "1": null })
    expect(parseLineAssignments([1])).toBeNull()
    expect(parseLineAssignments(null)).toBeNull()
  })
})
