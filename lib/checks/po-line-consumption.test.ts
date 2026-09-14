import { describe, expect, it } from "vitest"
import { checkPoLineConsumption } from "@/lib/checks/po-line-consumption"

describe("checkPoLineConsumption", () => {
  const poLineItems = [{ description: "Widget A", quantity: 100 }]

  it("passes when cumulative invoiced quantity is within tolerance", () => {
    const result = checkPoLineConsumption({
      poLineItems,
      invoiceLineItems: [{ documentId: "inv-1", rowIndex: 0, description: "Widget A", quantity: 104 }],
      tolerancePercent: 5,
      currentDocumentId: "inv-1",
    })
    expect(result).toBeNull()
  })

  it("fails when this invoice's own lines push cumulative quantity past tolerance", () => {
    const result = checkPoLineConsumption({
      poLineItems,
      invoiceLineItems: [{ documentId: "inv-1", rowIndex: 0, description: "Widget A", quantity: 120 }],
      tolerancePercent: 5,
      currentDocumentId: "inv-1",
    })
    expect(result?.status).toBe("fail")
    expect(result?.fields).toEqual(["line_items[0].quantity"])
  })

  it("does not blame a document that contributed nothing to the exceeded group", () => {
    const result = checkPoLineConsumption({
      poLineItems,
      invoiceLineItems: [
        { documentId: "inv-1", rowIndex: 0, description: "Unrelated item", quantity: 1 },
        { documentId: "inv-2", rowIndex: 0, description: "Widget A", quantity: 120 },
      ],
      tolerancePercent: 5,
      currentDocumentId: "inv-1",
    })
    expect(result).toBeNull()
  })

  it("skips a PO line whose description has no matching invoice line", () => {
    const result = checkPoLineConsumption({
      poLineItems: [{ description: "Widget A", quantity: 100 }, { description: "Gadget Z", quantity: 10 }],
      invoiceLineItems: [{ documentId: "inv-1", rowIndex: 0, description: "Widget A", quantity: 100 }],
      tolerancePercent: 5,
      currentDocumentId: "inv-1",
    })
    expect(result).toBeNull()
  })

  it("does not judge a PO line with no quantity", () => {
    const result = checkPoLineConsumption({
      poLineItems: [{ description: "Widget A", quantity: null }],
      invoiceLineItems: [{ documentId: "inv-1", rowIndex: 0, description: "Widget A", quantity: 500 }],
      tolerancePercent: 5,
      currentDocumentId: "inv-1",
    })
    expect(result).toBeNull()
  })
})
