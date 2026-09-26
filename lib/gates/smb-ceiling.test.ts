import { describe, expect, it, vi, beforeEach } from "vitest"

vi.mock("next/headers", () => ({
  headers: vi.fn(() => { throw new Error("no request scope") }),
}))

const gateFindUnique = vi.fn()
const gateFindMany = vi.fn()
const gateUpdate = vi.fn()
const gateUpsert = vi.fn()
const documentFindMany = vi.fn()
const workspaceFindUnique = vi.fn()
const auditCreate = vi.fn()

vi.mock("@/lib/db", () => ({
  prisma: {
    gate: {
      findUnique: gateFindUnique,
      findMany: gateFindMany,
      update: gateUpdate,
      upsert: gateUpsert,
    },
    document: { findMany: documentFindMany },
    workspace: { findUnique: workspaceFindUnique },
    auditEvent: { create: auditCreate },
  },
}))

// The runner's default wire-up calls getWorkspaceMode; the tests that use the default runner
// need to control that read without a real DB.
const getWorkspaceModeMock = vi.fn()
vi.mock("@/models/workspaces", () => ({
  getWorkspaceMode: (workspaceId: string) => getWorkspaceModeMock(workspaceId),
}))

const {
  createSmbCeilingGateRunner,
  smbCeilingGateRunner,
  resolveOpenSmbCeilingGatesForWorkspace,
  reevaluateOpenSmbCeilingGatesForWorkspace,
  SMB_CEILING_GATE_TYPE,
  SMB_CEILING_AMOUNT,
} = await import("@/lib/gates/smb-ceiling")

const { overrideGate } = await import("@/lib/gates/actions")

import type { GateContext } from "@/lib/gates/types"

const invoiceCtx = (overrides: Partial<GateContext["document"]> = {}, baseCurrency = "USD"): GateContext => ({
  workspaceId: "w1",
  baseCurrency,
  documentId: "d1",
  document: {
    id: "d1",
    workspaceId: "w1",
    docType: "invoice",
    fieldSnapshot: { total: 20_000 },
    receivedAt: new Date(),
    ...overrides,
  } as GateContext["document"],
})

beforeEach(() => {
  gateFindUnique.mockReset()
  gateFindMany.mockReset()
  gateUpdate.mockReset()
  gateUpsert.mockReset()
  documentFindMany.mockReset()
  workspaceFindUnique.mockReset()
  auditCreate.mockReset()
  getWorkspaceModeMock.mockReset()
})

