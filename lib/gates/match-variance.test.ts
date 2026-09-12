import { describe, expect, it, vi, beforeEach } from "vitest"

vi.mock("next/headers", () => ({
  headers: vi.fn(() => { throw new Error("no request scope") }),
}))

const gateFindUnique = vi.fn()
const gateFindMany = vi.fn()
const gateUpdate = vi.fn()
const documentFindUnique = vi.fn()
const documentMatchFindFirst = vi.fn()
const automationConfigFindUnique = vi.fn()

vi.mock("@/lib/db", () => ({
  prisma: {
    gate: { findUnique: gateFindUnique, findMany: gateFindMany, update: gateUpdate },
    document: { findUnique: documentFindUnique },
    documentMatch: { findFirst: documentMatchFindFirst },
    workspaceAutomationConfig: { findUnique: automationConfigFindUnique },
    auditEvent: { create: vi.fn() },
  },
}))

vi.mock("@/lib/gates/actions", () => ({
  resolveGate: vi.fn(async () => ({})),
}))

const {
  MATCH_VARIANCE_GATE_TYPE,
  DEFAULT_MATCH_TOLERANCE,
  coerceMatchTolerance,
  computeVarianceVerdict,
  createMatchVarianceGateRunner,
  matchVarianceGateRunner,
  reevaluateMatchVarianceForDocument,
  reevaluateOpenMatchVarianceGates,
} = await import("@/lib/gates/match-variance")
const { resolveGate } = await import("@/lib/gates/actions")
import type { GateContext, GateVerdict } from "@/lib/gates/types"

const baseCtx = (over: Partial<GateContext["document"]> = {}): GateContext => ({
  workspaceId: "w1",
  documentId: "inv-1",
  document: {
    id: "inv-1",
    workspaceId: "w1",
    docType: "invoice",
    fieldSnapshot: { total: 1000 },
    receivedAt: new Date(),
    ...over,
  } as GateContext["document"],
})

const tolerance = { percent: 0.02, floor: { amount: 500 } }
const strictTolerance = { percent: 0, floor: { amount: 0 } }

beforeEach(() => {
  gateFindUnique.mockReset()
  gateFindMany.mockReset()
  gateUpdate.mockReset()
  documentFindUnique.mockReset()
  documentMatchFindFirst.mockReset()
  automationConfigFindUnique.mockReset()
  ;(resolveGate as unknown as ReturnType<typeof vi.fn>).mockReset()
})

describe("coerceMatchTolerance", () => {
  it("returns the seed on null / undefined / non-object", () => {
    expect(coerceMatchTolerance(null)).toEqual(DEFAULT_MATCH_TOLERANCE)
    expect(coerceMatchTolerance(undefined)).toEqual(DEFAULT_MATCH_TOLERANCE)
    expect(coerceMatchTolerance(42)).toEqual(DEFAULT_MATCH_TOLERANCE)
  })
  it("falls back to seed on missing/malformed fields, preserving valid ones", () => {
    expect(coerceMatchTolerance({ percent: 0.05, floor: { amount: "bad" } }))
      .toEqual({ percent: 0.05, floor: { amount: 500 } })
    expect(coerceMatchTolerance({ percent: -1, floor: { amount: 250 } }))
      .toEqual({ percent: 0.02, floor: { amount: 250 } })
  })
  it("preserves an explicit floor currency", () => {
    expect(coerceMatchTolerance({ percent: 0.02, floor: { amount: 500, currency: "ZAR" } }))
      .toEqual({ percent: 0.02, floor: { amount: 500, currency: "ZAR" } })
  })
  it("honours an explicit strict setting (percent 0, floor 0) — ticket calls this out as workspace opt-in", () => {
    expect(coerceMatchTolerance({ percent: 0, floor: { amount: 0 } }))
      .toEqual({ percent: 0, floor: { amount: 0 } })
  })
})

describe("computeVarianceVerdict", () => {
  it("2-way within tolerance — floor wins on a small bill", () => {
    const v = computeVarianceVerdict({ invoiceTotal: 100, poTotal: 200, tolerance })
    expect(v.variance).toBe(100)
    expect(v.threshold).toBe(500)
    expect(v.withinTolerance).toBe(true)
  })
  it("2-way outside tolerance — percent wins on a large bill", () => {
    const v = computeVarianceVerdict({ invoiceTotal: 100_000, poTotal: 100_000 * 1.05, tolerance })
    expect(v.threshold).toBeCloseTo(100_000 * 1.05 * 0.02, 5)
    expect(v.withinTolerance).toBe(false)
  })
  it("3-way sees the largest of the three gaps", () => {
    const v = computeVarianceVerdict({ invoiceTotal: 1000, poTotal: 1000, grnTotal: 1600, tolerance })
    expect(v.variance).toBe(600)
    expect(v.withinTolerance).toBe(false)
  })
  it("percent 0 + floor 0 → any nonzero gap blocks", () => {
    const v = computeVarianceVerdict({ invoiceTotal: 1000, poTotal: 1000.01, tolerance: strictTolerance })
    expect(v.withinTolerance).toBe(false)
  })
})

