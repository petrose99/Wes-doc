/** A1.2: amount-band routing. A workspace can configure a lower confidence floor for small,
 * low-risk documents ("anything under $500 for a verified supplier can go with 0.85") — pure
 * decision function over a JSON-defined band table stored on WorkspaceAutomationConfig. Higher
 * bands (bigger amounts) always win; a document over the highest band's max keeps the workspace
 * floor. Verified-supplier bands only apply when the supplier's stats confirm it. */

export type AmountBand = {
  /** Inclusive lower bound in the document's currency; a null lower is unbounded down. */
  min: number | null
  /** Inclusive upper bound; a null upper is unbounded up. */
  max: number | null
  /** The confidence floor to apply while in this band. */
  minConfidence: number
  /** When true, this band only applies if the supplier has cleared A1.4 cold-start (i.e. is
   * touchlessSeen >= threshold). Absent = applies to any supplier. */
  requireVerifiedSupplier?: boolean
}

export type AmountBandInput = {
  amount: number | null
  supplierVerified: boolean
  workspaceMinConfidence: number
  bands: AmountBand[]
}

export function bandFor(input: AmountBandInput): { minConfidence: number; matchedBand: AmountBand | null } {
  if (input.amount === null || !Number.isFinite(input.amount) || !input.bands?.length) {
    return { minConfidence: input.workspaceMinConfidence, matchedBand: null }
  }
  const absAmount = Math.abs(input.amount)
  const candidates = input.bands
    .filter((band) => (band.min === null || absAmount >= band.min) && (band.max === null || absAmount <= band.max))
    .filter((band) => !band.requireVerifiedSupplier || input.supplierVerified)
  if (!candidates.length) return { minConfidence: input.workspaceMinConfidence, matchedBand: null }
  // A configured band NEVER makes the floor stricter than the workspace's own — bands relax,
  // they don't tighten. If a workspace wants a stricter regime globally, they raise
  // workspaceMinConfidence itself.
  const best = candidates.reduce((chosen, band) => (band.minConfidence < chosen.minConfidence ? band : chosen))
  return {
    minConfidence: Math.min(input.workspaceMinConfidence, best.minConfidence),
    matchedBand: best,
  }
}

export function parseBands(raw: unknown): AmountBand[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((entry) => {
      const row = entry as Record<string, unknown> | null
      if (!row) return null
      const min = typeof row.min === "number" ? row.min : row.min === null ? null : undefined
      const max = typeof row.max === "number" ? row.max : row.max === null ? null : undefined
      const minConfidence = typeof row.minConfidence === "number" ? row.minConfidence : undefined
      if (min === undefined || max === undefined || minConfidence === undefined) return null
      if (minConfidence < 0 || minConfidence > 1) return null
      const band: AmountBand = {
        min, max, minConfidence,
        requireVerifiedSupplier: row.requireVerifiedSupplier === true,
      }
      return band
    })
    .filter((band): band is AmountBand => band !== null)
}
