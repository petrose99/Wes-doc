/** The pure decision layer for source-file attaches, mirroring lib/integration-push-policy.ts
 * exactly (same backoff curve, same computeXUpdate shape) with its own attempt cap and lease,
 * kept as its own named constant per module rather than imported — matching how integration-
 * push-policy.ts keeps MAX_PUSH_ATTEMPTS distinct from webhook-delivery-policy.ts's 8. */

import { backoffMinutes } from "@/lib/webhook-delivery-policy"

/** An attach is abandoned (status → failed) after this many failed attempts. Same value as
 * MAX_PUSH_ATTEMPTS by coincidence of shape, not by import — the two queues are allowed to diverge. */
export const MAX_ATTACH_ATTEMPTS = 5

/** How long a claimed attach is leased to one drain before it may be re-claimed. Same order of
 * magnitude as PUSH_LEASE_MS: an attach is a listAttachments read plus one upload call. */
export const ATTACH_LEASE_MS = 2 * 60 * 1000

export type AttachOutcome =
  | { status: "succeeded"; nextAttemptAt: null }
  | { status: "failed"; nextAttemptAt: null }
  | { status: "pending"; nextAttemptAt: Date }

/** Given the just-completed attempt (`attempts` = the count AFTER incrementing, `success` = did the
 * provider accept the upload) and `now`, decide the attach row's next state. Pure: the caller
 * supplies `now`. Same shape as pushOutcome. */
export function attachOutcome(attempts: number, success: boolean, now: Date): AttachOutcome {
  if (success) return { status: "succeeded", nextAttemptAt: null }
  if (attempts >= MAX_ATTACH_ATTEMPTS) return { status: "failed", nextAttemptAt: null }
  return { status: "pending", nextAttemptAt: new Date(now.getTime() + backoffMinutes(attempts) * 60_000) }
}

export type AttachAttemptResult = { success: boolean; errorCode: string | null; externalAttachmentId: string | null }

export type AttachUpdate = {
  status: "succeeded" | "failed" | "pending"
  attempts: number
  leaseUntil: null
  nextAttemptAt: Date
  errorCode: string | null
  externalAttachmentId: string | null
  completedAt: Date | null
}

/** The full set of DB updates for one completed attach attempt, computed purely so the
 * orchestrator in lib/integration-attach.ts only has to apply them. `priorAttempts` is the row's
 * attempts count BEFORE this attempt. `now` is injected.
 *
 * A permanent (non-retryable) failure is signalled by the caller passing `forceTerminal = true`,
 * exactly as computePushUpdate does for permanent provider errors — the row fails immediately
 * instead of burning retries on something that can never succeed (wrong type, over size, gone). */
export function computeAttachUpdate(priorAttempts: number, result: AttachAttemptResult, now: Date, forceTerminal = false): AttachUpdate {
  const attempts = priorAttempts + 1
  const effectiveAttempts = forceTerminal ? Math.max(attempts, MAX_ATTACH_ATTEMPTS) : attempts
  const outcome = attachOutcome(effectiveAttempts, result.success, now)
  return {
    status: outcome.status,
    attempts,
    leaseUntil: null,
    nextAttemptAt: outcome.nextAttemptAt ?? now,
    errorCode: result.success ? null : result.errorCode,
    externalAttachmentId: result.externalAttachmentId,
    completedAt: outcome.status === "succeeded" || outcome.status === "failed" ? now : null,
  }
}