describe("match-variance runner", () => {
  const runner = createMatchVarianceGateRunner({
    findMatchLinks: async () => ({ poDocumentId: "po-1", poTotal: 1000 }),
    getTolerance: async () => tolerance,
  })

  it("passes silently on non-invoice docTypes", async () => {
    const v = await runner.run(baseCtx({ docType: "purchase_order" }))
    expect(v).toEqual({ blocked: false })
  })

  it("passes silently when the bill has no total (confidence-band's problem, not ours)", async () => {
    const v = await runner.run(baseCtx({ fieldSnapshot: {} }))
    expect(v).toEqual({ blocked: false })
  })

  it("passes silently when there is no linked PO — no PO is data absence, not exception", async () => {
    const passRunner = createMatchVarianceGateRunner({
      findMatchLinks: async () => null,
      getTolerance: async () => tolerance,
    })
    const v = await passRunner.run(baseCtx())
    expect(v).toEqual({ blocked: false })
  })

  it("passes silently when the linked PO carries no numeric total", async () => {
    const passRunner = createMatchVarianceGateRunner({
      findMatchLinks: async () => ({ poDocumentId: "po-1", poTotal: NaN }),
      getTolerance: async () => tolerance,
    })
    const v = await passRunner.run(baseCtx())
    expect(v).toEqual({ blocked: false })
  })

  it("passes silently when a 2-way variance sits inside tolerance (floor)", async () => {
    const v = await runner.run(baseCtx({ fieldSnapshot: { total: 1200 } }))
    expect(v).toEqual({ blocked: false })
  })

  it("fires soft when the 2-way variance exceeds the tolerance", async () => {
    const bigRunner = createMatchVarianceGateRunner({
      findMatchLinks: async () => ({ poDocumentId: "po-1", poTotal: 100_000 }),
      getTolerance: async () => tolerance,
    })
    const v = await bigRunner.run(baseCtx({ fieldSnapshot: { total: 110_000 } }))
    expect(v.blocked).toBe(true)
    if (!v.blocked) throw new Error()
    expect(v.severity).toBe("soft")
    expect(v.payload?.matchType).toBe("2-way")
    expect(v.payload?.variance).toBe(10_000)
    expect(v.payload?.poDocumentId).toBe("po-1")
    expect(v.payload?.threshold).toBeCloseTo(2000, 5)
  })

  it("fires soft with matchType 3-way when a GRN is linked", async () => {
    const grnRunner = createMatchVarianceGateRunner({
      findMatchLinks: async () => ({ poDocumentId: "po-1", poTotal: 100_000, grnDocumentId: "grn-1", grnTotal: 110_000 }),
      getTolerance: async () => tolerance,
    })
    const v = await grnRunner.run(baseCtx({ fieldSnapshot: { total: 100_000 } }))
    expect(v.blocked).toBe(true)
    if (!v.blocked) throw new Error()
    expect(v.payload?.matchType).toBe("3-way")
    expect(v.payload?.grnDocumentId).toBe("grn-1")
    expect(v.payload?.grnTotal).toBe(110_000)
  })

  it("payload floor.currency falls back to the document's baseCurrency when the setting doesn't pin one", async () => {
    const bigRunner = createMatchVarianceGateRunner({
      findMatchLinks: async () => ({ poDocumentId: "po-1", poTotal: 100_000 }),
      getTolerance: async () => ({ percent: 0.02, floor: { amount: 500 } }),
    })
    const ctx = baseCtx({ fieldSnapshot: { total: 110_000 } })
    ;(ctx.document as Record<string, unknown>).baseCurrency = "ZAR"
    const v = await bigRunner.run(ctx)
    if (!v.blocked) throw new Error()
    expect((v.payload as { floor: { currency: string } }).floor.currency).toBe("ZAR")
  })

  it("payload floor.currency uses the setting's currency when pinned, ignoring the workspace's base", async () => {
    const bigRunner = createMatchVarianceGateRunner({
      findMatchLinks: async () => ({ poDocumentId: "po-1", poTotal: 100_000 }),
      getTolerance: async () => ({ percent: 0.02, floor: { amount: 500, currency: "GBP" } }),
    })
    const ctx = baseCtx({ fieldSnapshot: { total: 110_000 } })
    ;(ctx.document as Record<string, unknown>).baseCurrency = "ZAR"
    const v = await bigRunner.run(ctx)
    if (!v.blocked) throw new Error()
    expect((v.payload as { floor: { currency: string } }).floor.currency).toBe("GBP")
  })
})

