import { describe, expect, it } from "vitest"
import { evaluateThreeWayMatch } from "@/lib/matching/three-way"

const base = {
  po: { vendor: "Acme Ltd", amount: 1000, poNumber: "PO-42" },
  invoice: { vendor: "Acme Ltd", amount: 1000, poNumber: "PO-42" },
  receipt: { vendor: "Acme Ltd", amount: 1000, poNumber: "PO-42" },
}

describe("evaluateThreeWayMatch", () => {
  it("matches a clean trio", () => {
    const v = evaluateThreeWayMatch(base)
    expect(v.matched).toBe(true)
    expect(v.discrepancies).toEqual([])
  })
  it("flags a mismatched po number", () => {
    const v = evaluateThreeWayMatch({ ...base, invoice: { ...base.invoice, poNumber: "PO-99" } })
    expect(v.matched).toBe(false)
    expect(v.discrepancies).toContain("po_number_mismatch")
  })
  it("tolerates a small amount drift within 2%", () => {
    const v = evaluateThreeWayMatch({ ...base, invoice: { ...base.invoice, amount: 1015 } })
    expect(v.matched).toBe(true)
  })
  it("scores a 2-way (no receipt) out of 3 signals", () => {
    const v = evaluateThreeWayMatch({ ...base, receipt: null })
    expect(v.matched).toBe(true)
    expect(v.score).toBe(1)
  })
})
