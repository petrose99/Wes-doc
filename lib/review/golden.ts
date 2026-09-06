/** A4.4: score a reviewer's submission against a golden document's expected values. Pure:
 * takes the expected map + the planted-error keys + the reviewer's submitted values, returns a
 * verdict + per-field diagnostics.
 *
 * "correct" = every planted-error field was corrected AND no non-planted field was regressed.
 * "partial" = at least one planted error caught, but not all.
 * "miss" = zero planted errors caught. */

export type GoldenGrade = "correct" | "partial" | "miss"

export type GoldenScoreInput = {
  expected: Record<string, unknown>
  plantedErrorKeys: string[]
  submitted: Record<string, unknown>
}

export type GoldenScoreResult = {
  grade: GoldenGrade
  plantedTotal: number
  plantedCaught: number
  regressions: string[]
  perField: Record<string, "correct" | "wrong" | "unchanged" | "regressed">
}

function scalarsEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || a === undefined) return b === null || b === undefined
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 0.005
  if (typeof a === "string" && typeof b === "string") return a.trim().toLowerCase() === b.trim().toLowerCase()
  return false
}

export function scoreGolden(input: GoldenScoreInput): GoldenScoreResult {
  const perField: GoldenScoreResult["perField"] = {}
  let plantedCaught = 0
  const regressions: string[] = []
  const planted = new Set(input.plantedErrorKeys)

  for (const [key, expected] of Object.entries(input.expected)) {
    const submitted = input.submitted[key]
    const matchesExpected = scalarsEqual(submitted, expected)
    if (planted.has(key)) {
      if (matchesExpected) { perField[key] = "correct"; plantedCaught++ }
      else perField[key] = "wrong"
    } else {
      if (matchesExpected) perField[key] = "unchanged"
      else { perField[key] = "regressed"; regressions.push(key) }
    }
  }

  const plantedTotal = input.plantedErrorKeys.length
  let grade: GoldenGrade
  if (plantedTotal === 0) grade = regressions.length === 0 ? "correct" : "miss"
  else if (plantedCaught === plantedTotal && regressions.length === 0) grade = "correct"
  else if (plantedCaught > 0) grade = "partial"
  else grade = "miss"

  return { grade, plantedTotal, plantedCaught, regressions, perField }
}

/** Deterministic pick: whether the workspace's next task-serve should be a golden. Same
 * (reviewerId, dateKey, rate) => same decision, so a reviewer can't refresh their way past a
 * scheduled golden. Uses the same FNV-1a hash shape as shouldSampleForQa. */
export function shouldServeGolden(reviewerId: string, dateKey: string, rate: number): boolean {
  if (!(rate > 0)) return false
  if (rate >= 1) return true
  const key = `${reviewerId}|${dateKey}`
  let hash = 2166136261
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return ((hash >>> 0) / 0x100000000) < rate
}
