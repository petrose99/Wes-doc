import { describe, expect, it } from "vitest"
import { fieldRationale, type RationaleInput } from "./rationale"

const base = (): RationaleInput => ({
  fieldKey: "account",
  codingKeys: ["account", "taxCode"],
  codingSource: null,
  codingConfidence: null,
  aiRationale: null,
  hasRuleMatch: false,
})

describe("fieldRationale", () => {
  it("returns extraction source for non-coding fields", () => {
    const result = fieldRationale({ ...base(), fieldKey: "vendor" })
    expect(result.source).toBe("extraction")
  })

  it("returns ai source with confidence and rationale when codingSource is ai", () => {
    const result = fieldRationale({ ...base(), codingSource: "ai", codingConfidence: 0.85, aiRationale: "Pattern match" })
    expect(result.source).toBe("ai")
    expect(result.confidence).toBe(0.85)
    expect(result.rationale).toBe("Pattern match")
  })

  it("returns manual source when codingSource is manual", () => {
    const result = fieldRationale({ ...base(), codingSource: "manual" })
    expect(result.source).toBe("manual")
  })

  it("returns rule source when there is a rule match and no explicit coding source", () => {
    const result = fieldRationale({ ...base(), hasRuleMatch: true })
    expect(result.source).toBe("rule")
  })

  it("returns extraction when no coding source and no rule match", () => {
    const result = fieldRationale(base())
    expect(result.source).toBe("extraction")
  })

  it("ai source takes precedence over rule match", () => {
    const result = fieldRationale({ ...base(), codingSource: "ai", codingConfidence: 0.9, hasRuleMatch: true })
    expect(result.source).toBe("ai")
  })
})
