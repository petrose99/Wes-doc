import { describe, expect, it } from "vitest"
import { benfordChiSquared, BENFORD_MIN_SAMPLES, BENFORD_CHI_SQUARED_ALPHA_05 } from "@/lib/health/checks/benford"

/** Builds a Benford-conformant leading-digit distribution over n samples. */
function benfordSamples(n: number): number[] {
  const expected = [0, 0.301, 0.176, 0.125, 0.097, 0.079, 0.067, 0.058, 0.051, 0.046]
  const out: number[] = []
  for (let digit = 1; digit <= 9; digit++) {
    const count = Math.round(expected[digit] * n)
    // Values stay in the [digit, digit+1) decade so the leading digit is stable — a small
    // deterministic spread within the decade avoids picking a single-value distribution that
    // could distort other statistics.
    for (let i = 0; i < count; i++) out.push(digit + (i % 100) * 0.005)
  }
  return out
}

describe("benfordChiSquared", () => {
  it("returns near-zero χ² for a Benford-conformant sample", () => {
    const { chiSquared, sample } = benfordChiSquared(benfordSamples(500))
    expect(sample).toBeGreaterThanOrEqual(BENFORD_MIN_SAMPLES)
    expect(chiSquared).toBeLessThan(BENFORD_CHI_SQUARED_ALPHA_05)
  })

  it("returns a large χ² for a uniform distribution", () => {
    const uniform: number[] = []
    for (let digit = 1; digit <= 9; digit++) {
      for (let i = 0; i < 100; i++) uniform.push(digit * 100 + i)
    }
    const { chiSquared } = benfordChiSquared(uniform)
    expect(chiSquared).toBeGreaterThan(BENFORD_CHI_SQUARED_ALPHA_05)
  })

  it("handles zeros and negative values in the leading-digit extractor", () => {
    const { observed } = benfordChiSquared([0, -0, -125, 3.14, 0.0072])
    expect(observed[1]).toBe(1)  // -125 -> 1
    expect(observed[3]).toBe(1)  // 3.14 -> 3
    expect(observed[7]).toBe(1)  // 0.0072 -> 7
  })
})
