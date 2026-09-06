import { describe, expect, it } from "vitest"
import { rollupReviewerQuality, type ReviewerActivityRow } from "@/lib/analytics/reviewer-quality"

const row = (o: Partial<ReviewerActivityRow>): ReviewerActivityRow => ({
  reviewerId: "u1", outcome: "reviewed", fieldCount: 0, durationMs: null, createdAt: new Date("2026-09-06"), ...o,
})

describe("rollupReviewerQuality", () => {
  it("groups by reviewer and computes correction rate + averages", () => {
    const stats = rollupReviewerQuality([
      row({ fieldCount: 2, durationMs: 10_000 }),
      row({ fieldCount: 0, durationMs: 5_000 }),
      row({ fieldCount: 3, durationMs: 15_000 }),
      row({ reviewerId: "u2", fieldCount: 0 }),
    ])
    const u1 = stats.find((s) => s.reviewerId === "u1")!
    expect(u1.reviewedCount).toBe(3)
    expect(u1.correctionRate).toBeCloseTo(2 / 3, 5)
    expect(u1.avgFieldsPerReview).toBeCloseTo(5 / 3, 5)
    expect(u1.avgSecondsPerReview).toBe(10)
    expect(stats.find((s) => s.reviewerId === "u2")?.reviewedCount).toBe(1)
  })

  it("computes golden accuracy separately from real-review counts", () => {
    const stats = rollupReviewerQuality([
      row({ outcome: "reviewed" }),
      row({ outcome: "correct" }),
      row({ outcome: "miss" }),
    ])
    const u1 = stats[0]
    expect(u1.reviewedCount).toBe(1)
    expect(u1.goldenTotal).toBe(2)
    expect(u1.goldenAccuracy).toBe(0.5)
  })
})
