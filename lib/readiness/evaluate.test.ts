import { describe, expect, it } from "vitest"
import { AI_CODING_MIN_CONFIDENCE, evaluateReadiness, isTouchlessEligible, type ReadinessInput } from "./evaluate"

function base(overrides: Partial<ReadinessInput> = {}): ReadinessInput {
  return {
    fieldConfidences: { vendor: 0.95, total: 0.92 },
    minConfidence: 0.85,
    checkResults: [],
    blockOnWarnChecks: false,
    hasExtraction: true,
    appliedRuleId: "rule-1",
    hasActiveRules: true,
    hasOpenReviewTask: false,
    policyVerdict: "disabled",
    isPushable: true,
    ...overrides,
  }
}

describe("evaluateReadiness", () => {
  it("returns ready when all conditions met", () => {
    const result = evaluateReadiness(base())
    expect(result.status).toBe("ready")
    expect(result.blockers).toEqual([])
  })

  it("blocks on no extraction", () => {
    const result = evaluateReadiness(base({ hasExtraction: false }))
    expect(result.status).toBe("blocked")
    expect(result.blockers).toHaveLength(1)
    expect(result.blockers[0].code).toBe("no_extraction")
  })

  it("returns early on no extraction (no other blockers evaluated)", () => {
    const result = evaluateReadiness(base({
      hasExtraction: false,
      fieldConfidences: { vendor: 0.1 },
      hasOpenReviewTask: true,
    }))
    expect(result.blockers).toHaveLength(1)
    expect(result.blockers[0].code).toBe("no_extraction")
  })

  describe("confidence checks", () => {
    it("blocks on low-confidence field", () => {
      const result = evaluateReadiness(base({ fieldConfidences: { vendor: 0.80, total: 0.92 } }))
      expect(result.status).toBe("blocked")
      expect(result.blockers).toHaveLength(1)
      expect(result.blockers[0].code).toBe("low_confidence:vendor")
    })

    it("blocks on multiple low-confidence fields", () => {
      const result = evaluateReadiness(base({ fieldConfidences: { vendor: 0.50, total: 0.60 } }))
      expect(result.blockers).toHaveLength(2)
      expect(result.blockers.map((b) => b.code)).toEqual(["low_confidence:vendor", "low_confidence:total"])
    })

    it("passes when confidence equals threshold exactly", () => {
      const result = evaluateReadiness(base({ fieldConfidences: { vendor: 0.85 } }))
      expect(result.status).toBe("ready")
    })

    it("blocks when confidence is just below threshold", () => {
      const result = evaluateReadiness(base({ fieldConfidences: { vendor: 0.849 } }))
      expect(result.status).toBe("blocked")
    })

    it("handles null fieldConfidences gracefully", () => {
      const result = evaluateReadiness(base({ fieldConfidences: null }))
      expect(result.status).toBe("ready")
    })
  })

  // A field the extractor found nothing for never appeared as a key in fieldConfidences, so the
  // low-confidence loop above — which only ever iterates keys THAT EXIST — had nothing to block
  // on. Confirmed live: a 40-document load test produced a document with invoice_number (a
  // required field) missing entirely, and it reached ready_for_review with no blocker for it.
  describe("missing required fields", () => {
    it("blocks when a required field is entirely absent from fieldConfidences", () => {
      const result = evaluateReadiness(base({ fieldConfidences: { vendor: 0.95 }, requiredFieldKeys: ["vendor", "invoice_number"] }))
      expect(result.status).toBe("blocked")
      expect(result.blockers).toEqual([{ code: "missing_required_field:invoice_number", detail: expect.stringContaining("invoice_number") }])
    })

    it("does not block a required field that is present, even at exactly the threshold", () => {
      const result = evaluateReadiness(base({ fieldConfidences: { vendor: 0.95, invoice_number: 0.85 }, requiredFieldKeys: ["vendor", "invoice_number"] }))
      expect(result.status).toBe("ready")
    })

    it("does not block on a missing field that isn't in requiredFieldKeys", () => {
      const result = evaluateReadiness(base({ fieldConfidences: { vendor: 0.95 }, requiredFieldKeys: ["vendor"] }))
      expect(result.status).toBe("ready")
    })

    it("is unaffected when requiredFieldKeys is absent (no regression for callers that don't pass it)", () => {
      const result = evaluateReadiness(base({ fieldConfidences: { vendor: 0.95 } }))
      expect(result.status).toBe("ready")
    })

    // criticalFieldKeys narrows which fields matter at all — a workspace that opts into it should
    // get that narrowing applied consistently, not have "missing" held to a stricter standard
    // than "low confidence" the moment it turns the feature on.
    it("respects criticalFieldKeys: an out-of-scope required field missing does not block", () => {
      const result = evaluateReadiness(base({
        fieldConfidences: { vendor: 0.95 },
        requiredFieldKeys: ["vendor", "invoice_number"],
        criticalFieldKeys: ["vendor"],
      }))
      expect(result.status).toBe("ready")
    })

    it("still blocks a required field missing when it IS in criticalFieldKeys", () => {
      const result = evaluateReadiness(base({
        fieldConfidences: { vendor: 0.95 },
        requiredFieldKeys: ["vendor", "invoice_number"],
        criticalFieldKeys: ["vendor", "invoice_number"],
      }))
      expect(result.status).toBe("blocked")
      expect(result.blockers[0].code).toBe("missing_required_field:invoice_number")
    })
  })

  describe("check results", () => {
    it("blocks on failed check", () => {
      const result = evaluateReadiness(base({ checkResults: [{ checkCode: "invoice_arithmetic", status: "fail" }] }))
      expect(result.status).toBe("blocked")
      expect(result.blockers.some((b) => b.code === "check_failed")).toBe(true)
    })

    it("ignores warn checks when blockOnWarnChecks is false", () => {
      const result = evaluateReadiness(base({ checkResults: [{ checkCode: "tax_consistency", status: "warn" }] }))
      expect(result.status).toBe("ready")
    })

    it("blocks on warn checks when blockOnWarnChecks is true", () => {
      const result = evaluateReadiness(base({
        checkResults: [{ checkCode: "tax_consistency", status: "warn" }],
        blockOnWarnChecks: true,
      }))
      expect(result.status).toBe("blocked")
      expect(result.blockers.some((b) => b.code === "check_warned")).toBe(true)
    })

    it("passes on pass checks", () => {
      const result = evaluateReadiness(base({ checkResults: [{ checkCode: "invoice_arithmetic", status: "pass" }] }))
      expect(result.status).toBe("ready")
    })
  })

  describe("duplicate detection", () => {
    it("blocks on duplicate fail check", () => {
      const result = evaluateReadiness(base({ checkResults: [{ checkCode: "duplicate", status: "fail" }] }))
      expect(result.status).toBe("blocked")
      const codes = result.blockers.map((b) => b.code)
      expect(codes).toContain("duplicate")
      expect(codes).toContain("check_failed")
    })

    it("does not add duplicate blocker for duplicate warn", () => {
      const result = evaluateReadiness(base({ checkResults: [{ checkCode: "duplicate", status: "warn" }] }))
      expect(result.blockers.some((b) => b.code === "duplicate")).toBe(false)
    })
  })

  describe("rule matching", () => {
    it("blocks when no rule matched and active rules exist", () => {
      const result = evaluateReadiness(base({ appliedRuleId: null, hasActiveRules: true }))
      expect(result.status).toBe("blocked")
      expect(result.blockers.some((b) => b.code === "no_rule_match")).toBe(true)
    })

    it("does not block when no rule matched and no active rules exist", () => {
      const result = evaluateReadiness(base({ appliedRuleId: null, hasActiveRules: false }))
      expect(result.status).toBe("ready")
    })

    it("does not block when a rule matched", () => {
      const result = evaluateReadiness(base({ appliedRuleId: "rule-1", hasActiveRules: true }))
      expect(result.blockers.some((b) => b.code === "no_rule_match")).toBe(false)
    })
  })

  describe("review tasks", () => {
    it("blocks on open review task", () => {
      const result = evaluateReadiness(base({ hasOpenReviewTask: true }))
      expect(result.status).toBe("blocked")
      expect(result.blockers.some((b) => b.code === "open_review_task")).toBe(true)
    })
  })

  describe("policy verdict", () => {
    it("does not block when policy is disabled", () => {
      const result = evaluateReadiness(base({ policyVerdict: "disabled" }))
      expect(result.status).toBe("ready")
    })

    it("does not block when policy passes", () => {
      const result = evaluateReadiness(base({ policyVerdict: "pass" }))
      expect(result.status).toBe("ready")
    })

    it("blocks on policy violation", () => {
      const result = evaluateReadiness(base({ policyVerdict: "violation" }))
      expect(result.status).toBe("blocked")
      expect(result.blockers.some((b) => b.code === "policy_violation")).toBe(true)
    })

    it("blocks on policy error", () => {
      const result = evaluateReadiness(base({ policyVerdict: "error" }))
      expect(result.status).toBe("blocked")
      expect(result.blockers.some((b) => b.code === "policy_error")).toBe(true)
    })
  })

  describe("pushability", () => {
    it("blocks when not pushable", () => {
      const result = evaluateReadiness(base({ isPushable: false }))
      expect(result.status).toBe("blocked")
      expect(result.blockers.some((b) => b.code === "not_pushable")).toBe(true)
    })
  })

  describe("category confirmation", () => {
    it("blocks when pushable but category not confirmed", () => {
      const result = evaluateReadiness(base({ isPushable: true, categoryConfirmed: false }))
      expect(result.status).toBe("blocked")
      expect(result.blockers.some((b) => b.code === "category_unconfirmed")).toBe(true)
    })

    it("does not block when category is confirmed", () => {
      const result = evaluateReadiness(base({ isPushable: true, categoryConfirmed: true }))
      expect(result.blockers.some((b) => b.code === "category_unconfirmed")).toBe(false)
    })

    it("does not block non-pushable documents even if category unconfirmed", () => {
      const result = evaluateReadiness(base({ isPushable: false, categoryConfirmed: false }))
      expect(result.blockers.some((b) => b.code === "category_unconfirmed")).toBe(false)
    })

    it("does not block when categoryConfirmed is undefined (legacy docs)", () => {
      const result = evaluateReadiness(base({ isPushable: true }))
      expect(result.blockers.some((b) => b.code === "category_unconfirmed")).toBe(false)
    })
  })

  describe("multiple blockers", () => {
    it("accumulates all blockers", () => {
      const result = evaluateReadiness(base({
        fieldConfidences: { vendor: 0.50 },
        checkResults: [{ checkCode: "invoice_arithmetic", status: "fail" }],
        hasOpenReviewTask: true,
        policyVerdict: "violation",
        isPushable: false,
      }))
      expect(result.status).toBe("blocked")
      expect(result.blockers.length).toBeGreaterThanOrEqual(5)
      const codes = result.blockers.map((b) => b.code)
      expect(codes).toContain("low_confidence:vendor")
      expect(codes).toContain("check_failed")
      expect(codes).toContain("open_review_task")
      expect(codes).toContain("policy_violation")
      expect(codes).toContain("not_pushable")
    })
  })
})

