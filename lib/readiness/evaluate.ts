export const AI_CODING_MIN_CONFIDENCE = 0.9

export type BlockerCode =
  | "no_rule_match"
  | "ai_coding_unconfirmed"
  | "low_confidence"
  | "missing_required_fields"
  | "check_failed"

export type Blocker = { code: BlockerCode; detail?: string }

export type ReadinessInput = {
  hasActiveRules: boolean
  hasRuleMatch: boolean
  codingSource: string | null
  codingConfidence: number | null
  missingRequiredFields: string[]
  failedChecks: string[]
  fieldConfidence: Record<string, number>
  lowConfidenceThreshold: number
}

export function evaluateReadiness(input: ReadinessInput): Blocker[] {
  const blockers: Blocker[] = []

  if (input.missingRequiredFields.length) {
    blockers.push({ code: "missing_required_fields", detail: input.missingRequiredFields.join(", ") })
  }

  for (const check of input.failedChecks) {
    blockers.push({ code: "check_failed", detail: check })
  }

  for (const [field, score] of Object.entries(input.fieldConfidence)) {
    if (score < input.lowConfidenceThreshold) {
      blockers.push({ code: "low_confidence", detail: field })
    }
  }

  if (input.hasActiveRules && !input.hasRuleMatch) {
    if (input.codingSource === "manual") {
      // Human signed off — no blocker
    } else if (input.codingSource === "ai") {
      const conf = input.codingConfidence ?? 0
      if (conf >= AI_CODING_MIN_CONFIDENCE) {
        // High-confidence AI coding — no blocker
      } else {
        blockers.push({ code: "ai_coding_unconfirmed", detail: `AI confidence ${Math.round(conf * 100)}%` })
      }
    } else {
      blockers.push({ code: "no_rule_match" })
    }
  }

  return blockers
}
