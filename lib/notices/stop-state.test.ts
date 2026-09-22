import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/db", () => ({ prisma: {} }))
vi.mock("@/lib/config", () => ({ default: { aws: { internalWorkerSecret: "test-secret" }, app: { baseURL: "https://app.test" } } }))

const { applyStop, resolveStopPageState } = await import("@/lib/notices/stop-state")
const { signStopToken } = await import("@/lib/notices/stop-token")
const { prisma } = await import("@/lib/db")

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any

beforeEach(() => {
  for (const key of Object.keys(db)) delete db[key]
  db.user = { findUnique: vi.fn().mockResolvedValue({ approvalNoticeEmails: true }), updateMany: vi.fn().mockResolvedValue({ count: 1 }) }
  db.workspace = { findUnique: vi.fn().mockResolvedValue({ name: "Acme" }) }
})

describe("stop page — GET never writes", () => {
  it("renders the confirm state for a valid token and touches no column", async () => {
    const state = await resolveStopPageState(signStopToken("u1", "w1"), false)
    expect(state).toEqual({ kind: "confirm", workspaceId: "w1", workspaceName: "Acme" })
    expect(db.user.updateMany).not.toHaveBeenCalled()
  })
  it("shows already-off when the switch is off", async () => {
    db.user.findUnique.mockResolvedValue({ approvalNoticeEmails: false })
    expect(await resolveStopPageState(signStopToken("u1", "w1"), false)).toEqual({ kind: "already-off", workspaceId: "w1" })
  })
  it("shows invalid for a tampered token, a missing token, and done=1 without a valid token", async () => {
    expect(await resolveStopPageState(signStopToken("u1", "w1") + "x", false)).toEqual({ kind: "invalid" })
    expect(await resolveStopPageState(undefined, false)).toEqual({ kind: "invalid" })
    expect(await resolveStopPageState("nope", true)).toEqual({ kind: "invalid" })
  })
  it("shows done only with a still-valid token", async () => {
    expect(await resolveStopPageState(signStopToken("u1", "w1"), true)).toEqual({ kind: "done", workspaceId: "w1" })
  })
})

describe("stop POST", () => {
  it("flips the column for a valid token", async () => {
    expect(await applyStop(signStopToken("u1", "w1"))).toBe("done")
    expect(db.user.updateMany).toHaveBeenCalledWith({ where: { id: "u1" }, data: { approvalNoticeEmails: false } })
  })
  it("writes nothing for a bad token", async () => {
    expect(await applyStop("bad.token")).toBe("invalid")
    expect(await applyStop(undefined)).toBe("invalid")
    expect(db.user.updateMany).not.toHaveBeenCalled()
  })
})