describe("AI coding fallback", () => {
  const noRule = { appliedRuleId: null, hasActiveRules: true }

  it("blocks no_rule_match when there is no coding source", () => {
    const result = evaluateReadiness(base(noRule))
    expect(result.blockers.map((b) => b.code)).toContain("no_rule_match")
  })

  it("suppresses no_rule_match for manual coding", () => {
    const result = evaluateReadiness(base({ ...noRule, codingSource: "manual" }))
    const codes = result.blockers.map((b) => b.code)
    expect(codes).not.toContain("no_rule_match")
    expect(codes).not.toContain("ai_coding_unconfirmed")
  })

  it("suppresses no_rule_match for AI coding at the threshold", () => {
    const result = evaluateReadiness(base({ ...noRule, codingSource: "ai", codingConfidence: AI_CODING_MIN_CONFIDENCE }))
    const codes = result.blockers.map((b) => b.code)
    expect(codes).not.toContain("no_rule_match")
    expect(codes).not.toContain("ai_coding_unconfirmed")
  })

  it("blocks ai_coding_unconfirmed for AI coding below the threshold", () => {
    const result = evaluateReadiness(base({ ...noRule, codingSource: "ai", codingConfidence: 0.89 }))
    const codes = result.blockers.map((b) => b.code)
    expect(codes).toContain("ai_coding_unconfirmed")
    expect(codes).not.toContain("no_rule_match")
  })

  it("treats AI coding with null confidence as zero", () => {
    const result = evaluateReadiness(base({ ...noRule, codingSource: "ai", codingConfidence: null }))
    expect(result.blockers.map((b) => b.code)).toContain("ai_coding_unconfirmed")
  })

  it("ignores coding source entirely when a rule matched", () => {
    const result = evaluateReadiness(base({ codingSource: "ai", codingConfidence: 0.1 }))
    const codes = result.blockers.map((b) => b.code)
    expect(codes).not.toContain("no_rule_match")
    expect(codes).not.toContain("ai_coding_unconfirmed")
  })

  it("pins the threshold at 0.9", () => {
    expect(AI_CODING_MIN_CONFIDENCE).toBe(0.9)
  })
})

