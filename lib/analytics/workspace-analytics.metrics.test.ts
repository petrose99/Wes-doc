import { describe, expect, it, vi } from "vitest"

const documentCount = vi.fn()
const auditEventCount = vi.fn()

vi.mock("@/lib/db", () => ({
  prisma: {
    document: { count: (...args: unknown[]) => documentCount(...args) },
    documentAuditEvent: { count: (...args: unknown[]) => auditEventCount(...args) },
  },
}))
vi.mock("@/models/tax-profiles", () => ({ getTaxProfile: vi.fn() }))

const { getTouchlessRateTrend, getDocumentMatchRateStats } = await import("@/lib/analytics/workspace-analytics")

const WS = "11111111-1111-1111-1111-111111111111"

describe("getTouchlessRateTrend", () => {
  it("computes an up trend against the immediately preceding window of the same length", async () => {
    documentCount.mockResolvedValueOnce(100) // current extracted
    documentCount.mockResolvedValueOnce(0) // current ready (unused by trend, but called by getTouchlessRateStats)
    auditEventCount.mockResolvedValueOnce(40) // current touchless
    documentCount.mockResolvedValueOnce(100) // prior extracted
    auditEventCount.mockResolvedValueOnce(30) // prior touchless

    const result = await getTouchlessRateTrend(WS, 30)

    expect(result.touchlessRate).toBeCloseTo(0.4)
    expect(result.trend).toEqual({ direction: "up", deltaPercentagePoints: 10 })
  })

  it("returns a null trend when the prior window has no extracted documents", async () => {
    documentCount.mockResolvedValueOnce(50) // current extracted
    documentCount.mockResolvedValueOnce(0) // current ready
    auditEventCount.mockResolvedValueOnce(20) // current touchless
    documentCount.mockResolvedValueOnce(0) // prior extracted
    auditEventCount.mockResolvedValueOnce(0) // prior touchless

    const result = await getTouchlessRateTrend(WS, 30)

    expect(result.trend).toBeNull()
  })
})

describe("getDocumentMatchRateStats", () => {
  it("divides matched by total for the doc type and window", async () => {
    documentCount.mockResolvedValueOnce(20) // total
    documentCount.mockResolvedValueOnce(15) // matched

    const result = await getDocumentMatchRateStats(WS, "purchase_order", ["po_to_invoice"])

    expect(result).toEqual({ total: 20, matched: 15, matchRate: 0.75 })
  })

  it("returns a zero rate rather than dividing by zero when there are no documents", async () => {
    documentCount.mockResolvedValueOnce(0)
    documentCount.mockResolvedValueOnce(0)

    const result = await getDocumentMatchRateStats(WS, "purchase_order", ["po_to_invoice"])

    expect(result).toEqual({ total: 0, matched: 0, matchRate: 0 })
  })
})
