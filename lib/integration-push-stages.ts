/** A7.5: push state machine. A push flows vendor_resolve -> bill_create -> confirmed. Storing
 * the last-completed stage on IntegrationPush.stage lets attemptIntegrationPush RESUME from
 * where it left off after a partial failure instead of re-running every step (which double-
 * creates vendors at QuickBooks/Xero when the second step failed after the first succeeded).
 * Pure: this module owns the state graph; the executor calls transitionStage per successful step. */

export const PUSH_STAGES = ["pending", "vendor_resolved", "bill_created", "confirmed", "failed"] as const
export type PushStage = (typeof PUSH_STAGES)[number]

const ORDER: Record<PushStage, number> = {
  pending: 0, vendor_resolved: 1, bill_created: 2, confirmed: 3, failed: 4,
}

/** Whether `to` is a valid forward transition from `from`. Failed is terminal (never advances)
 * and can be reached from any pending/mid-flight stage. */
export function canTransition(from: PushStage, to: PushStage): boolean {
  if (from === "confirmed" || from === "failed") return to === from
  if (to === "failed") return true
  return ORDER[to] > ORDER[from]
}

/** Whether the executor should skip a stage's work because a prior attempt already completed
 * it. Idempotent-resume gate: vendor_resolve is skipped once stage >= vendor_resolved. */
export function isStageComplete(current: PushStage, stage: Exclude<PushStage, "pending" | "failed">): boolean {
  return ORDER[current] >= ORDER[stage]
}
