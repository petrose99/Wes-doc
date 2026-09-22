/** Where a queue row stands in the intake → review → approval path, per #222 (Wayfinder map
 * #177): one of five states, always exactly one, in this precedence order:
 *
 *   Cancelled → Needs attention → In review → Touchless → Approved
 *
 * A row's ledger facts (Synced, Paid) and due-date urgency are never part of this: they render
 * as their own Status pill / countdown badge, unaffected by processing state. `CONTEXT.md` →
 * "Processing state". */

export type ProcessingApprovalStatus = "not_started" | "in_progress" | "approved" | "rejected" | "cancelled"

export type ProcessingStateInput = {
  approvalStatus: ProcessingApprovalStatus
  blockedByCheck: boolean
  /** An open (not yet resolved) escalation exists on this document — see `ExceptionRow` /
   * `listOpenExceptions` in `models/exceptions.ts`. Folds into Needs attention: the triangle
   * already means "a human must look", so escalation gets no state of its own (#222). */
  escalated: boolean
  touchless: boolean
  /** The document's own `status` (e.g. "needs_review" / "ready_for_review" / "reviewed"). A
   * `ReviewTask` is only ever created for a document a check has flagged or a reviewer has
   * picked up — a freshly extracted, untouched document has no task at all, so `approvalStatus`
   * alone would default it straight to "approved" with nobody having looked at it. Treating
   * anything short of `"reviewed"` as still In review closes that gap. */
  status: string
  /** #258: a client-side bulk approve held this row back (missing required fields or a document
   * type) before the server round-trips. Default false — the server never sets this; it is the
   * one input the glyph, the pill, the Status line sentence and the facet filter share so they
   * cannot disagree (#258 closed a split where the pill folded this in but the glyph did not). */
  heldBack?: boolean
}

export type ProcessingState = "cancelled" | "needs_attention" | "in_review" | "touchless" | "approved"

/** The five states in precedence order — also `PROCESSING_STATE_LABELS`'s key order. */
export const PROCESSING_STATES: ProcessingState[] = ["cancelled", "needs_attention", "in_review", "touchless", "approved"]

/** The one vocabulary for a document's processing state (#258 Wayfinder map #226): every surface
 * that prints a state imports this map rather than writing its own word. Sentence case; never
 * concatenated with another word to build a different status. */
export const PROCESSING_STATE_LABELS: Record<ProcessingState, string> = {
  cancelled: "Cancelled",
  needs_attention: "Needs attention",
  in_review: "In review",
  touchless: "Touchless",
  approved: "Approved",
}

/** The ledger word, one place (#281, map #226): "Synced" retired from every user-visible surface
 * (#248's decision) — the internal key is `posted` too, not just the label, so no surface can
 * regress by printing the raw key. */
export type LedgerFact = "posting" | "posted" | "failed" | "paid"
export const LEDGER_FACT_LABELS: Record<LedgerFact, string> = {
  posting: "Posting…",
  posted: "Posted",
  failed: "Post failed",
  paid: "Paid",
}

export function processingState(input: ProcessingStateInput): ProcessingState {
  if (input.approvalStatus === "cancelled") return "cancelled"
  if (input.blockedByCheck || input.escalated || input.approvalStatus === "rejected" || input.heldBack) return "needs_attention"
  if (input.approvalStatus === "in_progress" || input.approvalStatus === "not_started" || input.status !== "reviewed") return "in_review"
  if (input.touchless) return "touchless"
  return "approved"
}
