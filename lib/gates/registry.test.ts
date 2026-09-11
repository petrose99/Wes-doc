import { describe, expect, it, vi, beforeEach } from "vitest"

vi.mock("next/headers", () => ({
  headers: vi.fn(() => { throw new Error("no request scope") }),
}))

const gateUpsert = vi.fn()
const auditCreate = vi.fn()

vi.mock("@/lib/db", () => ({
  prisma: {
    gate: { upsert: gateUpsert },
    auditEvent: { create: auditCreate },
    // Referenced by writeAuditEvent's hasAuditEventModel check; the presence of `.auditEvent`
    // above is what actually satisfies it, but keeping the surface complete avoids a surprise if
    // another consumer of the mocked prisma is added later.
  },
}))

const { createGateRegistry } = await import("@/lib/gates/registry")
import type { GateRunner, GateContext } from "@/lib/gates/types"

const ctx: GateContext = {
  workspaceId: "w1",
  documentId: "d1",
  document: { id: "d1", workspaceId: "w1", docType: "invoice", fieldSnapshot: {}, receivedAt: new Date() },
}

const rowStub = (over: Partial<Record<string, unknown>> = {}) => ({
  id: "g1", workspaceId: "w1", documentId: "d1", gateType: "duplicate",
  severity: "hard", state: "blocked", firedAt: new Date(), resolvedAt: null,
  resolvedBy: null, overrideReason: null, payload: null, createdAt: new Date(), updatedAt: new Date(),
  ...over,
})

beforeEach(() => {
  gateUpsert.mockReset()
  auditCreate.mockReset()
})

describe("createGateRegistry", () => {
  it("no-ops when no runner is registered — createIngestionItem must be unchanged when this scaffolding lands with no gates yet", async () => {
    const registry = createGateRegistry()
    const rows = await registry.runOnArrival(ctx)
    expect(rows).toEqual([])
    expect(gateUpsert).not.toHaveBeenCalled()
    expect(auditCreate).not.toHaveBeenCalled()
  })

  it("refuses a second runner for the same gateType — the upsert key assumes one runner per type", () => {
    const registry = createGateRegistry()
    registry.register({ gateType: "duplicate", run: () => ({ blocked: false }) })
    expect(() =>
      registry.register({ gateType: "duplicate", run: () => ({ blocked: false }) }),
    ).toThrow(/already registered/)
  })

  it("skips runners that return { blocked: false } — no row, no audit event", async () => {
    const registry = createGateRegistry()
    registry.register({ gateType: "duplicate", run: () => ({ blocked: false }) })
    const rows = await registry.runOnArrival(ctx)
    expect(rows).toEqual([])
    expect(gateUpsert).not.toHaveBeenCalled()
    expect(auditCreate).not.toHaveBeenCalled()
  })

  it("persists one row per blocked verdict and emits gate.blocked with the runner's payload", async () => {
    gateUpsert.mockResolvedValue(rowStub({ payload: { winner: "d2" } }))
    const registry = createGateRegistry()
    const runner: GateRunner = {
      gateType: "duplicate",
      run: () => ({ blocked: true, severity: "hard", payload: { winner: "d2" } }),
    }
    registry.register(runner)
    const rows = await registry.runOnArrival(ctx)
    expect(rows).toHaveLength(1)
    expect(gateUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { documentId_gateType: { documentId: "d1", gateType: "duplicate" } },
      create: expect.objectContaining({ workspaceId: "w1", documentId: "d1", gateType: "duplicate", severity: "hard", state: "blocked" }),
      update: expect.objectContaining({ severity: "hard", state: "blocked", resolvedAt: null, resolvedBy: null, overrideReason: null }),
    }))
    expect(auditCreate).toHaveBeenCalledTimes(1)
    const eventData = auditCreate.mock.calls[0][0].data
    expect(eventData.type).toBe("gate.blocked")
    expect(eventData.subjectType).toBe("gate")
    expect(eventData.subjectId).toBe("g1")
    expect(eventData.payload).toEqual({ gateType: "duplicate", documentId: "d1", severity: "hard", winner: "d2" })
  })

  it("runs every registered runner and collects each blocked row — the six #40 gates share one arrival pass", async () => {
    gateUpsert.mockResolvedValueOnce(rowStub({ id: "g1", gateType: "duplicate" }))
    gateUpsert.mockResolvedValueOnce(rowStub({ id: "g2", gateType: "match", severity: "soft" }))
    const registry = createGateRegistry()
    registry.register({ gateType: "duplicate", run: () => ({ blocked: true, severity: "hard" }) })
    registry.register({ gateType: "trust", run: () => ({ blocked: false }) })
    registry.register({ gateType: "match", run: () => ({ blocked: true, severity: "soft" }) })
    const rows = await registry.runOnArrival(ctx)
    expect(rows.map((r) => r.id)).toEqual(["g1", "g2"])
    expect(auditCreate).toHaveBeenCalledTimes(2)
  })

  it("isolates a throwing runner — the rest of the gates still run rather than the whole ingestion breaking", async () => {
    gateUpsert.mockResolvedValueOnce(rowStub({ id: "g2", gateType: "match", severity: "soft" }))
    const registry = createGateRegistry()
    registry.register({ gateType: "duplicate", run: () => { throw new Error("boom") } })
    registry.register({ gateType: "match", run: () => ({ blocked: true, severity: "soft" }) })
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const rows = await registry.runOnArrival(ctx)
    expect(rows).toHaveLength(1)
    expect(rows[0].gateType).toBe("match")
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})
