import { describe, expect, it } from "vitest"
import { confidenceState, minConfidenceFromPercent } from "./confidence-state"

describe("confidenceState", () => {
  it("reads confident at or above the workspace floor", () => {
    expect(confidenceState(0.85, 0.85)).toBe("confident")
    expect(confidenceState(0.99, 0.85)).toBe("confident")
  })

  it("reads below under the floor — one boundary, no third band", () => {
    expect(confidenceState(0.8499, 0.85)).toBe("below")
    expect(confidenceState(0.1, 0.85)).toBe("below")
  })

  it("follows the workspace floor rather than a fixed number", () => {
    expect(confidenceState(0.88, 0.85)).toBe("confident")
    expect(confidenceState(0.88, 0.92)).toBe("below")
  })

  it("returns null for a field with no AI claim", () => {
    expect(confidenceState(undefined, 0.85)).toBeNull()
    expect(confidenceState(null, 0.85)).toBeNull()
    expect(confidenceState(Number.NaN, 0.85)).toBeNull()
  })
})

describe("minConfidenceFromPercent", () => {
  it("round-trips the percent the tables receive", () => {
    expect(minConfidenceFromPercent(85)).toBe(0.85)
    expect(minConfidenceFromPercent(100)).toBe(1)
  })
})
