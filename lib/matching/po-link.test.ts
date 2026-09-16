import { describe, expect, it } from "vitest"
import { isComparedLink, poLinkKind, rankPoLinks } from "@/lib/matching/po-link"

describe("poLinkKind (#228 Q11)", () => {
  it("is auto when the matcher's guess cites the same PO number the invoice does", () => {
    expect(poLinkKind({ status: "pending", invoicePoNumber: "PO-2088", poNumber: "po 2088" })).toBe("auto")
  })
  it("is suggested when the invoice cites no PO number", () => {
    expect(poLinkKind({ status: "pending", invoicePoNumber: null, poNumber: "PO-2088" })).toBe("suggested")
  })
  it("is suggested when the invoice cites a different PO number", () => {
    expect(poLinkKind({ status: "pending", invoicePoNumber: "PO-1", poNumber: "PO-2088" })).toBe("suggested")
  })
  it("is confirmed whatever the numbers say once a person confirmed it", () => {
    expect(poLinkKind({ status: "confirmed", invoicePoNumber: null, poNumber: null })).toBe("confirmed")
  })
  it("is rejected and never compared once rejected", () => {
    expect(poLinkKind({ status: "rejected", invoicePoNumber: "PO-2088", poNumber: "PO-2088" })).toBe("rejected")
    expect(isComparedLink("rejected")).toBe(false)
    expect(isComparedLink("suggested")).toBe(false)
    expect(isComparedLink("auto")).toBe(true)
    expect(isComparedLink("confirmed")).toBe(true)
  })
  it("ranks confirmed over auto over the most confident suggestion", () => {
    const ranked = rankPoLinks([
      { kind: "suggested" as const, confidence: 0.99 },
      { kind: "auto" as const, confidence: 0.5 },
      { kind: "suggested" as const, confidence: 0.7 },
      { kind: "confirmed" as const, confidence: 0.1 },
    ])
    expect(ranked.map((link) => `${link.kind}:${link.confidence}`)).toEqual(["confirmed:0.1", "auto:0.5", "suggested:0.99", "suggested:0.7"])
  })
})