describe("createSmbCeilingGateRunner", () => {
  const getMode = vi.fn<(workspaceId: string) => Promise<"firm" | "smb">>()
  const runner = createSmbCeilingGateRunner({ getMode })

  beforeEach(() => {
    getMode.mockReset()
    getMode.mockResolvedValue("smb")
  })

  it("silent-passes non-invoice documents without reading mode", async () => {
    const ctx = invoiceCtx({ docType: "purchase_order" })
    await expect(runner.run(ctx)).resolves.toEqual({ blocked: false })
    expect(getMode).not.toHaveBeenCalled()
  })

  it("silent-passes when no total is extracted", async () => {
    const ctx = invoiceCtx({ fieldSnapshot: { vendor: "Acme" } })
    await expect(runner.run(ctx)).resolves.toEqual({ blocked: false })
    expect(getMode).not.toHaveBeenCalled()
  })

  it("silent-passes on firm workspaces — the ceiling is SMB-only per #41", async () => {
    getMode.mockResolvedValue("firm")
    const ctx = invoiceCtx({ fieldSnapshot: { total: 999_999 } })
    await expect(runner.run(ctx)).resolves.toEqual({ blocked: false })
    expect(getMode).toHaveBeenCalledWith("w1")
  })

  it("blocks hard on SMB when total exceeds the 10,000 ceiling", async () => {
    const ctx = invoiceCtx({ fieldSnapshot: { total: 12_500 } })
    const verdict = await runner.run(ctx)
    expect(verdict).toEqual({
      blocked: true,
      severity: "hard",
      payload: { ceiling: SMB_CEILING_AMOUNT, currency: "USD", total: 12_500 },
    })
  })

  it("passes on SMB when total is at or below the ceiling", async () => {
    const ctx = invoiceCtx({ fieldSnapshot: { total: SMB_CEILING_AMOUNT } })
    await expect(runner.run(ctx)).resolves.toEqual({ blocked: false })
  })

  it("uses the workspace base currency in the payload, not USD", async () => {
    const ctx = invoiceCtx({ fieldSnapshot: { total: 11_000 } }, "ZAR")
    const verdict = await runner.run(ctx)
    if (!verdict.blocked) throw new Error("expected blocked")
    expect(verdict.payload).toMatchObject({ currency: "ZAR", total: 11_000 })
  })

  it("silent-passes with a warn when the bill's currency differs from workspace base — v1 does no FX", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const ctx = invoiceCtx({ fieldSnapshot: { total: 500_000, currency: "ZAR" } })
    await expect(runner.run(ctx)).resolves.toEqual({ blocked: false })
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it("compares |total| — a large negative (credit note) trips the ceiling too", async () => {
    const ctx = invoiceCtx({ fieldSnapshot: { total: -25_000 } })
    const verdict = await runner.run(ctx)
    expect(verdict).toMatchObject({ blocked: true, severity: "hard" })
  })
})

describe("smbCeilingGateRunner (real DB wire-up)", () => {
  it("reads mode from models/workspaces and the Company currency from the context", async () => {
    getWorkspaceModeMock.mockResolvedValue("smb")
    const ctx = invoiceCtx({ fieldSnapshot: { total: 50_000 } }, "LSL")
    const verdict = await smbCeilingGateRunner.run(ctx)
    expect(getWorkspaceModeMock).toHaveBeenCalledWith("w1")
    expect(workspaceFindUnique).not.toHaveBeenCalled()
    expect(verdict).toMatchObject({ blocked: true, severity: "hard", payload: { currency: "LSL" } })
  })
})

describe("resolveOpenSmbCeilingGatesForWorkspace", () => {
  it("resolves every open smb-ceiling gate with the given reason", async () => {
    gateFindMany.mockResolvedValueOnce([{ id: "g1" }, { id: "g2" }])
    // resolveGate re-reads by id before writing.
    gateFindUnique.mockImplementation(async (args: { where: { id: string } }) => ({
      id: args.where.id,
      workspaceId: "w1",
      documentId: `d-${args.where.id}`,
      gateType: SMB_CEILING_GATE_TYPE,
      state: "blocked",
      severity: "hard",
      firedAt: new Date(),
      resolvedAt: null,
      resolvedBy: null,
      overrideReason: null,
      payload: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }))
    gateUpdate.mockImplementation(async (args: { where: { id: string } }) => ({ id: args.where.id, state: "resolved" }))

    const result = await resolveOpenSmbCeilingGatesForWorkspace("w1", "workspace_added_reviewer")

    expect(result).toEqual({ resolved: 2 })
    expect(gateFindMany).toHaveBeenCalledWith({
      where: { workspaceId: "w1", gateType: SMB_CEILING_GATE_TYPE, state: "blocked" },
      select: { id: true },
    })
    expect(gateUpdate).toHaveBeenCalledTimes(2)
    // Emits a gate.resolved audit event per resolution, with the reason.
    expect(auditCreate).toHaveBeenCalledTimes(2)
    const events = auditCreate.mock.calls.map((c: unknown[]) => (c[0] as { data: { type: string; payload: Record<string, unknown> } }).data)
    for (const event of events) {
      expect(event.type).toBe("gate.resolved")
      expect(event.payload).toMatchObject({ reason: "workspace_added_reviewer" })
    }
  })

  it("skips overridden gates — the findMany scope is state='blocked' only", async () => {
    // The query filter itself excludes overridden rows, so the outer contract is: only rows
    // returned get resolved. Zero rows returned ⇒ zero writes.
    gateFindMany.mockResolvedValueOnce([])
    const result = await resolveOpenSmbCeilingGatesForWorkspace("w1", "workspace_added_reviewer")
    expect(result).toEqual({ resolved: 0 })
    expect(gateUpdate).not.toHaveBeenCalled()
  })
})

describe("reevaluateOpenSmbCeilingGatesForWorkspace", () => {
  it("upserts a fresh gate for every open bill above the ceiling", async () => {
    getWorkspaceModeMock.mockResolvedValue("smb")
    workspaceFindUnique.mockResolvedValue({ baseCurrency: "ZAR" })
    documentFindMany.mockResolvedValueOnce([
      { id: "d-big", workspaceId: "w1", docType: "invoice", fieldSnapshot: { total: 25_000 }, receivedAt: new Date() },
      { id: "d-small", workspaceId: "w1", docType: "invoice", fieldSnapshot: { total: 200 }, receivedAt: new Date() },
    ])
    // No pre-existing gates on either doc.
    gateFindUnique.mockResolvedValue(null)
    gateUpsert.mockImplementation(async (args: { create: { documentId: string } }) => ({
      id: `g-${args.create.documentId}`,
      workspaceId: "w1",
      documentId: args.create.documentId,
      gateType: SMB_CEILING_GATE_TYPE,
      severity: "hard",
      state: "blocked",
    }))

    const result = await reevaluateOpenSmbCeilingGatesForWorkspace("w1")

    expect(result).toEqual({ blocked: 1 })
    expect(gateUpsert).toHaveBeenCalledTimes(1)
    const upsertArgs = gateUpsert.mock.calls[0][0] as { create: { documentId: string; payload: Record<string, unknown> } }
    expect(upsertArgs.create.documentId).toBe("d-big")
    expect(upsertArgs.create.payload).toMatchObject({ ceiling: SMB_CEILING_AMOUNT, currency: "ZAR", total: 25_000 })
    // One gate.blocked audit row per new gate row.
    expect(auditCreate).toHaveBeenCalledTimes(1)
    const event = auditCreate.mock.calls[0][0] as { data: { type: string; payload: Record<string, unknown> } }
    expect(event.data.type).toBe("gate.blocked")
    expect(event.data.payload).toMatchObject({
      gateType: SMB_CEILING_GATE_TYPE,
      documentId: "d-big",
      reason: "workspace_removed_last_reviewer",
    })
  })

  it("skips a document with an overridden gate — human decisions are not silently rewritten", async () => {
    getWorkspaceModeMock.mockResolvedValue("smb")
    workspaceFindUnique.mockResolvedValue({ baseCurrency: "USD" })
    documentFindMany.mockResolvedValueOnce([
      { id: "d-big", workspaceId: "w1", docType: "invoice", fieldSnapshot: { total: 25_000 }, receivedAt: new Date() },
    ])
    gateFindUnique.mockResolvedValue({ id: "g-existing", state: "overridden" })

    const result = await reevaluateOpenSmbCeilingGatesForWorkspace("w1")

    expect(result).toEqual({ blocked: 0 })
    expect(gateUpsert).not.toHaveBeenCalled()
    expect(auditCreate).not.toHaveBeenCalled()
  })

  it("returns zero counts on an empty workspace", async () => {
    documentFindMany.mockResolvedValueOnce([])
    const result = await reevaluateOpenSmbCeilingGatesForWorkspace("w1")
    expect(result).toEqual({ blocked: 0 })
  })
})

describe("overrideGate for smb-ceiling stamps actorRole: signer_of_record", () => {
  it("merges the actorRoleOverride into the gate.overridden audit payload", async () => {
    gateFindUnique.mockResolvedValueOnce({
      id: "g1",
      workspaceId: "w1",
      documentId: "d1",
      gateType: SMB_CEILING_GATE_TYPE,
      severity: "hard",
      state: "blocked",
      firedAt: new Date(),
      resolvedAt: null,
      resolvedBy: null,
      overrideReason: null,
      payload: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    gateUpdate.mockResolvedValueOnce({
      id: "g1",
      workspaceId: "w1",
      documentId: "d1",
      gateType: SMB_CEILING_GATE_TYPE,
      state: "overridden",
    })

    await overrideGate({
      gateId: "g1",
      actorId: "u-owner",
      reason: "approved by owner",
      actorRoleOverride: "signer_of_record",
    })

    const event = auditCreate.mock.calls[0][0] as { data: { type: string; payload: Record<string, unknown> } }
    expect(event.data.type).toBe("gate.overridden")
    expect(event.data.payload).toEqual({
      gateType: SMB_CEILING_GATE_TYPE,
      documentId: "d1",
      reason: "approved by owner",
      actorRole: "signer_of_record",
    })
  })

  it("omits actorRole when the caller didn't set actorRoleOverride — audit shape stays additive", async () => {
    gateFindUnique.mockResolvedValueOnce({
      id: "g2",
      workspaceId: "w1",
      documentId: "d2",
      gateType: "duplicate",
      severity: "hard",
      state: "blocked",
      firedAt: new Date(),
      resolvedAt: null,
      resolvedBy: null,
      overrideReason: null,
      payload: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    gateUpdate.mockResolvedValueOnce({
      id: "g2",
      workspaceId: "w1",
      documentId: "d2",
      gateType: "duplicate",
      state: "overridden",
    })

    await overrideGate({ gateId: "g2", actorId: "u1", reason: "known dup" })

    const event = auditCreate.mock.calls[0][0] as { data: { payload: Record<string, unknown> } }
    expect(event.data.payload).not.toHaveProperty("actorRole")
  })
})
