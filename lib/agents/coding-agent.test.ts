import { describe, expect, it } from "vitest"
import { buildInputHash, buildSystemPrompt, suggestionSchema } from "./coding-agent"
import type { CodingAgentInput } from "./coding-agent"

const baseInput = (): CodingAgentInput => ({
  workspaceId: "ws-1",
  documentId: "doc-1",
  templateCode: "invoice",
  supplier: "Acme Corp",
  documentData: { vendor: "Acme Corp", total: 1500 },
  codingKeys: ["account", "taxCode"],
  exemplarRules: [{ supplier: "Beta Ltd", coding: { account: "6000", taxCode: "T1" } }],
  corrections: [],
})

describe("suggestionSchema", () => {
  it("accepts valid entries with confidence and rationale", () => {
    const result = suggestionSchema.safeParse({
      entries: [{ key: "account", value: "6000" }],
      confidence: 0.85,
      rationale: "Matched pattern from similar supplier",
    })
    expect(result.success).toBe(true)
  })

  it("rejects confidence outside 0–1", () => {
    expect(suggestionSchema.safeParse({ entries: [], confidence: 1.5, rationale: "x" }).success).toBe(false)
    expect(suggestionSchema.safeParse({ entries: [], confidence: -0.1, rationale: "x" }).success).toBe(false)
  })

  it("rejects more than 10 entries", () => {
    const entries = Array.from({ length: 11 }, (_, i) => ({ key: `k${i}`, value: `v${i}` }))
    expect(suggestionSchema.safeParse({ entries, confidence: 0.5, rationale: "x" }).success).toBe(false)
  })

  it("rejects overly long rationale", () => {
    const result = suggestionSchema.safeParse({ entries: [], confidence: 0.5, rationale: "x".repeat(501) })
    expect(result.success).toBe(false)
  })
})

describe("buildInputHash", () => {
  it("is stable for identical semantic inputs", () => {
    const a = buildInputHash(baseInput())
    const b = buildInputHash(baseInput())
    expect(a).toBe(b)
  })

  it("is not affected by document/workspace ids", () => {
    const a = buildInputHash(baseInput())
    const b = buildInputHash({ ...baseInput(), workspaceId: "ws-other", documentId: "doc-other" })
    expect(a).toBe(b)
  })

  it("changes when corrections are added", () => {
    const a = buildInputHash(baseInput())
    const b = buildInputHash({ ...baseInput(), corrections: [{ codingKey: "account", wrongValue: "6000", correctedValue: "7000" }] })
    expect(a).not.toBe(b)
  })

  it("changes when codingKeys differ", () => {
    const a = buildInputHash(baseInput())
    const b = buildInputHash({ ...baseInput(), codingKeys: ["account"] })
    expect(a).not.toBe(b)
  })

  it("is order-insensitive on codingKeys", () => {
    const a = buildInputHash({ ...baseInput(), codingKeys: ["account", "taxCode"] })
    const b = buildInputHash({ ...baseInput(), codingKeys: ["taxCode", "account"] })
    expect(a).toBe(b)
  })
})

describe("buildSystemPrompt", () => {
  it("includes the coding keys", () => {
    const prompt = buildSystemPrompt(baseInput())
    expect(prompt).toContain("account")
    expect(prompt).toContain("taxCode")
  })

  it("includes exemplar rules", () => {
    const prompt = buildSystemPrompt(baseInput())
    expect(prompt).toContain("Beta Ltd")
    expect(prompt).toContain("6000")
  })

  it("includes corrections when present", () => {
    const input = { ...baseInput(), corrections: [{ codingKey: "account", wrongValue: "6000", correctedValue: "7000" }] }
    const prompt = buildSystemPrompt(input)
    expect(prompt).toContain("Past corrections")
    expect(prompt).toContain("7000")
  })

  it("omits corrections section when empty", () => {
    const prompt = buildSystemPrompt(baseInput())
    expect(prompt).not.toContain("Past corrections")
  })
})
