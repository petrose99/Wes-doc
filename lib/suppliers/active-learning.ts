/** Q3 A5.9: active-learning pair labeling for supplier resolution. Instead of tuning the
 * A5.2 auto/review thresholds by hand, this samples the pairs the current thresholds are LEAST
 * confident about (right at the 0.80–0.92 boundary) — those are the labeling tasks a human's
 * time is most valuable on. Given the labels, `optimalThresholds` picks the pair of thresholds
 * that maximise recall for a fixed false-merge tolerance. Pure. */

import { SUPPLIER_MATCH_AUTO_THRESHOLD, SUPPLIER_MATCH_REVIEW_THRESHOLD } from "@/lib/suppliers/normalize"

export type PairCandidate = { pairId: string; score: number }
export type PairLabel = { pairId: string; sameSupplier: boolean; score: number }

/** Returns the N candidate pairs closest to the review/auto boundary. Deterministic ordering:
 * sort by distance-to-boundary, then by score. */
export function sampleUncertainPairs(candidates: PairCandidate[], n: number): PairCandidate[] {
  const boundary = (SUPPLIER_MATCH_REVIEW_THRESHOLD + SUPPLIER_MATCH_AUTO_THRESHOLD) / 2
  return [...candidates]
    .filter((c) => c.score >= SUPPLIER_MATCH_REVIEW_THRESHOLD - 0.1 && c.score <= SUPPLIER_MATCH_AUTO_THRESHOLD + 0.05)
    .sort((a, b) => {
      const da = Math.abs(a.score - boundary)
      const db = Math.abs(b.score - boundary)
      return da === db ? a.score - b.score : da - db
    })
    .slice(0, n)
}

/** Given labeled pairs, pick a (review, auto) threshold pair that maximises recall subject to
 * a false-merge tolerance. Sweeps a coarse grid — grid coordinates matter more than exact
 * decimals here (a workspace tunes further by hand from the reported precision/recall). */
export function optimalThresholds(labels: PairLabel[], maxFalseMergeRate = 0.02): { auto: number; review: number; precision: number; recall: number } {
  if (labels.length < 10) return { auto: SUPPLIER_MATCH_AUTO_THRESHOLD, review: SUPPLIER_MATCH_REVIEW_THRESHOLD, precision: 0, recall: 0 }
  let best = { auto: SUPPLIER_MATCH_AUTO_THRESHOLD, review: SUPPLIER_MATCH_REVIEW_THRESHOLD, precision: 0, recall: 0 }
  for (let auto = 0.85; auto <= 0.98; auto += 0.01) {
    for (let review = 0.7; review < auto; review += 0.02) {
      const autoMerged = labels.filter((l) => l.score >= auto)
      if (!autoMerged.length) continue
      const truePositives = autoMerged.filter((l) => l.sameSupplier).length
      const falseMerges = autoMerged.length - truePositives
      const falseMergeRate = falseMerges / autoMerged.length
      if (falseMergeRate > maxFalseMergeRate) continue
      const totalSame = labels.filter((l) => l.sameSupplier).length || 1
      const recall = truePositives / totalSame
      const precision = truePositives / autoMerged.length
      if (recall > best.recall) best = { auto, review, precision, recall }
    }
  }
  return best
}
