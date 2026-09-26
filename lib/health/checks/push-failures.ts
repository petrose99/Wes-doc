/** Flags accounting-provider pushes stuck in failure: IntegrationPush rows with status "failed"
 * and attempts >= 5 (integration-push-policy's own attempt cap — five failed tries means it will
 * never succeed on its own), grouped by errorCode so one root cause reads as one finding instead
 * of one per document.
 *
 * A grouped finding still needs a single representative documentId, since HealthCheckResult's
 * dedupe fingerprint is `${checkCode}:${documentId}:${externalTransactionId}` with no separate
 * group key — two different errorCode groups would otherwise collide on the same fingerprint. The
 * most recently updated failing push in the group is used as that representative; if the group's
 * membership changes next run, a new representative simply produces a new fingerprint and the old
 * finding auto-resolves (models/health.ts's resolve-what-didn't-recur pass). */
import type { CheckAttachSlice, CheckDefinition, CheckPushSlice, CheckRunResult } from "@/lib/health/types"

export const PUSH_FAILURE_ATTEMPT_THRESHOLD = 5
/** IntegrationAttachment's own attempt cap (integration-attach-policy's MAX_ATTACH_ATTEMPTS),
 * kept as its own named constant per module, matching how the attach queue itself never imports
 * the push queue's cap even though both currently happen to be 5. */
export const ATTACH_FAILURE_ATTEMPT_THRESHOLD = 5

function groupByErrorCode<T extends { errorCode: string | null }>(rows: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const row of rows) {
    const key = row.errorCode ?? "unknown"
    const group = groups.get(key)
    if (group) group.push(row)
    else groups.set(key, [row])
  }
  return groups
}

export const pushFailuresCheck: CheckDefinition = {
  code: "push_failures",
  name: "Failed accounting pushes",
  category: "pipeline",
  defaultWeight: 2,
  requiresLedger: false,
  run: (ctx): CheckRunResult => {
    const failed = ctx.pushHistory.filter((push) => push.status === "failed" && push.attempts >= PUSH_FAILURE_ATTEMPT_THRESHOLD)
    const applicableCount = ctx.pushHistory.length

    if (!failed.length) return { findings: [], applicableCount }

    const groups = groupByErrorCode(failed)
    const findings = Array.from(groups.entries()).map(([errorCode, pushes]) => {
      const representative = [...pushes].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0]
      return {
        checkCode: "push_failures",
        category: "pipeline" as const,
        severity: "critical" as const,
        title: `${pushes.length} accounting push${pushes.length === 1 ? "" : "es"} failing with "${errorCode}"`,
        description: `${pushes.length} document${pushes.length === 1 ? "" : "s"} failed to push to your accounting provider (error: ${errorCode}) after ${PUSH_FAILURE_ATTEMPT_THRESHOLD}+ attempts each.`,
        documentId: representative.documentId,
        suggestedAction: "retry_push",
        suggestedActionPayload: { errorCode, pushIds: pushes.map((p) => p.id) },
        affectedCount: pushes.length,
      }
    })

    return { findings, applicableCount }
  },
}

/** #461: the same grouped-failure pattern as pushFailuresCheck, over IntegrationAttachment rows
 * instead of IntegrationPush rows. Its own checkCode ("attach_failures") so it dedupes
 * independently — a bill can be posted (push succeeded) while its source-file attach keeps
 * failing, and the two need separate findings, not one that masks the other. */
export const attachFailuresCheck: CheckDefinition = {
  code: "attach_failures",
  name: "Failed source-file attaches",
  category: "pipeline",
  defaultWeight: 1,
  requiresLedger: false,
  run: (ctx): CheckRunResult => {
    const failed = ctx.attachHistory.filter((attach) => attach.status === "failed" && attach.attempts >= ATTACH_FAILURE_ATTEMPT_THRESHOLD)
    const applicableCount = ctx.attachHistory.length

    if (!failed.length) return { findings: [], applicableCount }

    const groups = groupByErrorCode<CheckAttachSlice>(failed)
    const findings = Array.from(groups.entries()).map(([errorCode, attaches]) => {
      const representative = [...attaches].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0]
      return {
        checkCode: "attach_failures",
        category: "pipeline" as const,
        severity: "warning" as const,
        title: `${attaches.length} source-file attach${attaches.length === 1 ? "" : "es"} failing with "${errorCode}"`,
        description: `${attaches.length} posted bill${attaches.length === 1 ? "" : "s"} couldn't get its source file attached (error: ${errorCode}) after ${ATTACH_FAILURE_ATTEMPT_THRESHOLD}+ attempts each.`,
        documentId: representative.documentId,
        suggestedAction: "retry_attach",
        suggestedActionPayload: { errorCode, attachmentIds: attaches.map((a) => a.id) },
        affectedCount: attaches.length,
      }
    })

    return { findings, applicableCount }
  },
}
