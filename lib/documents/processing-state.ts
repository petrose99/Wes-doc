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
}

export type ProcessingState = "cancelled" | "needs_attention" | "in_review" | "touchless" | "approved"

export function processingState(input: ProcessingStateInput): ProcessingState {
  if (input.approvalStatus === "cancelled") return "cancelled"
  if (input.blockedByCheck || input.escalated || input.approvalStatus === "rejected") return "needs_attention"
  if (input.approvalStatus === "in_progress" || input.approvalStatus === "not_started" || input.status !== "reviewed") return "in_review"
  if (input.touchless) return "touchless"
  return "approved"
}
