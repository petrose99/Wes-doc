import { describe, expect, it } from "vitest"
import { attachFailuresCheck, pushFailuresCheck } from "@/lib/health/checks/push-failures"
import type { CheckAttachSlice, CheckContext, CheckPushSlice } from "@/lib/health/types"

const now = new Date("2026-09-02T00:00:00.000Z")

function push(overrides: Partial<CheckPushSlice>): CheckPushSlice {
  return { id: "p1", documentId: "d1", status: "failed", attempts: 5, errorCode: "auth_expired", updatedAt: now, ...overrides }
}

function attach(overrides: Partial<CheckAttachSlice>): CheckAttachSlice {
  return { id: "a1", documentId: "d1", status: "failed", attempts: 5, errorCode: "attach_bill_gone", updatedAt: now, ...overrides }
}

function baseCtx(overrides: Partial<CheckContext> = {}): CheckContext {
  return {
    workspaceId: "ws1", dateRange: { from: now, to: now }, ledger: null,
    documents: [], reviewTasks: [], pushHistory: [], attachHistory: [], automationRules: [], checkResults: [],
    confidenceDrift: [], lowConfidenceFields: [], bankStatements: [],
    ...overrides,
  }
}

describe("pushFailuresCheck", () => {
  it("passes when nothing has failed with enough attempts", () => {
    const result = pushFailuresCheck.run(baseCtx({ pushHistory: [push({ attempts: 2 })] }))
    expect(result.findings).toHaveLength(0)
    expect(result.applicableCount).toBe(1)
  })

  it("ignores a failed push under the attempt threshold", () => {
    const result = pushFailuresCheck.run(baseCtx({ pushHistory: [push({ status: "failed", attempts: 4 })] }))
    expect(result.findings).toHaveLength(0)
  })

  it("groups failing pushes by errorCode into one finding per group", () => {
    const result = pushFailuresCheck.run(baseCtx({
      pushHistory: [
        push({ id: "p1", documentId: "d1", errorCode: "auth_expired" }),
        push({ id: "p2", documentId: "d2", errorCode: "auth_expired" }),
        push({ id: "p3", documentId: "d3", errorCode: "rate_limited" }),
      ],
    }))
    expect(result.findings).toHaveLength(2)
    const authGroup = result.findings.find((f) => f.title.includes("auth_expired"))
    expect(authGroup?.affectedCount).toBe(2)
  })

  it("picks the most recently updated push in a group as the representative document", () => {
    const older = push({ id: "p1", documentId: "d1", updatedAt: new Date(now.getTime() - 60_000) })
    const newer = push({ id: "p2", documentId: "d2", updatedAt: now })
    const result = pushFailuresCheck.run(baseCtx({ pushHistory: [older, newer] }))
    expect(result.findings[0].documentId).toBe("d2")
  })
})

describe("attachFailuresCheck", () => {
  it("maps a known errorCode to a user-facing sentence instead of the raw code", () => {
    const result = attachFailuresCheck.run(baseCtx({ attachHistory: [attach({ errorCode: "attach_bill_gone" })] }))
    expect(result.findings[0].description).toContain("the posted bill no longer exists in the ledger")
    expect(result.findings[0].description).not.toContain("attach_bill_gone")
  })

  it("falls back to a humanized code for an unmapped (transient) errorCode", () => {
    const result = attachFailuresCheck.run(baseCtx({ attachHistory: [attach({ errorCode: "http_503" })] }))
    expect(result.findings[0].description).toContain("http 503")
  })
})
