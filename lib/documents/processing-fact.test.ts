import { describe, expect, it } from "vitest"
import { daysAgo, processingFact, type ProcessingFactInput } from "./processing-fact"

const NOW = new Date("2026-09-16T10:00:00Z")

function input(overrides: Partial<ProcessingFactInput> = {}): ProcessingFactInput {
  return {
    approvalStatus: "approved",
    blockedByCheck: false,
    escalated: false,
    touchless: false,
    status: "reviewed",
    now: NOW,
    ...overrides,
  }
}

describe("daysAgo", () => {
  it("floors whole days and never goes negative", () => {
    expect(daysAgo(new Date("2026-09-16T01:00:00Z"), NOW)).toBe(0)
    expect(daysAgo(new Date("2026-09-15T09:00:00Z"), NOW)).toBe(1)
    expect(daysAgo(new Date("2026-09-10T10:00:00Z"), NOW)).toBe(6)
    expect(daysAgo(new Date("2026-09-17T10:00:00Z"), NOW)).toBe(0)
  })
})

describe("processingFact — spec §1.2, every row and degrade step", () => {
  it("Approved: by actor · date → date → word alone", () => {
    const at = new Date("2026-09-12T14:02:00Z")
    expect(processingFact(input({ approvedBy: { actorName: "Nadia K.", at } })).detail).toBe("by Nadia K. · Sep 12, 2026")
    expect(processingFact(input({ approvedBy: { actorName: null, at } })).detail).toBe("Sep 12, 2026")
    const bare = processingFact(input())
    expect(bare.state).toBe("approved")
    expect(bare.detail).toBe("")
  })

  it("In review: opened today / yesterday / N days ago", () => {
    const base = { approvalStatus: "in_progress" as const }
    expect(processingFact(input({ ...base, reviewTaskOpenedAt: new Date("2026-09-16T08:00:00Z") })).detail).toBe("opened today")
    expect(processingFact(input({ ...base, reviewTaskOpenedAt: new Date("2026-09-15T08:00:00Z") })).detail).toBe("opened yesterday")
    expect(processingFact(input({ ...base, reviewTaskOpenedAt: new Date("2026-09-13T08:00:00Z") })).detail).toBe("opened 3 days ago")
  })

  it("In review: opened ‹date› once 14 days or older", () => {
    const fact = processingFact(input({ approvalStatus: "in_progress", reviewTaskOpenedAt: new Date("2026-09-02T10:00:00Z") }))
    expect(fact.detail).toBe("opened Sep 2, 2026")
  })

  it("In review: received ‹date› when there is no ReviewTask, then the word alone", () => {
    expect(processingFact(input({ status: "needs_review", receivedAt: new Date("2026-09-01T10:00:00Z") })).detail).toBe("received Sep 1, 2026")
    const bare = processingFact(input({ status: "needs_review" }))
    expect(bare.state).toBe("in_review")
    expect(bare.detail).toBe("")
  })

  it("Needs attention: rejected by actor → rejected", () => {
    expect(processingFact(input({ approvalStatus: "rejected", rejectedBy: "Sam R." })).detail).toBe("rejected by Sam R.")
    expect(processingFact(input({ approvalStatus: "rejected" })).detail).toBe("rejected")
  })

  it("Needs attention: rejected outranks escalation, escalation outranks checks, checks outrank held back", () => {
    expect(processingFact(input({ approvalStatus: "rejected", escalated: true, openCheckCodes: ["a"] })).detail).toBe("rejected")
    expect(processingFact(input({ escalated: true, blockedByCheck: true, openCheckCodes: ["a"] })).detail).toBe("escalation open")
    expect(processingFact(input({ blockedByCheck: true, openCheckCodes: ["a"], heldBack: true })).detail).toBe("1 open check")
    expect(processingFact(input({ blockedByCheck: true, openCheckCodes: ["a", "b"] })).detail).toBe("2 open checks")
    expect(processingFact(input({ heldBack: true })).detail).toBe("held back from a bulk approve")
  })

  it("Needs attention: blocked by a check with no codes degrades to the word alone", () => {
    const fact = processingFact(input({ blockedByCheck: true }))
    expect(fact.state).toBe("needs_attention")
    expect(fact.detail).toBe("")
  })

  it("Touchless: constant", () => {
    expect(processingFact(input({ touchless: true })).detail).toBe("sent automatically")
  })

  it("Cancelled: reason → word alone", () => {
    expect(processingFact(input({ approvalStatus: "cancelled", cancelledReason: "Duplicate of INV-12" })).detail).toBe("Duplicate of INV-12")
    expect(processingFact(input({ approvalStatus: "cancelled" })).detail).toBe("")
  })

  it("a Save that did not approve stays In review even with an approvedBy event", () => {
    const fact = processingFact(input({ status: "needs_review", approvedBy: { actorName: "Nadia K.", at: NOW } }))
    expect(fact.state).toBe("in_review")
  })

  it("carries its input so an upgrade re-runs the same function", () => {
    const first = processingFact(input())
    const upgraded = processingFact({ ...first.input, approvedBy: { actorName: "Nadia K.", at: NOW } })
    expect(upgraded.detail).toBe("by Nadia K. · Sep 16, 2026")
  })
})
