/** Per-field confidence as a queue row shows it, per #219 (Wayfinder map #177).
 *
 * Two states, one floor. The floor is the workspace's `minConfidence` — the same number the
 * Touchless tier is judged against — so a field that reads as confident in a row would also
 * clear Touchless. There is deliberately no third "red" band and no second hard-coded cutoff:
 * #219 found four coexisting "confident" numbers in the tree (0.6 stage cutoff, 0.65/0.85 in
 * the old row underline, the workspace floor, the amount-band gate floors) and named the
 * workspace floor as the only user-facing one. `CONTEXT.md` → "Confidence threshold".
 *
 * `null` means "no AI claim": the field was entered by a person or never scored. That is a
 * defined absence, not a low score, and the row shows nothing for it. */

export type ConfidenceState = "confident" | "below"

export function confidenceState(value: number | undefined | null, minConfidence: number): ConfidenceState | null {
  if (typeof value !== "number" || Number.isNaN(value)) return null
  return value >= minConfidence ? "confident" : "below"
}

/** Percent as `getMinConfidencePercent` hands it to the tables, back to the 0-1 scale
 * `fieldConfidence` is recorded on. */
export function minConfidenceFromPercent(percent: number): number {
  return percent / 100
}
