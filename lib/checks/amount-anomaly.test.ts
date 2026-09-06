import { describe, expect, it } from "vitest"
import { AMOUNT_ANOMALY_MIN_HISTORY, checkAmountAnomaly } from "@/lib/checks/amount-anomaly"

const stableHistory = Array.from({ length: 20 }, (_, i) => 500 + (i % 5) * 10) // mean ~520, small σ

describe("checkAmountAnomaly", () => {
  it("does nothing without enough history", () => {
    expect(checkAmountAnomaly({ amount: 1000, history: [500, 510, 490], supplierName: "Acme" })).toBeNull()
    expect(AMOUNT_ANOMALY_MIN_HISTORY).toBe(10)
  })

  it("does nothing on a normal amount inside 2.5σ", () => {
    expect(checkAmountAnomaly({ amount: 520, history: stableHistory, supplierName: "Acme" })).toBeNull()
  })

  it("warns on a high-z outlier (non-round value uses the σ message)", () => {
    const result = checkAmountAnomaly({ amount: 5127.53, history: stableHistory, supplierName: "Acme" })
    expect(result?.status).toBe("warn")
    expect(result?.message).toMatch(/σ from Acme/)
    expect(result?.detail?.roundSpike).toBe(false)
  })

  it("labels a round-number outlier explicitly", () => {
    const result = checkAmountAnomaly({ amount: 10_000, history: stableHistory, supplierName: "Acme" })
    expect(result?.detail?.roundSpike).toBe(true)
    expect(result?.message).toContain("Round-number")
  })

  it("is silent when amount is null or non-finite", () => {
    expect(checkAmountAnomaly({ amount: null, history: stableHistory, supplierName: "Acme" })).toBeNull()
    expect(checkAmountAnomaly({ amount: NaN, history: stableHistory, supplierName: "Acme" })).toBeNull()
  })
})
