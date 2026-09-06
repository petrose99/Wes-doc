import { describe, expect, it } from "vitest"
import { detectRecurrence, RECURRENCE_MIN_HISTORY } from "@/lib/readiness/recurrence"

function monthly(n: number, amount: number, startISO = "2026-04-01"): { date: Date; amount: number }[] {
  const start = new Date(startISO)
  return Array.from({ length: n }, (_, i) => ({ date: new Date(start.getTime() + i * 30 * 86400_000), amount }))
}

describe("detectRecurrence", () => {
  it("requires enough history", () => {
    expect(detectRecurrence({ amount: 100, date: new Date("2026-09-01"), history: monthly(RECURRENCE_MIN_HISTORY - 1, 100) }).isRecurring).toBe(false)
  })

  it("matches a stable monthly SaaS bill", () => {
    const history = monthly(6, 100)
    const next = { amount: 100, date: new Date(history[history.length - 1].date.getTime() + 30 * 86400_000) }
    const verdict = detectRecurrence({ ...next, history })
    expect(verdict.isRecurring).toBe(true)
    expect(verdict.cadence).toBe("monthly")
  })

  it("tolerates a 2% amount drift (prorations)", () => {
    const history = monthly(6, 100)
    const next = { amount: 101.5, date: new Date(history[history.length - 1].date.getTime() + 30 * 86400_000) }
    expect(detectRecurrence({ ...next, history }).isRecurring).toBe(true)
  })

  it("rejects a bigger amount jump", () => {
    const history = monthly(6, 100)
    const next = { amount: 250, date: new Date(history[history.length - 1].date.getTime() + 30 * 86400_000) }
    expect(detectRecurrence({ ...next, history }).isRecurring).toBe(false)
  })

  it("rejects a mixed-cadence history", () => {
    const start = new Date("2026-01-01")
    const history = [
      { date: start, amount: 100 },
      { date: new Date(start.getTime() + 7 * 86400_000), amount: 100 },
      { date: new Date(start.getTime() + 34 * 86400_000), amount: 100 },
    ]
    const next = { amount: 100, date: new Date(start.getTime() + 64 * 86400_000) }
    expect(detectRecurrence({ ...next, history }).isRecurring).toBe(false)
  })
})