describe("isTouchlessEligible", () => {
  it("treats a clean document (no blockers) as eligible", () => {
    expect(isTouchlessEligible([])).toBe(true)
  })

  // The deadlock this exists to break: a cold-started supplier's document cleared every real gate,
  // so it must count toward the supplier's trust even though it still routes to a reviewer.
  it("treats a document held back only by cold start or the QA sample as eligible", () => {
    expect(isTouchlessEligible([{ code: "supplier_cold_start", detail: "" }])).toBe(true)
    expect(isTouchlessEligible([{ code: "qa_sample", detail: "" }])).toBe(true)
    expect(isTouchlessEligible([{ code: "qa_sample", detail: "" }, { code: "supplier_cold_start", detail: "" }])).toBe(true)
  })

  it("does not treat a document with a substantive blocker as eligible", () => {
    expect(isTouchlessEligible([{ code: "low_confidence:vendor", detail: "" }])).toBe(false)
    expect(isTouchlessEligible([{ code: "duplicate", detail: "" }])).toBe(false)
    expect(isTouchlessEligible([{ code: "business_rule_backstop", detail: "" }])).toBe(false)
    // One real blocker alongside a hold-back still disqualifies.
    expect(isTouchlessEligible([{ code: "supplier_cold_start", detail: "" }, { code: "policy_violation", detail: "" }])).toBe(false)
  })
})
