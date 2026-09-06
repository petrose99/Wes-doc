/** Readiness evaluation — pure and deterministic, no Prisma.
 *
 * Given a document's current state (field confidences, check results, duplicate status, rule match,
 * open review tasks, policy verdict, template pushability), decides whether the document is "ready
 * to sync" or blocked, and lists every blocker with a machine-readable code and human detail. */

export type BlockerCode =
  | `low_confidence:${string}`
  | `missing_required_field:${string}`
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
  /// A1.4: the supplier's first N documents route to review regardless of confidence — a new
  /// mapping the workspace hasn't confirmed for this vendor yet.
  | "supplier_cold_start"
  /// A1.3: this document was picked into the QA sample. Kept as a blocker, not a "warn",
  /// because the review is the whole point — bypassing it defeats the check.
  | "qa_sample"
  /// A4.3: a hard business-rule invariant fired (duplicate, arithmetic fail, bank-detail
  /// change, split invoice) — these never go touchless whatever the confidence.
  | "business_rule_backstop"
  | "category_unconfirmed"

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

/** A4.3: the check codes that always block touchless regardless of the workspace's other
 * settings. These are the roadmap's hard invariants — a duplicate must never sync to the
 * accounting provider unattended even if a workspace has cranked minConfidence to 0.5. */
export const ALWAYS_BLOCKING_CHECKS = new Set([
  "duplicate",
  "invoice_arithmetic",
  "bank_detail_change",
  "split_invoice",
])

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
  /** A1.4: true while the resolved supplier is inside its cold-start window. */
  supplierColdStart?: boolean
  /** A1.3: true when this document was picked into the workspace QA sample. */
  qaSample?: boolean
  /** A1.6: field keys that MUST clear minConfidence for touchless. Non-critical fields at low
   * confidence never block on their own — a wrong-looking "notes" field shouldn't hold up a
   * clean-total invoice. Empty/absent falls back to the historic behaviour (every field gates). */
  criticalFieldKeys?: string[]
  /** The template's own `required: true` field keys, at the version this document was extracted
   * against (Document.fieldSnapshot, not the live template — a template edited since extraction
   * must not retroactively judge an old document by fields it never had a chance to fill).
   *
   * A field entirely absent from fieldConfidences was invisible to the loop above: the low-
   * confidence check only ever iterates keys THAT EXIST in the map, so a required field the
   * extractor found nothing for — not "unsure", but nothing — produced no blocker at all and the
   * document could go touchless without it. Confirmed live: a 40-document load test hit this on
   * a document extracted with no invoice_number whatsoever, which sailed through to
   * ready_for_review. A missing required field is at least as bad as a low-confidence one, so it
   * blocks the same way. */
  requiredFieldKeys?: string[]
  /** A1.5: when true, the document matches a recurring pattern for this supplier — a strong
   * business-as-usual signal. Doesn't override checks or policy, but lets the caller relax the
   * minConfidence input to the workspace floor even inside cold-start. */
  isRecurring?: boolean
  categoryConfirmed?: boolean
}

/** Blockers that route a document to a human WITHOUT saying anything is wrong with it: the
 * supplier's cold-start window and the QA sample both deliberately hold back documents that
 * already cleared every substantive gate. A document blocked only by these was touchless-eligible.
 *
 * This distinction is what makes cold start escapable. touchlessSeen used to be incremented only
 * when a document reached "ready", but supplier_cold_start blocks "ready" until touchlessSeen
 * reaches SUPPLIER_COLD_START_COUNT — so the counter could never leave 0 and no supplier ever
 * graduated. Counting eligibility instead of outcome breaks that cycle. */
export const NON_DISQUALIFYING_BLOCKERS: ReadonlySet<string> = new Set(["supplier_cold_start", "qa_sample"])

/** True when nothing but a deliberate hold-back stands between this document and a touchless push.
 * An empty blocker list (the "ready" case) is eligible by definition. */
export function isTouchlessEligible(blockers: Blocker[]): boolean {
  return blockers.every((blocker) => NON_DISQUALIFYING_BLOCKERS.has(blocker.code))
}

export function evaluateReadiness(input: ReadinessInput): ReadinessResult {
  const blockers: Blocker[] = []

  if (!input.hasExtraction) {
    blockers.push({ code: "no_extraction", detail: "Document has not been extracted yet." })
    return { status: "blocked", blockers }
  }

  if (input.fieldConfidences) {
    // A1.6: when a critical-field set is configured, only THOSE fields' low confidence blocks —
    // a low-confidence "notes" doesn't hold up a clean-total invoice. Empty/absent set keeps
    // the historic behaviour (every field gates), so a workspace that hasn't opted in is
    // unaffected.
    const criticalSet = input.criticalFieldKeys?.length ? new Set(input.criticalFieldKeys) : null
    for (const [field, confidence] of Object.entries(input.fieldConfidences)) {
      if (criticalSet && !criticalSet.has(field)) continue
      if (confidence < input.minConfidence) {
        blockers.push({
          code: `low_confidence:${field}`,
          detail: `Field "${field}" confidence ${confidence.toFixed(2)} is below threshold ${input.minConfidence.toFixed(2)}.`,
        })
      }
    }

    // A field the extractor found nothing for is worse than one it is merely unsure about, but
    // was previously invisible here — the loop above only ever considers keys THAT EXIST in
    // fieldConfidences. Gated by the same criticalSet as the loop above: a workspace that has
    // narrowed which fields matter should get that narrowing applied consistently, not have
    // "missing" held to a stricter standard than "low confidence" the moment it opts in.
    for (const field of input.requiredFieldKeys ?? []) {
      if (criticalSet && !criticalSet.has(field)) continue
      if (field in input.fieldConfidences) continue
      blockers.push({ code: `missing_required_field:${field}`, detail: `Required field "${field}" was not extracted at all.` })
    }
  }

  for (const check of input.checkResults) {
    if (check.status === "fail") {
      blockers.push({ code: "check_failed", detail: `Check "${check.checkCode}" failed.` })
    } else if (check.status === "warn" && input.blockOnWarnChecks) {
      blockers.push({ code: "check_warned", detail: `Check "${check.checkCode}" warned (workspace blocks on warnings).` })
    }
  }

  // A4.3 business-rule backstop: a handful of check codes ALWAYS block regardless of
  // confidence, coding, or workspace toggle — invariants that must never go touchless.
  // Duplicate/arithmetic-fail/bank-change/split-invoice: the roadmap's non-negotiables.
  for (const check of input.checkResults) {
    if (check.status === "fail" && ALWAYS_BLOCKING_CHECKS.has(check.checkCode)) {
      // Already emitted as check_failed above; the emphasised code makes it visible in
      // audit/UI as a first-class backstop rather than a generic check failure.
      if (!blockers.some((blocker) => blocker.code === "business_rule_backstop" && blocker.detail.includes(check.checkCode))) {
        blockers.push({ code: "business_rule_backstop", detail: `Check "${check.checkCode}" is a hard invariant — always requires review.` })
      }
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

  if (input.supplierColdStart) {
    blockers.push({ code: "supplier_cold_start", detail: "First documents from a supplier always go through a reviewer, whatever the confidence." })
  }
  if (input.qaSample) {
    blockers.push({ code: "qa_sample", detail: "This document was picked into the workspace QA sample — a spot check of touchless-eligible documents." })
  }

  if (input.isPushable && input.categoryConfirmed === false) {
    blockers.push({ code: "category_unconfirmed", detail: "Document category must be confirmed before pushing." })
  }

  return { status: blockers.length === 0 ? "ready" : "blocked", blockers }
}
