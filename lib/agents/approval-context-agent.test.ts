import { describe, expect, it } from "vitest"
import { buildApprovalInputHash, buildApprovalSystemPrompt, contextSchema, formatContextAsDetail } from "./approval-context-agent"

describe("approval-context-agent", () => {
  describe("contextSchema", () => {
    it("accepts a valid context", () => {
      const result = contextSchema.safeParse({
        summary: "Document exceeds policy threshold.",
        keyDataPoints: [{ label: "Total", value: "$15,000", concern: "Exceeds $10k limit" }],
        suggestedAction: "reject",
        suggestedActionReason: "Amount is 50% over the auto-approval ceiling.",
      })
      expect(result.success).toBe(true)
    })

    it("accepts empty keyDataPoints", () => {
      const result = contextSchema.safeParse({
        summary: "Flagged for review.",
        keyDataPoints: [],
        suggestedAction: "approve",
        suggestedActionReason: "Borderline but within tolerance.",
      })
      expect(result.success).toBe(true)
    })

    it("accepts request_more_info action", () => {
      const result = contextSchema.safeParse({
        summary: "Vendor not recognized.",
        keyDataPoints: [],
        suggestedAction: "request_more_info",
        suggestedActionReason: "Unknown vendor — confirm with submitter.",
      })
      expect(result.success).toBe(true)
    })

    it("rejects missing summary", () => {
      const result = contextSchema.safeParse({
        keyDataPoints: [],
        suggestedAction: "approve",
        suggestedActionReason: "Fine.",
      })
      expect(result.success).toBe(false)
    })

    it("rejects unknown action", () => {
      const result = contextSchema.safeParse({
        summary: "test",
        keyDataPoints: [],
        suggestedAction: "defer",
        suggestedActionReason: "test",
      })
      expect(result.success).toBe(false)
    })
  })

  describe("formatContextAsDetail", () => {
    it("formats a context with data points into readable text", () => {
      const detail = formatContextAsDetail({
        summary: "Invoice total exceeds limit.",
        keyDataPoints: [
          { label: "Total", value: "$15,000", concern: "Over $10k ceiling" },
          { label: "Vendor", value: "Acme Corp" },
        ],
        suggestedAction: "reject",
        suggestedActionReason: "Amount is well above the auto-approval ceiling.",
      })
      expect(detail).toContain("Policy review: Invoice total exceeds limit.")
      expect(detail).toContain("Total: $15,000 — Over $10k ceiling")
      expect(detail).toContain("Vendor: Acme Corp")
      expect(detail).toContain("Suggested action: reject")
      expect(detail).not.toContain("undefined")
    })

    it("formats context without data points", () => {
      const detail = formatContextAsDetail({
        summary: "All good.",
        keyDataPoints: [],
        suggestedAction: "approve",
        suggestedActionReason: "Within policy.",
      })
      expect(detail).toContain("Policy review: All good.")
      expect(detail).toContain("Suggested action: approve")
      expect(detail).not.toContain("Key data points")
    })

    it("replaces underscores in action name", () => {
      const detail = formatContextAsDetail({
        summary: "test",
        keyDataPoints: [],
        suggestedAction: "request_more_info",
        suggestedActionReason: "Need clarification.",
      })
      expect(detail).toContain("request more info")
    })
  })

  describe("buildApprovalInputHash", () => {
    it("produces stable hashes", () => {
      const input = {
        workspaceId: "ws-1",
        documentId: "doc-1",
        documentData: { vendor: "Acme", total: 100 },
        templateCode: "expense",
        policyViolationReasons: ["Over limit"],
        policyText: "Max $500.",
      }
      expect(buildApprovalInputHash(input)).toBe(buildApprovalInputHash(input))
      expect(buildApprovalInputHash(input)).toHaveLength(64)
    })

    it("ignores workspaceId and documentId", () => {
      const base = {
        workspaceId: "ws-1",
        documentId: "doc-1",
        documentData: { vendor: "Acme" },
        templateCode: "expense",
        policyViolationReasons: ["test"],
        policyText: "policy",
      }
      const different = { ...base, workspaceId: "ws-2", documentId: "doc-2" }
      expect(buildApprovalInputHash(base)).toBe(buildApprovalInputHash(different))
    })
  })

  describe("buildApprovalSystemPrompt", () => {
    it("includes the policy text", () => {
      const prompt = buildApprovalSystemPrompt("No single expense over $1000.")
      expect(prompt).toContain("No single expense over $1000.")
    })

    it("mentions escalation context", () => {
      const prompt = buildApprovalSystemPrompt("test")
      expect(prompt).toContain("escalated")
    })
  })
})
