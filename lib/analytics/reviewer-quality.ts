/** A4.6: reviewer-quality dashboard rollups. Pure over ReviewerActivity rows. */

export type ReviewerActivityRow = {
  reviewerId: string
  outcome: string
  fieldCount: number
  durationMs: number | null
  createdAt: Date
}

export type ReviewerStats = {
  reviewerId: string
  reviewedCount: number
  correctionRate: number
  avgFieldsPerReview: number
  avgSecondsPerReview: number | null
  goldenTotal: number
  goldenAccuracy: number
}

export function rollupReviewerQuality(rows: ReviewerActivityRow[]): ReviewerStats[] {
  const buckets = new Map<string, ReviewerActivityRow[]>()
  for (const row of rows) {
    const bucket = buckets.get(row.reviewerId) ?? []
    bucket.push(row)
    buckets.set(row.reviewerId, bucket)
  }
  const out: ReviewerStats[] = []
  for (const [reviewerId, all] of buckets) {
    const real = all.filter((row) => row.outcome !== "correct" && row.outcome !== "partial" && row.outcome !== "miss")
    const reviewedCount = real.length
    const withChanges = real.filter((row) => row.fieldCount > 0).length
    const correctionRate = reviewedCount ? withChanges / reviewedCount : 0
    const totalFields = real.reduce((sum, row) => sum + row.fieldCount, 0)
    const avgFieldsPerReview = reviewedCount ? totalFields / reviewedCount : 0
    const withDuration = real.filter((row) => row.durationMs !== null)
    const avgSecondsPerReview = withDuration.length
      ? (withDuration.reduce((sum, row) => sum + (row.durationMs ?? 0), 0) / withDuration.length) / 1000
      : null

    const goldens = all.filter((row) => row.outcome === "correct" || row.outcome === "partial" || row.outcome === "miss")
    const goldenTotal = goldens.length
    const correct = goldens.filter((row) => row.outcome === "correct").length
    const goldenAccuracy = goldenTotal ? correct / goldenTotal : 0

    out.push({ reviewerId, reviewedCount, correctionRate, avgFieldsPerReview, avgSecondsPerReview, goldenTotal, goldenAccuracy })
  }
  return out.sort((a, b) => b.reviewedCount - a.reviewedCount)
}
