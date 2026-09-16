/** Pure eligibility logic for one Approvals row (#236, Wayfinder map #177's Approvals ticket).
 * No Prisma import here on purpose — models/approvals.ts loads the workspace's members, the
 * document's open gates/exceptions, and the workflow stage, then calls these, the same split as
 * lib/documents/processing-state.ts (pure) vs models/bills.ts (persistence).
 *
 * CONTEXT.md's "Not eligible": "An Approval that is visible to its Approver but cannot be
 * decided yet because a hard check failed or an escalation is open on the invoice. Never hidden,
 * never overridable from Approvals; the reason is shown on the row." A third state, "no
 * approver" (decision #10's "approver no longer a workspace member"), outranks both: nobody
 * being able to decide the stage at all is a structural problem the row's own eligibility can't
 * paper over. */

export type ApprovalEligibility =
  | { status: "ready" }
  | { status: "not_eligible"; reason: string }
  | { status: "no_approver" }

export const NO_APPROVER_REASON = "Needs attention · no approver"

export function computeApprovalEligibility(input: {
  /** A DocumentCheckResult escalation (CONTEXT.md's "Check") is still open on this invoice. */
  hasOpenException: boolean
  /** A hard-severity Gate (lib/gates) is still `blocked` on this invoice — a PO Mismatch's own
   * match-variance gate is soft and never makes a row "Not eligible" on its own (decision #4). */
  hasBlockedHardGate: boolean
  /** Whether at least one workspace member could still decide the stage, per
   * `stageHasEligibleApprover` below. */
  approverStillValid: boolean
}): ApprovalEligibility {
  if (!input.approverStillValid) return { status: "no_approver" }
  if (input.hasBlockedHardGate) return { status: "not_eligible", reason: "A hard check failed on this invoice." }
  if (input.hasOpenException) return { status: "not_eligible", reason: "An exception is open on this invoice." }
  return { status: "ready" }
}

/** Structural version of `canDecideStage` (lib/approvals/engine.ts): not "can THIS actor decide
 * it" but "can ANY current workspace member decide it at all". A stage naming specific approvers
 * who have all since left the workspace has nobody who could ever clear it — that is the "Needs
 * attention · no approver" state, distinct from "not eligible" (which resolves itself once the
 * blocking check/exception clears) since it needs an admin to re-point the stage at a real
 * member. */
export function stageHasEligibleApprover(
  stage: { requireOwner: boolean; approverIds?: string[] },
  memberIds: ReadonlySet<string>,
  hasOwnerMember: boolean,
): boolean {
  const approvers = stage.approverIds ?? []
  if (approvers.length > 0) return approvers.some((id) => memberIds.has(id))
  if (stage.requireOwner) return hasOwnerMember
  return memberIds.size > 0
}
