import { describe, expect, it } from "vitest"
import { checkSplitInvoices } from "@/lib/checks/split-invoices"

const day = (offset: number) => new Date(new Date("2026-09-06").getTime() - offset * 86400_000)

describe("checkSplitInvoices", () => {
  it("silent with no siblings", () => {
    expect(checkSplitInvoices({ candidateAmount: 400, candidateDate: day(0), siblings: [], approvalThreshold: 1000 })).toBeNull()
  })

  it("silent when the approval threshold is meaningless", () => {
    expect(checkSplitInvoices({ candidateAmount: 400, candidateDate: day(0), siblings: [{ documentId: "s1", amount: 400, date: day(1) }], approvalThreshold: 0 })).toBeNull()
  })

  it("silent when any invoice is over the threshold on its own", () => {
    const result = checkSplitInvoices({ candidateAmount: 400, candidateDate: day(0),
      siblings: [{ documentId: "s1", amount: 1500, date: day(1) }], approvalThreshold: 1000 })
    expect(result).toBeNull()
  })

  it("silent when totals don't crowd the threshold", () => {
    const result = checkSplitInvoices({ candidateAmount: 100, candidateDate: day(0),
      siblings: [{ documentId: "s1", amount: 100, date: day(1) }], approvalThreshold: 1000 })
    expect(result).toBeNull()
  })

  it("warns when several sub-threshold invoices in the window crowd the threshold", () => {
    const result = checkSplitInvoices({ candidateAmount: 400, candidateDate: day(0),
      siblings: [
        { documentId: "s1", amount: 400, date: day(1) },
        { documentId: "s2", amount: 300, date: day(4) },
      ], approvalThreshold: 1000 })
    expect(result?.status).toBe("warn")
    expect(result?.detail?.siblingIds).toEqual(["s1", "s2"])
  })

  it("ignores siblings outside the window", () => {
    const result = checkSplitInvoices({ candidateAmount: 400, candidateDate: day(0),
      siblings: [
        { documentId: "s1", amount: 400, date: day(20) },
        { documentId: "s2", amount: 300, date: day(21) },
      ], approvalThreshold: 1000 })
    expect(result).toBeNull()
  })
})
