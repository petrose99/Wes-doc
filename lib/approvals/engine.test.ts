import { describe, expect, it } from "vitest"
import { applicableStages, canDecideStage, decideStage, findCurrentStage, type WorkflowStageInput } from "@/lib/approvals/engine"

const stages: WorkflowStageInput[] = [
  { stageIndex: 0, requireOwner: false, name: "First pass" },
  { stageIndex: 1, requireOwner: true, name: "Owner sign-off" },
  { stageIndex: 2, requireOwner: false, name: "Final check" },
]

describe("decideStage", () => {
  it("advances to the next stage on approval when stages remain", () => {
    expect(decideStage({ stages, currentStageIndex: 0, decision: "approve" })).toEqual({ outcome: "advance", nextStageIndex: 1 })
  })

  it("resolves as approved once the last stage clears", () => {
    expect(decideStage({ stages, currentStageIndex: 2, decision: "approve" })).toEqual({ outcome: "approved" })
  })

  it("rejects immediately regardless of how many stages remain", () => {
    expect(decideStage({ stages, currentStageIndex: 0, decision: "reject" })).toEqual({ outcome: "rejected" })
    expect(decideStage({ stages, currentStageIndex: 2, decision: "reject" })).toEqual({ outcome: "rejected" })
  })

  it("treats a single-stage workflow's approval as resolving immediately", () => {
    const single: WorkflowStageInput[] = [{ stageIndex: 0, requireOwner: false, name: "Only stage" }]
    expect(decideStage({ stages: single, currentStageIndex: 0, decision: "approve" })).toEqual({ outcome: "approved" })
  })
})

describe("canDecideStage", () => {
  it("lets any role decide a stage that doesn't require an owner", () => {
    expect(canDecideStage({ stage: stages[0], actorRole: "member" })).toBe(true)
    expect(canDecideStage({ stage: stages[0], actorRole: "owner" })).toBe(true)
  })

  it("only lets an owner decide a stage that requires one", () => {
    expect(canDecideStage({ stage: stages[1], actorRole: "member" })).toBe(false)
    expect(canDecideStage({ stage: stages[1], actorRole: "owner" })).toBe(true)
  })
})

describe("findCurrentStage", () => {
  it("finds the stage matching the given index", () => {
    expect(findCurrentStage(stages, 1)).toEqual({ stageIndex: 1, requireOwner: true, name: "Owner sign-off" })
  })

  it("returns null when no stage matches", () => {
    expect(findCurrentStage(stages, 5)).toBeNull()
  })
})

describe("canDecideStage (WP-AP2: named approvers)", () => {
  it("lets a named approver decide, even one that isn't an owner", () => {
    const stage: WorkflowStageInput = { stageIndex: 0, requireOwner: false, name: "Bill review", approverIds: ["u-alice", "u-bob"] }
    expect(canDecideStage({ stage, actorRole: "member", actorId: "u-alice" })).toBe(true)
    expect(canDecideStage({ stage, actorRole: "owner", actorId: "u-carol" })).toBe(false)
  })

  it("blocks a decision when the actor isn't in the named list (regardless of role)", () => {
    const stage: WorkflowStageInput = { stageIndex: 0, requireOwner: false, name: "Bill review", approverIds: ["u-alice"] }
    expect(canDecideStage({ stage, actorRole: "owner", actorId: "u-eve" })).toBe(false)
  })

  it("blocks a named-list stage entirely when no actorId is passed", () => {
    const stage: WorkflowStageInput = { stageIndex: 0, requireOwner: false, name: "Bill review", approverIds: ["u-alice"] }
    expect(canDecideStage({ stage, actorRole: "owner" })).toBe(false)
  })

  it("falls back to role gating when the approver list is empty", () => {
    const stage: WorkflowStageInput = { stageIndex: 0, requireOwner: true, name: "Owner sign-off", approverIds: [] }
    expect(canDecideStage({ stage, actorRole: "member", actorId: "u-x" })).toBe(false)
    expect(canDecideStage({ stage, actorRole: "owner", actorId: "u-x" })).toBe(true)
  })
})

describe("applicableStages (WP-AP2: amount thresholds)", () => {
  const stagesWithThresholds: WorkflowStageInput[] = [
    { stageIndex: 0, requireOwner: false, name: "First pass" },
    { stageIndex: 1, requireOwner: true, name: "Manager (>= $500)", minAmount: 500 },
    { stageIndex: 2, requireOwner: true, name: "Owner (>= $10 000)", minAmount: 10_000 },
  ]

  it("keeps every stage when a bill clears every threshold", () => {
    const filtered = applicableStages(stagesWithThresholds, 25_000)
    expect(filtered.map((s) => s.name)).toEqual(["First pass", "Manager (>= $500)", "Owner (>= $10 000)"])
    expect(filtered.map((s) => s.stageIndex)).toEqual([0, 1, 2])
  })

  it("drops a stage whose threshold the bill doesn't reach", () => {
    const filtered = applicableStages(stagesWithThresholds, 300)
    expect(filtered.map((s) => s.name)).toEqual(["First pass"])
  })

  it("re-numbers stageIndex from 0 in the returned list so decideStage still terminates cleanly", () => {
    const filtered = applicableStages(stagesWithThresholds, 1_000)
    expect(filtered.map((s) => s.stageIndex)).toEqual([0, 1])
    expect(decideStage({ stages: filtered, currentStageIndex: 1, decision: "approve" })).toEqual({ outcome: "approved" })
  })

  it("drops threshold-gated stages when the amount is unknown (fail-closed default)", () => {
    const filtered = applicableStages(stagesWithThresholds, null)
    expect(filtered.map((s) => s.name)).toEqual(["First pass"])
  })
})
