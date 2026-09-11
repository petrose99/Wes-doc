/** Pure decision logic for a ReviewTask attached to an ApprovalWorkflow (Dext-parity Phase 3
 * WP3.1). Deliberately has no Prisma import — models/review-tasks.ts loads the workflow's stages
 * and the task's currentStageIndex, calls these, and persists whatever comes back, the same split
 * as lib/bank-match/matcher.ts (pure scoring) vs models/bank-matches.ts (persistence).
 *
 * WP-AP2 extends the stage shape with named approvers and an amount threshold — both optional and
 * both default to the original role-only, always-applicable behavior. */

export type WorkflowStageInput = {
  stageIndex: number
  requireOwner: boolean
  name: string
  /** WP-AP2: per-stage named approvers. Empty means role-only gating (the historic behavior). */
  approverIds?: string[]
  /** WP-AP2: amount threshold. Null / undefined means the stage applies at every amount. */
  minAmount?: number | null
}

/** Adapter for stage rows loaded from Prisma — normalises Decimal to number so callers can pass
 * `workflow.stages` straight into the engine without hand-mapping at every call site. Kept here (not
 * in models/) so the engine's zero-Prisma-import promise still holds: the input is a plain object
 * with a `.toNumber()` on minAmount, matching Prisma.Decimal's shape without naming the type. */
export function toWorkflowStageInputs(
  stages: readonly (Omit<WorkflowStageInput, "minAmount"> & { minAmount: { toNumber(): number } | number | null })[],
): WorkflowStageInput[] {
  return stages.map((stage) => ({
    stageIndex: stage.stageIndex,
    requireOwner: stage.requireOwner,
    name: stage.name,
    approverIds: stage.approverIds,
    minAmount:
      stage.minAmount === null || stage.minAmount === undefined
        ? null
        : typeof stage.minAmount === "number"
          ? stage.minAmount
          : stage.minAmount.toNumber(),
  }))
}

/** Role + named-approver gating. Precedence:
 *   - When `approverIds` is non-empty, the actor MUST be in it (regardless of role). This lets a
 *     workspace name specific approvers per stage without also having to make them owners.
 *   - Otherwise fall back to role gating: `requireOwner` forces owner, else any member is fine.
 *
 * The two rules deliberately don't compose ("owner AND in list") — a named list is the whole
 * authority, and mixing them would make the settings surface hard to reason about. If a workspace
 * wants "an owner from this list", they leave `requireOwner` on and put owners in the list. */
export function canDecideStage(input: { stage: WorkflowStageInput; actorRole: "owner" | "member"; actorId?: string | null }): boolean {
  const approvers = input.stage.approverIds ?? []
  if (approvers.length > 0) return input.actorId ? approvers.includes(input.actorId) : false
  return !input.stage.requireOwner || input.actorRole === "owner"
}

export type StageDecisionResult =
  | { outcome: "advance"; nextStageIndex: number }
  | { outcome: "approved" }
  | { outcome: "rejected" }

/** A rejection at any stage is terminal regardless of how many stages remain — approvals are not
 * negotiable back and forth here, only a fresh review task (or workflow restart) starts over. An
 * approval either moves to the next stage index or, once the last stage clears, resolves the task. */
export function decideStage(input: { stages: WorkflowStageInput[]; currentStageIndex: number; decision: "approve" | "reject" }): StageDecisionResult {
  if (input.decision === "reject") return { outcome: "rejected" }
  const nextStageIndex = input.currentStageIndex + 1
  if (nextStageIndex >= input.stages.length) return { outcome: "approved" }
  return { outcome: "advance", nextStageIndex }
}

/** Looks up the stage a task is currently sitting at. Null if the index doesn't correspond to any
 * stage — shouldn't happen in practice (currentStageIndex only ever moves forward one at a time
 * from 0), but callers must not assume `.find` succeeds since a workflow's stages could in theory
 * be edited out from under an in-flight task. */
export function findCurrentStage(stages: WorkflowStageInput[], currentStageIndex: number): WorkflowStageInput | null {
  return stages.find((stage) => stage.stageIndex === currentStageIndex) ?? null
}

/** WP-AP2: filters stages by amount threshold. A stage with a non-null `minAmount` is dropped
 * from the list when the bill's amount is below it — the resulting list is the sequence of stages
 * this particular bill actually flows through. When `amount` is null (unknown), stages with an
 * explicit threshold are dropped defensively rather than assumed to apply, matching the "err on
 * the safe side" default the rest of the checks pipeline uses.
 *
 * `stageIndex` is re-numbered from 0 in the returned list so decideStage still terminates at the
 * last applicable stage — the callers already treat stageIndex as opaque ordinal metadata. */
export function applicableStages(stages: WorkflowStageInput[], amount: number | null): WorkflowStageInput[] {
  const filtered = stages.filter((stage) => {
    if (stage.minAmount === null || stage.minAmount === undefined) return true
    if (amount === null) return false
    return amount >= stage.minAmount
  })
  return filtered.map((stage, i) => ({ ...stage, stageIndex: i }))
}
