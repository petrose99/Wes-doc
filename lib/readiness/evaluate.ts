/** Readiness evaluation — pure and deterministic, no Prisma.
 *
 * Given a document's current state (field confidences, check results, duplicate status, rule match,
 * open review tasks, policy verdict, template pushability), decides whether the document is "ready
 * to sync" or blocked, and lists every blocker with a machine-readable code and human detail. */

export type BlockerCode =
  | `low_confidence:${string}`
  | "low_confidence:overall"
  | "check_failed"
  | "check_warned"
  | "duplicate"
  | "no_rule_match"
  | "ai_coding_unconfirmed"
  | "open_review_task"
  | "policy_violation"
  | "policy_error"
  | "not_pushable"
  | "no_extraction"
  | "budget_exceeded"

export type Blocker = {
  code: BlockerCode
  detail: string
}

export type ReadinessStatus = "ready" | "blocked"

export type ReadinessResult = {
  status: ReadinessStatus
  blockers: Blocker[]
}

export type CheckInput = {
  checkCode: string
  status: "pass" | "warn" | "fail"
}

export type PolicyVerdict = "pass" | "violation" | "error" | "disabled"

/** AI-suggested coding below this confidence needs a person to confirm it. Deliberately not part
 * of WorkspaceAutomationConfig — a fixed bar keeps "touchless" meaning the same thing everywhere. */
export const AI_CODING_MIN_CONFIDENCE = 0.9

export type ReadinessInput = {
  fieldConfidences: Record<string, number> | null
  minConfidence: number
  checkResults: CheckInput[]
  blockOnWarnChecks: boolean
  hasExtraction: boolean
  appliedRuleId: string | null
  hasActiveRules: boolean
  hasOpenReviewTask: boolean
  policyVerdict: PolicyVerdict
  isPushable: boolean
  budgetExceeded?: boolean
  /** How the document's coding was set: "rule" | "ai" | "manual" | null. Callers that gate on the
   * ai-coding capability should pass null instead of "ai" when the module is off. */
  codingSource?: string | null
  codingConfidence?: number | null
}

export function evaluateReadiness(input: ReadinessInput): ReadinessResult {
  const blockers: Blocker[] = []

  if (!input.hasExtraction) {
    blockers.push({ code: "no_extraction", detail: "Document has not been extracted yet." })
    return { status: "blocked", blockers }
  }

  if (input.fieldConfidences) {
    for (const [field, confidence] of Object.entries(input.fieldConfidences)) {
      if (confidence < input.minConfidence) {
        blockers.push({
          code: `low_confidence:${field}`,
          detail: `Field "${field}" confidence ${confidence.toFixed(2)} is below threshold ${input.minConfidence.toFixed(2)}.`,
        })
      }
    }
  }

  for (const check of input.checkResults) {
    if (check.status === "fail") {
      blockers.push({ code: "check_failed", detail: `Check "${check.checkCode}" failed.` })
    } else if (check.status === "warn" && input.blockOnWarnChecks) {
      blockers.push({ code: "check_warned", detail: `Check "${check.checkCode}" warned (workspace blocks on warnings).` })
    }
  }

  const hasDuplicate = input.checkResults.some((c) => c.checkCode === "duplicate" && c.status === "fail")
  if (hasDuplicate) {
    blockers.push({ code: "duplicate", detail: "Document is a duplicate." })
  }

  if (!input.appliedRuleId && input.hasActiveRules) {
    if (input.codingSource === "manual") {
      // A person coded it — the missing rule match no longer blocks anything.
    } else if (input.codingSource === "ai") {
      const confidence = input.codingConfidence ?? 0
      if (confidence < AI_CODING_MIN_CONFIDENCE) {
        blockers.push({
          code: "ai_coding_unconfirmed",
          detail: `AI-suggested coding at ${(confidence * 100).toFixed(0)}% confidence needs a reviewer to confirm it (threshold ${(AI_CODING_MIN_CONFIDENCE * 100).toFixed(0)}%).`,
        })
      }
    } else {
      blockers.push({ code: "no_rule_match", detail: "No automation rule matched this document." })
    }
  }

  if (input.hasOpenReviewTask) {
    blockers.push({ code: "open_review_task", detail: "Document has an unresolved review task." })
  }

  if (input.policyVerdict === "violation") {
    blockers.push({ code: "policy_violation", detail: "Document violates the workspace policy." })
  } else if (input.policyVerdict === "error") {
    blockers.push({ code: "policy_error", detail: "Policy evaluation encountered an error." })
  }

  if (input.budgetExceeded) {
    blockers.push({ code: "budget_exceeded", detail: "Document would exceed a workspace budget threshold." })
  }

  if (!input.isPushable) {
    blockers.push({ code: "not_pushable", detail: "Template is not pushable to the connected accounting provider." })
  }

  return { status: blockers.length === 0 ? "ready" : "blocked", blockers }
}
