import { describe, expect, it } from "vitest"
import { buildFieldRationales, type RationaleInput } from "./rationale"

function base(overrides: Partial<RationaleInput> = {}): RationaleInput {
  return {
    codingData: null,
    appliedRuleId: null,
    appliedRuleName: null,
    fieldConfidences: { vendor: 0.95, total: 0.88 },
    provenance: { fields: { vendor: { quote: "Acme Corp", page: 1 }, total: { quote: "$1,234.00", page: 1 } } },
    fewShotExamples: [],
    fieldKeys: ["vendor", "total"],
    ...overrides,
  }
}

describe("buildFieldRationales", () => {
  it("attributes extraction source when no rule and no few-shot", () => {
    const result = buildFieldRationales(base())
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({
      fieldKey: "vendor",
      source: "extraction",
      ruleId: null,
      ruleName: null,
      correctionExample: null,
      provenanceQuote: "Acme Corp",
      confidence: 0.95,
    })
  })

  it("attributes rule source for fields in codingData", () => {
    const result = buildFieldRationales(base({
      codingData: { account: "6100", taxCode: "GST" },
      appliedRuleId: "rule-1",
      appliedRuleName: "Acme rule",
      fieldKeys: ["vendor", "account", "taxCode"],
    }))
    const account = result.find((r) => r.fieldKey === "account")!
    expect(account.source).toBe("rule")
    expect(account.ruleId).toBe("rule-1")
    expect(account.ruleName).toBe("Acme rule")
    const vendor = result.find((r) => r.fieldKey === "vendor")!
    expect(vendor.source).toBe("extraction")
  })

  it("attributes few_shot source when correction exists for field", () => {
    const result = buildFieldRationales(base({
      fewShotExamples: [{ fieldKey: "vendor", wrongValue: "ACME", correctedValue: "Acme Corp" }],
    }))
    const vendor = result.find((r) => r.fieldKey === "vendor")!
    expect(vendor.source).toBe("few_shot")
    expect(vendor.correctionExample).toEqual({ fieldKey: "vendor", wrongValue: "ACME", correctedValue: "Acme Corp" })
    expect(vendor.provenanceQuote).toBe("Acme Corp")
  })

  it("rule source takes priority over few_shot", () => {
    const result = buildFieldRationales(base({
      codingData: { vendor: "Acme Corp" },
      appliedRuleId: "rule-1",
      appliedRuleName: "Acme rule",
      fewShotExamples: [{ fieldKey: "vendor", wrongValue: "ACME", correctedValue: "Acme Corp" }],
    }))
    const vendor = result.find((r) => r.fieldKey === "vendor")!
    expect(vendor.source).toBe("rule")
  })

  it("handles null provenance gracefully", () => {
    const result = buildFieldRationales(base({ provenance: null }))
    expect(result[0].provenanceQuote).toBeNull()
  })

  it("handles null fieldConfidences gracefully", () => {
    const result = buildFieldRationales(base({ fieldConfidences: null }))
    expect(result[0].confidence).toBeNull()
  })

  it("uses first few-shot example per field", () => {
    const result = buildFieldRationales(base({
      fewShotExamples: [
        { fieldKey: "vendor", wrongValue: "A", correctedValue: "B" },
        { fieldKey: "vendor", wrongValue: "C", correctedValue: "D" },
      ],
    }))
    const vendor = result.find((r) => r.fieldKey === "vendor")!
    expect(vendor.correctionExample?.wrongValue).toBe("A")
  })
})

describe("AI coding source", () => {
  it("attributes ai source with confidence and rationale for coded fields", () => {
    const result = buildFieldRationales(base({
      codingData: { account: "6100" },
      codingSource: "ai",
      codingConfidence: 0.72,
      aiRationale: "Similar to Beta Ltd invoices",
      fieldKeys: ["vendor", "account"],
    }))
    const account = result.find((r) => r.fieldKey === "account")!
    expect(account.source).toBe("ai")
    expect(account.confidence).toBe(0.72)
    expect(account.aiRationale).toBe("Similar to Beta Ltd invoices")
    expect(result.find((r) => r.fieldKey === "vendor")!.source).toBe("extraction")
  })

  it("keeps rule attribution when codingSource is not ai", () => {
    const result = buildFieldRationales(base({
      codingData: { account: "6100" },
      appliedRuleId: "rule-1",
      appliedRuleName: "Acme rule",
      codingSource: "rule",
      fieldKeys: ["account"],
    }))
    expect(result[0].source).toBe("rule")
    expect(result[0].ruleName).toBe("Acme rule")
  })
})
