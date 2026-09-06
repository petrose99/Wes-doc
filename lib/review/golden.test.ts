import { describe, expect, it } from "vitest"
import { scoreGolden, shouldServeGolden } from "@/lib/review/golden"

const expected = { vendor: "Acme Ltd", total: 1000, notes: "annual bill" }

describe("scoreGolden", () => {
  it("correct when every planted error was caught and nothing regressed", () => {
    const result = scoreGolden({ expected, plantedErrorKeys: ["total"], submitted: { vendor: "Acme Ltd", total: 1000, notes: "annual bill" } })
    expect(result.grade).toBe("correct")
    expect(result.plantedCaught).toBe(1)
    expect(result.regressions).toEqual([])
  })

  it("partial when SOME planted errors were caught", () => {
    const result = scoreGolden({
      expected: { ...expected, vendor: "Acme Ltd" },
      plantedErrorKeys: ["vendor", "total"],
      submitted: { vendor: "Acme Ltd", total: 999, notes: "annual bill" },
    })
    expect(result.grade).toBe("partial")
    expect(result.plantedCaught).toBe(1)
  })

  it("miss when zero planted errors were corrected", () => {
    const result = scoreGolden({ expected, plantedErrorKeys: ["total"], submitted: { vendor: "Acme Ltd", total: 999, notes: "annual bill" } })
    expect(result.grade).toBe("miss")
  })

  it("regression on a non-planted field pulls grade down to partial", () => {
    const result = scoreGolden({ expected, plantedErrorKeys: ["total"], submitted: { vendor: "Wrong Vendor", total: 1000, notes: "annual bill" } })
    expect(result.grade).toBe("partial")
    expect(result.regressions).toEqual(["vendor"])
  })

  it("case-insensitive string comparison and numeric tolerance", () => {
    const result = scoreGolden({ expected: { vendor: "Acme Ltd", total: 1000 }, plantedErrorKeys: ["total"], submitted: { vendor: "ACME LTD", total: 1000.001 } })
    expect(result.grade).toBe("correct")
  })
})

describe("shouldServeGolden", () => {
  it("is deterministic per (reviewer, date, rate)", () => {
    expect(shouldServeGolden("r1", "2026-09-06", 0.5)).toBe(shouldServeGolden("r1", "2026-09-06", 0.5))
  })
  it("returns false for rate 0", () => {
    expect(shouldServeGolden("r1", "2026-09-06", 0)).toBe(false)
  })
})