describe("reevaluateMatchVarianceForDocument", () => {
  it("no-ops when there is no gate row for the document", async () => {
    gateFindUnique.mockResolvedValueOnce(null)
    const out = await reevaluateMatchVarianceForDocument({ workspaceId: "w1", documentId: "inv-1" })
    expect(out).toEqual({ outcome: "no-op" })
  })

  it("no-ops when the existing gate is overridden — never rewrite an intentional human decision", async () => {
    gateFindUnique.mockResolvedValueOnce({ id: "g1", state: "overridden" })
    const out = await reevaluateMatchVarianceForDocument({ workspaceId: "w1", documentId: "inv-1" })
    expect(out).toEqual({ outcome: "no-op" })
    expect(resolveGate).not.toHaveBeenCalled()
  })

  it("resolves the gate when the variance is now inside tolerance", async () => {
    gateFindUnique.mockResolvedValueOnce({ id: "g1", state: "blocked" })
    documentFindUnique.mockResolvedValueOnce({
      id: "inv-1", workspaceId: "w1", docType: "invoice", fieldSnapshot: { total: 1000 }, receivedAt: new Date(),
    })
    // Real runner delegates to documentMatch + automationConfig; simulate "no PO now linked"
    // — bill sits alone, so the runner returns blocked:false, which is the resolve branch.
    documentMatchFindFirst.mockResolvedValue(null)
    automationConfigFindUnique.mockResolvedValueOnce({ matchTolerance: tolerance })
    const out = await reevaluateMatchVarianceForDocument({ workspaceId: "w1", documentId: "inv-1" })
    expect(out).toEqual({ outcome: "resolved" })
    expect(resolveGate).toHaveBeenCalledWith(
      expect.objectContaining({ gateId: "g1", actorId: null }),
      expect.anything(),
    )
  })

  it("refreshes the payload when still blocking after tolerance change", async () => {
    gateFindUnique.mockResolvedValueOnce({ id: "g1", state: "blocked" })
    documentFindUnique.mockResolvedValueOnce({
      id: "inv-1", workspaceId: "w1", docType: "invoice", fieldSnapshot: { total: 110_000 }, receivedAt: new Date(),
    })
    documentMatchFindFirst.mockImplementation(async (args: unknown) => {
      const q = args as { where: { matchType: string } }
      if (q.where.matchType === "po_to_invoice") {
        return { sourceId: "po-1", source: { fieldSnapshot: { total: 100_000 } } }
      }
      return null
    })
    automationConfigFindUnique.mockResolvedValueOnce({ matchTolerance: tolerance })

    const out = await reevaluateMatchVarianceForDocument({ workspaceId: "w1", documentId: "inv-1" })
    expect(out).toEqual({ outcome: "still-blocking" })
    expect(gateUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "g1" },
      data: expect.objectContaining({ severity: "soft" }),
    }))
    expect(resolveGate).not.toHaveBeenCalled()
  })
})

describe("reevaluateOpenMatchVarianceGates", () => {
  it("walks every open gate and returns aggregate counts", async () => {
    gateFindMany.mockResolvedValueOnce([
      { id: "g1", documentId: "inv-1" },
      { id: "g2", documentId: "inv-2" },
    ])
    // inv-1: resolves (no PO linked any more)
    gateFindUnique.mockResolvedValueOnce({ id: "g1", state: "blocked" })
    documentFindUnique.mockResolvedValueOnce({
      id: "inv-1", workspaceId: "w1", docType: "invoice", fieldSnapshot: { total: 1000 }, receivedAt: new Date(),
    })
    // inv-2: still blocking
    gateFindUnique.mockResolvedValueOnce({ id: "g2", state: "blocked" })
    documentFindUnique.mockResolvedValueOnce({
      id: "inv-2", workspaceId: "w1", docType: "invoice", fieldSnapshot: { total: 110_000 }, receivedAt: new Date(),
    })
    documentMatchFindFirst.mockImplementation(async (args: unknown) => {
      const q = args as { where: { matchType: string; sourceId?: string; targetId?: string } }
      if (q.where.matchType === "po_to_invoice" && q.where.targetId === "inv-2") {
        return { sourceId: "po-2", source: { fieldSnapshot: { total: 100_000 } } }
      }
      return null
    })
    automationConfigFindUnique.mockResolvedValue({ matchTolerance: tolerance })

    const out = await reevaluateOpenMatchVarianceGates("w1")
    expect(out).toEqual({ resolved: 1, stillBlocking: 1 })
  })
})

describe("default matchVarianceGateRunner registration surface", () => {
  it("exposes MATCH_VARIANCE_GATE_TYPE and matches the exported runner's gateType", () => {
    expect(MATCH_VARIANCE_GATE_TYPE).toBe("match-variance")
    expect(matchVarianceGateRunner.gateType).toBe(MATCH_VARIANCE_GATE_TYPE)
  })

  it("integrates with the real deps: no linked PO → passes silently", async () => {
    documentMatchFindFirst.mockResolvedValue(null)
    automationConfigFindUnique.mockResolvedValueOnce({ matchTolerance: tolerance })
    const verdict = (await matchVarianceGateRunner.run(baseCtx())) as GateVerdict
    expect(verdict).toEqual({ blocked: false })
  })
})
