import { describe, expect, it } from "vitest"
import { checkPoLineConsumption, type PoLineConsumptionDetail } from "@/lib/checks/po-line-consumption"

const base = { poDocumentId: "po-1", poNumber: "PO-1042", currentDocumentId: "inv-1", quantityTolerancePercent: 5, priceTolerancePercent: 2 }
const poLineItems = [{ description: "Widget A", quantity: 100, unitPrice: 10 }]
const detailOf = (result: ReturnType<typeof checkPoLineConsumption>) => result?.detail as unknown as PoLineConsumptionDetail

describe("checkPoLineConsumption", () => {
  it("passes — with the full line breakdown — when cumulative invoiced quantity is within tolerance", () => {
    const result = checkPoLineConsumption({
      ...base, poLineItems,
      invoiceLineItems: [{ documentId: "inv-1", rowIndex: 0, description: "Widget A", quantity: 104, unitPrice: 10 }],
    })
    expect(result?.status).toBe("pass")
    expect(result?.fields).toEqual([])
    const detail = detailOf(result)
    expect(detail.lines[0].status).toBe("match")
    expect(detail.lines[0].quantity.status).toBe("match")
    expect(detail.lines[0].unitPrice.status).toBe("match")
    expect(detail.poNumber).toBe("PO-1042")
  })

  it("fails when this invoice's own lines push cumulative quantity past tolerance, sentence first", () => {
    const result = checkPoLineConsumption({
      ...base, poLineItems,
      invoiceLineItems: [{ documentId: "inv-1", rowIndex: 0, description: "Widget A", quantity: 120, unitPrice: 10 }],
    })
    expect(result?.status).toBe("fail")
    expect(result?.fields).toEqual(["line_items[0].quantity"])
    expect(result?.message).toContain("Invoiced quantity is 20 % over what was ordered; the workspace allows 5 %.")
    const line = detailOf(result).lines[0]
    expect(line.quantity).toMatchObject({ po: 100, thisInvoice: 120, allowance: 105, overBy: 15, overPercent: 20, alreadyInvoiced: [] })
  })

  it("names the sibling invoices that already consumed the line", () => {
    const result = checkPoLineConsumption({
      ...base, poLineItems,
      invoiceLineItems: [
        { documentId: "inv-1", rowIndex: 0, description: "Widget A", quantity: 30, unitPrice: 10 },
        { documentId: "inv-2", rowIndex: 0, description: "Widget A", quantity: 80, unitPrice: 10 },
      ],
      siblingLabels: { "inv-2": "INV-2041" },
    })
    expect(result?.status).toBe("fail")
    expect(result?.message).toContain("once INV-2041 is counted")
    expect(detailOf(result).lines[0].quantity.alreadyInvoiced).toEqual([{ documentId: "inv-2", label: "INV-2041", quantity: 80 }])
  })

  it("does not blame a document that contributed nothing to the exceeded group", () => {
    const result = checkPoLineConsumption({
      ...base, poLineItems,
      invoiceLineItems: [
        { documentId: "inv-1", rowIndex: 0, description: "Unrelated item", quantity: 1, unitPrice: 1 },
        { documentId: "inv-2", rowIndex: 0, description: "Widget A", quantity: 120, unitPrice: 10 },
      ],
    })
    expect(result?.status).toBe("pass")
    expect(detailOf(result).lines[0].status).toBe("not_matched")
  })

  it("flags a unit price outside the match-variance percent", () => {
    const result = checkPoLineConsumption({
      ...base, poLineItems,
      invoiceLineItems: [{ documentId: "inv-1", rowIndex: 0, description: "Widget A", quantity: 100, unitPrice: 11 }],
    })
    expect(result?.status).toBe("fail")
    expect(result?.fields).toEqual(["line_items[0].unit_price"])
    expect(detailOf(result).lines[0].unitPrice).toMatchObject({ status: "mismatch", variancePercent: 10 })
  })

  it("does not judge a PO line with no quantity", () => {
    const result = checkPoLineConsumption({
      ...base, poLineItems: [{ description: "Widget A", quantity: null, unitPrice: null }],
      invoiceLineItems: [{ documentId: "inv-1", rowIndex: 0, description: "Widget A", quantity: 500, unitPrice: 3 }],
    })
    expect(result?.status).toBe("pass")
    expect(detailOf(result).lines[0].status).toBe("not_compared")
  })

  it("honours a manual line assignment over the similarity guess", () => {
    const result = checkPoLineConsumption({
      ...base,
      poLineItems: [{ description: "Widget A", quantity: 100, unitPrice: 10 }, { description: "Gadget Z", quantity: 10, unitPrice: 50 }],
      invoiceLineItems: [{ documentId: "inv-1", rowIndex: 0, description: "Widget A", quantity: 12, unitPrice: 50 }],
      lineAssignments: { "0": 1 },
    })
    expect(result?.status).toBe("fail")
    const line = detailOf(result).lines[0]
    expect(line.poLineIndex).toBe(1)
    expect(line.assigned).toBe(true)
    expect(line.quantity.status).toBe("mismatch")
    expect(line.unitPrice.status).toBe("match")
  })

  it("never judges a line assigned to No PO line by hand", () => {
    const result = checkPoLineConsumption({
      ...base, poLineItems,
      invoiceLineItems: [{ documentId: "inv-1", rowIndex: 0, description: "Widget A", quantity: 900, unitPrice: 99 }],
      lineAssignments: { "0": null },
    })
    expect(result?.status).toBe("pass")
    expect(detailOf(result).lines[0].status).toBe("not_matched")
  })

  it("returns nothing for a PO without line items", () => {
    expect(checkPoLineConsumption({ ...base, poLineItems: [], invoiceLineItems: [] })).toBeNull()
  })
})
