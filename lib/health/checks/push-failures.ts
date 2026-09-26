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
import type { CheckAttachSlice, CheckDefinition, CheckRunResult } from "@/lib/health/types"

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

/** CODING_STANDARDS #9: a new error code gets a user-facing sentence in the same commit — every
 * code `attemptIntegrationAttachment` can produce (lib/integration-attach.ts, lib/integrations/
 * attach-limits.ts) is named here so the Health-tab description never shows a raw code. Anything
 * not listed (a transient/retryable code from `classifyHttpStatus`/`safeErrorCode`) falls back to
 * the humanized-code convention `errorMessage` already uses in action-helpers.ts. */
const ATTACH_ERROR_SENTENCES: Record<string, string> = {
  attach_source_missing: "the source file is no longer stored",
  attach_invalid_type: "the ledger doesn't accept this file type",
  attach_oversize: "the file is too large for the ledger to accept",
  attach_over_count: "the bill already has the maximum number of files the ledger allows",
  attach_bill_gone: "the posted bill no longer exists in the ledger",
  attach_push_not_succeeded: "the post to the ledger hadn't actually finished yet",
  integration_default_account_not_configured: "no default expense account is configured for this connection",
  integration_connection_disabled: "the ledger connection is disabled",
}

function describeAttachError(errorCode: string): string {
  return ATTACH_ERROR_SENTENCES[errorCode] ?? errorCode.replaceAll("_", " ")
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
        description: `${attaches.length} posted bill${attaches.length === 1 ? "" : "s"} couldn't get its source file attached — ${describeAttachError(errorCode)} — after ${ATTACH_FAILURE_ATTEMPT_THRESHOLD}+ attempts each.`,
        documentId: representative.documentId,
        suggestedAction: "retry_attach",
        suggestedActionPayload: { errorCode, attachmentIds: attaches.map((a) => a.id) },
        affectedCount: attaches.length,
      }
    })

    return { findings, applicableCount }
  },
}
