import { describe, expect, it, vi, beforeEach } from "vitest"

vi.mock("next/headers", () => ({
  headers: vi.fn(() => { throw new Error("no request scope") }),
}))

const findUnique = vi.fn()
const update = vi.fn()
const auditCreate = vi.fn()

vi.mock("@/lib/db", () => ({
  prisma: {
    gate: { findUnique, update },
    auditEvent: { create: auditCreate },
  },
}))

const { overrideGate, resolveGate, GateNotFoundError } = await import("@/lib/gates/actions")

const rowStub = (over: Partial<Record<string, unknown>> = {}) => ({
  id: "g1", workspaceId: "w1", documentId: "d1", gateType: "duplicate",
  severity: "hard", state: "blocked", firedAt: new Date(), resolvedAt: null,
  resolvedBy: null, overrideReason: null, payload: null, createdAt: new Date(), updatedAt: new Date(),
  ...over,
})

beforeEach(() => {
  findUnique.mockReset()
  update.mockReset()
  auditCreate.mockReset()
})

describe("overrideGate", () => {
  it("transitions blocked → overridden and emits gate.overridden with the reason", async () => {
    findUnique.mockResolvedValue(rowStub())
    update.mockResolvedValue(rowStub({ state: "overridden", resolvedBy: "u1", overrideReason: "known dup, keeping both" }))
    const gate = await overrideGate({ gateId: "g1", actorId: "u1", reason: "known dup, keeping both" })
    expect(gate.state).toBe("overridden")
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "g1" },
      data: expect.objectContaining({ state: "overridden", resolvedBy: "u1", overrideReason: "known dup, keeping both" }),
    }))
    const event = auditCreate.mock.calls[0][0].data
    expect(event.type).toBe("gate.overridden")
    expect(event.actorId).toBe("u1")
    expect(event.payload).toEqual({ gateType: "duplicate", documentId: "d1", reason: "known dup, keeping both" })
  })

  it("throws GateNotFoundError when the id doesn't resolve — the caller can distinguish 404 from a real failure", async () => {
    findUnique.mockResolvedValue(null)
    await expect(overrideGate({ gateId: "missing", actorId: "u1", reason: "…" })).rejects.toBeInstanceOf(GateNotFoundError)
  })
})

describe("resolveGate", () => {
  it("transitions blocked → resolved and emits gate.resolved with a null actor when it's a system auto-resolve", async () => {
    findUnique.mockResolvedValue(rowStub())
    update.mockResolvedValue(rowStub({ state: "resolved", resolvedBy: null }))
    const gate = await resolveGate({ gateId: "g1", actorId: null, reason: "winner deleted" })
    expect(gate.state).toBe("resolved")
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "g1" },
      data: expect.objectContaining({ state: "resolved", resolvedBy: null, overrideReason: "winner deleted" }),
    }))
    const event = auditCreate.mock.calls[0][0].data
    expect(event.type).toBe("gate.resolved")
    expect(event.actorId).toBeNull()
    expect(event.payload).toEqual({ gateType: "duplicate", documentId: "d1", reason: "winner deleted" })
  })

  it("short-circuits an already-resolved gate — no second update, no second audit row", async () => {
    findUnique.mockResolvedValue(rowStub({ state: "resolved", resolvedAt: new Date() }))
    const gate = await resolveGate({ gateId: "g1" })
    expect(gate.state).toBe("resolved")
    expect(update).not.toHaveBeenCalled()
    expect(auditCreate).not.toHaveBeenCalled()
  })

  it("throws GateNotFoundError when the id doesn't resolve", async () => {
    findUnique.mockResolvedValue(null)
    await expect(resolveGate({ gateId: "missing" })).rejects.toBeInstanceOf(GateNotFoundError)
  })
})
