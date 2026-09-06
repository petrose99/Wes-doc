import { describe, expect, it } from "vitest"
import { findSubsetSum } from "@/lib/bank-match/subset-sum"

describe("findSubsetSum", () => {
  it("finds an exact 2-item subset", () => {
    const result = findSubsetSum([
      { documentId: "a", amount: 100 },
      { documentId: "b", amount: 78.5 },
      { documentId: "c", amount: 42 },
    ], 178.5, 0.01)
    expect(result?.documentIds.sort()).toEqual(["a", "b"])
  })

  it("tolerates a small fee slippage", () => {
    const result = findSubsetSum([
      { documentId: "a", amount: 100 },
      { documentId: "b", amount: 78.5 },
      { documentId: "c", amount: 105.03 },
    ], 283.47, 0.1)
    expect(result?.documentIds.sort()).toEqual(["a", "b", "c"])
  })

  it("returns null when no subset fits", () => {
    expect(findSubsetSum([
      { documentId: "a", amount: 100 },
      { documentId: "b", amount: 78.5 },
    ], 500, 0.01)).toBeNull()
  })

  it("returns null with only one candidate (2-item minimum)", () => {
    expect(findSubsetSum([{ documentId: "a", amount: 100 }], 100, 0.01)).toBeNull()
  })
})
