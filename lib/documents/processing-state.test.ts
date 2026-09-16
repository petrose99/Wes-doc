import { describe, expect, it } from "vitest"
import {
  LEDGER_FACT_LABELS,
  PROCESSING_STATES,
  PROCESSING_STATE_LABELS,
  processingState,
  type ProcessingStateInput,
} from "./processing-state"

describe("the one status vocabulary (#258)", () => {
  it("has exactly the five states, in precedence order", () => {
    expect(PROCESSING_STATES).toEqual(["cancelled", "needs_attention", "in_review", "touchless", "approved"])
    expect(Object.keys(PROCESSING_STATE_LABELS)).toEqual(PROCESSING_STATES)
  })

  it("labels match CONTEXT.md, sentence case", () => {
    expect(PROCESSING_STATE_LABELS).toEqual({
      cancelled: "Cancelled",
      needs_attention: "Needs attention",
      in_review: "In review",
      touchless: "Touchless",
      approved: "Approved",
    })
  })

  it("ledger facts read Posted / Paid — never Synced", () => {
    expect(LEDGER_FACT_LABELS).toEqual({ synced: "Posted", paid: "Paid" })
  })

  it("heldBack folds into needs_attention like any other attention cause", () => {
    expect(processingState({ approvalStatus: "approved", blockedByCheck: false, escalated: false, touchless: false, status: "reviewed", heldBack: true })).toBe("needs_attention")
  })
})

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
