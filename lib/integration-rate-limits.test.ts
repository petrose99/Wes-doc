import { describe, expect, it } from "vitest"
import { PROVIDER_BUCKETS, reportCall, tryClaim } from "@/lib/integration-rate-limits"

describe("tryClaim", () => {
  it("allows the first call and refuses past the per-minute cap", () => {
    let window = { callTimestamps: [] as number[] }
    const now = 10_000_000
    for (let i = 0; i < PROVIDER_BUCKETS.xero.perMinute; i++) {
      expect(tryClaim(PROVIDER_BUCKETS.xero, window, now + i).allowed).toBe(true)
      window = reportCall(window, now + i)
    }
    const verdict = tryClaim(PROVIDER_BUCKETS.xero, window, now + 100)
    expect(verdict.allowed).toBe(false)
    if (!verdict.allowed) {
      expect(verdict.reason).toBe("per_minute")
      expect(verdict.retryAfterMs).toBeGreaterThan(0)
    }
  })

  it("prunes calls outside the day window", () => {
    const now = 10_000_000
    const dayAgo = now - 25 * 60 * 60_000
    const window = { callTimestamps: Array.from({ length: 200 }, () => dayAgo) }
    expect(tryClaim(PROVIDER_BUCKETS.xero, window, now).allowed).toBe(true)
  })

  it("enforces per-day cap for xero", () => {
    const now = 10_000_000
    const window = { callTimestamps: Array.from({ length: 5000 }, (_, i) => now - i * 10_000) }
    const verdict = tryClaim(PROVIDER_BUCKETS.xero, window, now + 30 * 60_000)
    expect(verdict.allowed).toBe(false)
    if (!verdict.allowed) expect(verdict.reason).toBe("per_day")
  })
})
