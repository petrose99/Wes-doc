import { describe, expect, it } from "vitest"
import { AI_CODING_MIN_CONFIDENCE, evaluateReadiness, type ReadinessInput } from "./evaluate"

const base = (): ReadinessInput => ({
  hasActiveRules: true,
  hasRuleMatch: false,
  codingSource: null,
  codingConfidence: null,
  missingRequiredFields: [],
  failedChecks: [],
  fieldConfidence: {},
  lowConfidenceThreshold: 0.6,
})

describe("evaluateReadiness", () => {
  it("reports no_rule_match when no rule matched and no AI coding", () => {
    const blockers = evaluateReadiness(base())
    expect(blockers).toContainEqual({ code: "no_rule_match" })
  })

  it("suppresses no_rule_match when codingSource is manual", () => {
    const blockers = evaluateReadiness({ ...base(), codingSource: "manual" })
    expect(blockers.find((b) => b.code === "no_rule_match")).toBeUndefined()
    expect(blockers.find((b) => b.code === "ai_coding_unconfirmed")).toBeUndefined()
  })

  it("suppresses no_rule_match when AI confidence >= threshold", () => {
    const blockers = evaluateReadiness({ ...base(), codingSource: "ai", codingConfidence: AI_CODING_MIN_CONFIDENCE })
    expect(blockers.find((b) => b.code === "no_rule_match")).toBeUndefined()
    expect(blockers.find((b) => b.code === "ai_coding_unconfirmed")).toBeUndefined()
  })

  it("reports ai_coding_unconfirmed when AI confidence < threshold", () => {
    const blockers = evaluateReadiness({ ...base(), codingSource: "ai", codingConfidence: 0.89 })
    expect(blockers).toContainEqual(expect.objectContaining({ code: "ai_coding_unconfirmed" }))
  })

  it("treats exactly the threshold as confirmed", () => {
    const blockers = evaluateReadiness({ ...base(), codingSource: "ai", codingConfidence: 0.9 })
    expect(blockers.find((b) => b.code === "ai_coding_unconfirmed")).toBeUndefined()
  })

  it("does not block on no_rule_match when hasActiveRules is false", () => {
    const blockers = evaluateReadiness({ ...base(), hasActiveRules: false })
    expect(blockers.find((b) => b.code === "no_rule_match")).toBeUndefined()
  })

  it("does not block on AI coding when a rule matched", () => {
    const blockers = evaluateReadiness({ ...base(), hasRuleMatch: true })
    expect(blockers.find((b) => b.code === "no_rule_match")).toBeUndefined()
    expect(blockers.find((b) => b.code === "ai_coding_unconfirmed")).toBeUndefined()
  })

  it("reports missing required fields", () => {
    const blockers = evaluateReadiness({ ...base(), missingRequiredFields: ["vendor"] })
    expect(blockers).toContainEqual({ code: "missing_required_fields", detail: "vendor" })
  })

  it("reports failed checks", () => {
    const blockers = evaluateReadiness({ ...base(), failedChecks: ["duplicate"] })
    expect(blockers).toContainEqual({ code: "check_failed", detail: "duplicate" })
  })

  it("reports low-confidence fields", () => {
    const blockers = evaluateReadiness({ ...base(), fieldConfidence: { total: 0.3 } })
    expect(blockers).toContainEqual({ code: "low_confidence", detail: "total" })
  })

  it("AI coding with null confidence is treated as zero", () => {
    const blockers = evaluateReadiness({ ...base(), codingSource: "ai", codingConfidence: null })
    expect(blockers).toContainEqual(expect.objectContaining({ code: "ai_coding_unconfirmed" }))
  })
})

describe("AI_CODING_MIN_CONFIDENCE", () => {
  it("is 0.9", () => {
    expect(AI_CODING_MIN_CONFIDENCE).toBe(0.9)
  })
})
