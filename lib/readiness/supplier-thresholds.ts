/** A1.1 + A1.4: the per-supplier automation dial. A brand-new supplier holds at the strict
 * 0.98 floor; after enough consecutive clean touchless documents it steps down to the
 * workspace's own minConfidence (never below the safety floor). The first N documents from
 * ANY supplier — even one with a long clean history at another workspace — always go through
 * a person (A1.4 cold-start). Pure: readiness/refresh.ts reads the Supplier stats + workspace
 * config and hands them in; models/documents.ts on a review commit is what updates the stats. */

/** Strictest bar a workspace can be at while still being called "touchless": below this the
 * document is always reviewable, whatever the workspace's own minConfidence says. */
export const SUPPLIER_TRUST_FLOOR = 0.9
/** New-supplier bar until the streak is long enough to trust. */
export const SUPPLIER_COLD_THRESHOLD = 0.98
/** Consecutive clean touchless documents before a supplier is trusted enough to step down. */
export const SUPPLIER_TRUST_STREAK = 10
/** A supplier's first N documents always route to review regardless of confidence — a fresh
 * mapping/coding decision that the workspace has never confirmed for this vendor. */
export const SUPPLIER_COLD_START_COUNT = 3

export type SupplierThresholdInput = {
  /** The workspace's own configured floor (WorkspaceAutomationConfig.minConfidence). */
  workspaceMinConfidence: number
  /** How many touchless-eligible documents this supplier has been through here. Null when the
   * supplier hasn't been resolved (the extraction had no supplier field, say) — treat as new. */
  touchlessSeen: number | null
  /** Rolling count of consecutive touchless-approved-without-correction documents for this
   * supplier. Null when unknown — treat as 0. */
  consecutiveClean: number | null
}

export type SupplierThresholdVerdict = {
  /** The floor evaluateReadiness should apply for this document. */
  effectiveMinConfidence: number
  /** True while the supplier is still in its cold-start window — the caller must add an
   * "open_review_task" style blocker regardless of confidence, or otherwise force review. */
  coldStart: boolean
}

export function supplierThreshold(input: SupplierThresholdInput): SupplierThresholdVerdict {
  const seen = input.touchlessSeen ?? 0
  const clean = input.consecutiveClean ?? 0
  const coldStart = seen < SUPPLIER_COLD_START_COUNT
  const trusted = clean >= SUPPLIER_TRUST_STREAK
  const workspaceFloor = Math.max(input.workspaceMinConfidence, SUPPLIER_TRUST_FLOOR)
  const effectiveMinConfidence = trusted ? workspaceFloor : Math.max(SUPPLIER_COLD_THRESHOLD, workspaceFloor)
  return { effectiveMinConfidence, coldStart }
}

/** A1.3: deterministic QA sampling — same document, same rate ⇒ same verdict, so a run that
 * sampled this doc yesterday still samples it today. Fraction is the QA rate on the workspace
 * config; 0 disables. Uses an FNV-1a hash of the document id (pure, no dependencies), no
 * Math.random so the decision is a stable audit fact rather than a coin flip. */
export function shouldSampleForQa(documentId: string, rate: number): boolean {
  if (!(rate > 0)) return false
  if (rate >= 1) return true
  let hash = 2166136261
  for (let i = 0; i < documentId.length; i++) {
    hash ^= documentId.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  const bucket = (hash >>> 0) / 0x100000000
  return bucket < rate
}
