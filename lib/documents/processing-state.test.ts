import { describe, expect, it } from "vitest"
import { processingState, type ProcessingStateInput } from "./processing-state"

function input(overrides: Partial<ProcessingStateInput> = {}): ProcessingStateInput {
  return {
    approvalStatus: "approved",
    blockedByCheck: false,
    escalated: false,
    touchless: false,
    status: "reviewed",
    ...overrides,
  }
}

describe("processingState", () => {
  it("reads cancelled regardless of anything else", () => {
    expect(processingState(input({ approvalStatus: "cancelled", blockedByCheck: true, escalated: true, touchless: true }))).toBe("cancelled")
  })

  it("reads needs_attention when blocked by a check", () => {
    expect(processingState(input({ blockedByCheck: true }))).toBe("needs_attention")
  })

  it("reads needs_attention when an escalation is open", () => {
    expect(processingState(input({ escalated: true }))).toBe("needs_attention")
  })

  it("reads needs_attention when rejected", () => {
    expect(processingState(input({ approvalStatus: "rejected" }))).toBe("needs_attention")
  })

  it("needs_attention outranks in_review — a rejected-then-reopened invoice still needs attention", () => {
    expect(processingState(input({ approvalStatus: "rejected", status: "needs_review" }))).toBe("needs_attention")
  })

  it("reads in_review for an open ReviewTask", () => {
    expect(processingState(input({ approvalStatus: "not_started", status: "reviewed" }))).toBe("in_review")
    expect(processingState(input({ approvalStatus: "in_progress", status: "reviewed" }))).toBe("in_review")
  })

  it("reads in_review for a document nobody has reviewed yet, even with no ReviewTask", () => {
    expect(processingState(input({ approvalStatus: "approved", status: "needs_review" }))).toBe("in_review")
    expect(processingState(input({ approvalStatus: "approved", status: "ready_for_review" }))).toBe("in_review")
  })

  it("reads touchless once reviewed, unblocked, and pushed with no human review", () => {
    expect(processingState(input({ touchless: true }))).toBe("touchless")
  })

  it("reads approved once reviewed, unblocked, and not touchless", () => {
    expect(processingState(input())).toBe("approved")
  })
})
