import { describe, expect, it } from "vitest"
import { computeApprovalEligibility, stageHasEligibleApprover } from "./row-eligibility"

describe("computeApprovalEligibility", () => {
  it("reads ready when nothing is wrong", () => {
    expect(computeApprovalEligibility({ hasOpenException: false, hasBlockedHardGate: false, approverStillValid: true })).toEqual({ status: "ready" })
  })

  it("reads not_eligible with a reason when a hard gate is blocked", () => {
    expect(computeApprovalEligibility({ hasOpenException: false, hasBlockedHardGate: true, approverStillValid: true }))
      .toEqual({ status: "not_eligible", reason: "A hard check failed on this invoice." })
  })

  it("reads not_eligible with a reason when an exception is open", () => {
    expect(computeApprovalEligibility({ hasOpenException: true, hasBlockedHardGate: false, approverStillValid: true }))
      .toEqual({ status: "not_eligible", reason: "An exception is open on this invoice." })
  })

  it("a hard gate takes precedence over an open exception when both are true", () => {
    const result = computeApprovalEligibility({ hasOpenException: true, hasBlockedHardGate: true, approverStillValid: true })
    expect(result).toEqual({ status: "not_eligible", reason: "A hard check failed on this invoice." })
  })

  it("no_approver outranks everything else — nobody can act on it regardless of checks", () => {
    expect(computeApprovalEligibility({ hasOpenException: true, hasBlockedHardGate: true, approverStillValid: false }))
      .toEqual({ status: "no_approver" })
  })
})

describe("stageHasEligibleApprover", () => {
  const members = new Set(["u1", "u2"])

  it("named approvers: eligible when at least one named approver is still a member", () => {
    expect(stageHasEligibleApprover({ requireOwner: false, approverIds: ["u9", "u1"] }, members, true)).toBe(true)
  })

  it("named approvers: ineligible when none of them are still members", () => {
    expect(stageHasEligibleApprover({ requireOwner: false, approverIds: ["u9", "u8"] }, members, true)).toBe(false)
  })

  it("role-only, owner required: eligible only when an owner is still a member", () => {
    expect(stageHasEligibleApprover({ requireOwner: true }, members, true)).toBe(true)
    expect(stageHasEligibleApprover({ requireOwner: true }, members, false)).toBe(false)
  })

  it("role-only, any member: eligible as long as the workspace has any member at all", () => {
    expect(stageHasEligibleApprover({ requireOwner: false }, members, false)).toBe(true)
    expect(stageHasEligibleApprover({ requireOwner: false }, new Set(), false)).toBe(false)
  })
})
