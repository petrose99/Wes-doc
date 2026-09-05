import { describe, expect, it } from "vitest"
import { buildInputHash, buildSystemPrompt, verdictSchema } from "./policy-agent"

describe("policy-agent", () => {
  describe("verdictSchema", () => {
    it("accepts a valid approve verdict", () => {
      const result = verdictSchema.safeParse({ decision: "approve", reasons: ["All amounts within policy limits."] })
      expect(result.success).toBe(true)
    })

    it("accepts a valid reject verdict", () => {
      const result = verdictSchema.safeParse({ decision: "reject", reasons: ["Total exceeds $10,000 limit.", "Missing approval code."] })
      expect(result.success).toBe(true)
    })

    it("accepts a valid escalate verdict", () => {
      const result = verdictSchema.safeParse({ decision: "escalate", reasons: ["Unusual vendor."] })
      expect(result.success).toBe(true)
    })

    it("rejects an unknown decision", () => {
      const result = verdictSchema.safeParse({ decision: "maybe", reasons: [] })
      expect(result.success).toBe(false)
    })

    it("rejects missing reasons", () => {
      const result = verdictSchema.safeParse({ decision: "approve" })
      expect(result.success).toBe(false)
    })

    it("accepts empty reasons array", () => {
      const result = verdictSchema.safeParse({ decision: "approve", reasons: [] })
      expect(result.success).toBe(true)
    })
  })

  describe("buildInputHash", () => {
    it("produces a stable hash for identical inputs", () => {
      const input = {
        workspaceId: "ws-1",
        documentId: "doc-1",
        documentData: { vendor: "Acme", total: 100 },
        templateCode: "expense",
        policyText: "All expenses must be under $500.",
      }
      const hash1 = buildInputHash(input)
      const hash2 = buildInputHash(input)
      expect(hash1).toBe(hash2)
      expect(hash1).toHaveLength(64)
    })

    it("produces different hashes for different data", () => {
      const base = {
        workspaceId: "ws-1",
        documentId: "doc-1",
        documentData: { vendor: "Acme", total: 100 },
        templateCode: "expense",
        policyText: "All expenses must be under $500.",
      }
      const modified = { ...base, documentData: { vendor: "Acme", total: 200 } }
      expect(buildInputHash(base)).not.toBe(buildInputHash(modified))
    })

    it("ignores workspaceId and documentId in the hash", () => {
      const base = {
        workspaceId: "ws-1",
        documentId: "doc-1",
        documentData: { vendor: "Acme" },
        templateCode: "expense",
        policyText: "policy",
      }
      const differentIds = { ...base, workspaceId: "ws-2", documentId: "doc-2" }
      expect(buildInputHash(base)).toBe(buildInputHash(differentIds))
    })
  })

  describe("buildSystemPrompt", () => {
    it("includes the policy text", () => {
      const prompt = buildSystemPrompt("No expenses over $1000.")
      expect(prompt).toContain("No expenses over $1000.")
    })

    it("includes the three decision options", () => {
      const prompt = buildSystemPrompt("test")
      expect(prompt).toContain("approve")
      expect(prompt).toContain("escalate")
      expect(prompt).toContain("reject")
    })
  })
})
