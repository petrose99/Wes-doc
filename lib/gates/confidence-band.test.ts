import { describe, expect, it, vi, beforeEach } from "vitest"

vi.mock("next/headers", () => ({
  headers: vi.fn(() => { throw new Error("no request scope") }),
}))

const gateFindUnique = vi.fn()
const gateFindMany = vi.fn()
const gateUpdate = vi.fn()
const documentFindUnique = vi.fn()
const configFindUnique = vi.fn()
const auditCreate = vi.fn()

vi.mock("@/lib/db", () => ({
  prisma: {
    gate: {
      findUnique: gateFindUnique,
      findMany: gateFindMany,
      update: gateUpdate,
    },
    document: { findUnique: documentFindUnique },
    workspaceAutomationConfig: { findUnique: configFindUnique },
    auditEvent: { create: auditCreate },
  },
}))

const {
  coerceConfidenceBands,
  DEFAULT_CONFIDENCE_BANDS,
  bandFor,
  readOverallConfidence,
  createConfidenceBandGateRunner,
  confidenceBandGateRunner,
  reevaluateConfidenceBandForDocument,
  reevaluateOpenConfidenceBandGates,
  CONFIDENCE_BAND_GATE_TYPE,
} = await import("@/lib/gates/confidence-band")

import type { GateContext } from "@/lib/gates/types"

const invoiceCtx = (overrides: Partial<GateContext["document"]> = {}): GateContext => ({
  workspaceId: "w1",
  documentId: "d1",
  document: {
    id: "d1",
    workspaceId: "w1",
    docType: "invoice",
    fieldSnapshot: { total: 1000 },
    receivedAt: new Date(),
    ...overrides,
  } as GateContext["document"],
})

beforeEach(() => {
  gateFindUnique.mockReset()
  gateFindMany.mockReset()
  gateUpdate.mockReset()
  documentFindUnique.mockReset()
  configFindUnique.mockReset()
  auditCreate.mockReset()
})

describe("coerceConfidenceBands", () => {
  it("falls back to the #40 seed on non-array input", () => {
    expect(coerceConfidenceBands(null)).toEqual(DEFAULT_CONFIDENCE_BANDS)
    expect(coerceConfidenceBands("not an array")).toEqual(DEFAULT_CONFIDENCE_BANDS)
    expect(coerceConfidenceBands({ upTo: 500, min: 0.85 })).toEqual(DEFAULT_CONFIDENCE_BANDS)
  })

  it("falls back to the seed when every row is malformed", () => {
    expect(coerceConfidenceBands([{}, { min: "high" }, { upTo: -1, min: 0.9 }])).toEqual(
      DEFAULT_CONFIDENCE_BANDS,
    )
  })

  it("silently drops malformed rows and keeps valid ones", () => {
    const raw = [
      { upTo: 100, min: 0.7 },
      { upTo: "500", min: 0.85 }, // upTo not a number
      { upTo: 5000, min: 1.1 }, // min out of range
      { upTo: null, min: 0.95 },
    ]
    expect(coerceConfidenceBands(raw)).toEqual([
      { upTo: 100, min: 0.7 },
      { upTo: null, min: 0.95 },
    ])
  })

  it("sorts bands by upTo ascending with null last", () => {
    const raw = [
      { upTo: null, min: 1.0 },
      { upTo: 5000, min: 0.92 },
      { upTo: 500, min: 0.85 },
    ]
    expect(coerceConfidenceBands(raw)).toEqual(DEFAULT_CONFIDENCE_BANDS)
  })

  it("accepts min = 1.0 as an opt-out band (always review)", () => {
    expect(coerceConfidenceBands([{ upTo: null, min: 1.0 }])).toEqual([{ upTo: null, min: 1.0 }])
  })
})

describe("bandFor", () => {
  const bands = DEFAULT_CONFIDENCE_BANDS

  it("picks the smallest band whose upTo covers the amount", () => {
    expect(bandFor(50, bands)).toEqual({ upTo: 500, min: 0.85 })
    expect(bandFor(500, bands)).toEqual({ upTo: 500, min: 0.85 })
    expect(bandFor(500.01, bands)).toEqual({ upTo: 5000, min: 0.92 })
    expect(bandFor(10000, bands)).toEqual({ upTo: null, min: 1.0 })
  })

  it("returns null on a truncated table (no open-ended top) when amount exceeds top band", () => {
    const truncated = [
      { upTo: 500, min: 0.85 },
      { upTo: 5000, min: 0.92 },
    ]
    expect(bandFor(50, truncated)).toEqual({ upTo: 500, min: 0.85 })
    expect(bandFor(10000, truncated)).toBeNull()
  })

  it("returns null for a negative or non-finite amount", () => {
    expect(bandFor(-1, bands)).toBeNull()
    expect(bandFor(NaN, bands)).toBeNull()
    expect(bandFor(Infinity, bands)).toBeNull()
  })
})

describe("readOverallConfidence", () => {
  it("returns the min of fieldConfidence values", () => {
    const doc = {
      confidence: { fieldConfidence: { total: 0.95, vendor: 0.82, date: 0.9 } },
    } as unknown as GateContext["document"]
    expect(readOverallConfidence(doc)).toBeCloseTo(0.82)
  })

  it("falls back to codingConfidence when fieldConfidence is absent", () => {
    const doc = { confidence: null, codingConfidence: 0.77 } as unknown as GateContext["document"]
    expect(readOverallConfidence(doc)).toBe(0.77)
  })

  it("returns null when neither signal is present", () => {
    const doc = { confidence: null, codingConfidence: null } as unknown as GateContext["document"]
    expect(readOverallConfidence(doc)).toBeNull()
  })

  it("ignores non-number fieldConfidence entries", () => {
    const doc = {
      confidence: { fieldConfidence: { total: "high", vendor: 0.9 } },
    } as unknown as GateContext["document"]
    expect(readOverallConfidence(doc)).toBe(0.9)
  })

  it("returns null when fieldConfidence exists but has no numeric entries", () => {
    const doc = {
      confidence: { fieldConfidence: {} },
      codingConfidence: null,
    } as unknown as GateContext["document"]
    expect(readOverallConfidence(doc)).toBeNull()
  })
})

describe("createConfidenceBandGateRunner", () => {
  const getBands = vi.fn<() => Promise<typeof DEFAULT_CONFIDENCE_BANDS>>()
  const runner = createConfidenceBandGateRunner({ getBands })

  beforeEach(() => {
    getBands.mockReset()
    getBands.mockResolvedValue(DEFAULT_CONFIDENCE_BANDS)
  })

  it("silent-passes non-invoice documents", async () => {
    const ctx = invoiceCtx({ docType: "purchase_order" })
    await expect(runner.run(ctx)).resolves.toEqual({ blocked: false })
    expect(getBands).not.toHaveBeenCalled()
  })

  it("silent-passes when no total is extracted", async () => {
    const ctx = invoiceCtx({ fieldSnapshot: { vendor: "Acme" } })
    await expect(runner.run(ctx)).resolves.toEqual({ blocked: false })
  })

  it("silent-passes when no confidence signal exists", async () => {
    const ctx = invoiceCtx({ fieldSnapshot: { total: 200 } })
    await expect(runner.run(ctx)).resolves.toEqual({ blocked: false })
  })

  it("passes when overall confidence meets the band floor", async () => {
    const ctx = invoiceCtx({
      fieldSnapshot: { total: 200 },
      confidence: { fieldConfidence: { total: 0.9, vendor: 0.86 } },
    } as unknown as Partial<GateContext["document"]>)
    await expect(runner.run(ctx)).resolves.toEqual({ blocked: false })
  })

  it("fires soft-gate when overall confidence falls below the band floor", async () => {
    const ctx = invoiceCtx({
      fieldSnapshot: { total: 2000 },
      confidence: { fieldConfidence: { total: 0.9, vendor: 0.86 } },
    } as unknown as Partial<GateContext["document"]>)
    const verdict = await runner.run(ctx)
    expect(verdict).toEqual({
      blocked: true,
      severity: "soft",
      payload: expect.objectContaining({
        overallConfidence: expect.closeTo(0.86, 2),
        bandMin: 0.92,
        bandUpTo: 5000,
        invoiceTotal: 2000,
      }),
    })
  })

  it("uses the open-ended top band for very large bills", async () => {
    const ctx = invoiceCtx({
      fieldSnapshot: { total: 25000 },
      confidence: { fieldConfidence: { total: 0.99 } },
    } as unknown as Partial<GateContext["document"]>)
    const verdict = await runner.run(ctx)
    expect(verdict).toEqual({
      blocked: true,
      severity: "soft",
      payload: expect.objectContaining({ bandMin: 1.0, bandUpTo: null }),
    })
  })

  it("uses baseCurrency when the document pins one", async () => {
    const ctx = invoiceCtx({
      fieldSnapshot: { total: 100 },
      confidence: { fieldConfidence: { total: 0.5 } },
      baseCurrency: "ZAR",
    } as unknown as Partial<GateContext["document"]>)
    const verdict = await runner.run(ctx)
    if (!verdict.blocked) throw new Error("expected blocked")
    expect(verdict.payload).toMatchObject({ currency: "ZAR" })
  })

  it("silent-passes on a truncated bands table when amount exceeds the top band", async () => {
    getBands.mockResolvedValue([
      { upTo: 500, min: 0.85 },
      { upTo: 5000, min: 0.92 },
    ])
    const ctx = invoiceCtx({
      fieldSnapshot: { total: 20000 },
      confidence: { fieldConfidence: { total: 0.5 } },
    } as unknown as Partial<GateContext["document"]>)
    await expect(runner.run(ctx)).resolves.toEqual({ blocked: false })
  })
})

describe("confidenceBandGateRunner (real DB wire-up)", () => {
  it("reads bands from WorkspaceAutomationConfig via prisma", async () => {
    configFindUnique.mockResolvedValue({
      confidenceBands: [{ upTo: null, min: 0.99 }],
    })
    const ctx = invoiceCtx({
      fieldSnapshot: { total: 50 },
      confidence: { fieldConfidence: { total: 0.9 } },
    } as unknown as Partial<GateContext["document"]>)
    const verdict = await confidenceBandGateRunner.run(ctx)
    expect(configFindUnique).toHaveBeenCalledWith({
      where: { workspaceId: "w1" },
      select: { confidenceBands: true },
    })
    expect(verdict).toEqual(
      expect.objectContaining({ blocked: true, severity: "soft" }),
    )
  })

  it("falls back to the seed when the config row is missing", async () => {
    configFindUnique.mockResolvedValue(null)
    const ctx = invoiceCtx({
      fieldSnapshot: { total: 50 },
      confidence: { fieldConfidence: { total: 0.9 } },
    } as unknown as Partial<GateContext["document"]>)
    // Amount 50 → band 0-500 min 0.85; confidence 0.9 clears it.
    await expect(confidenceBandGateRunner.run(ctx)).resolves.toEqual({ blocked: false })
  })
})

describe("reevaluateConfidenceBandForDocument", () => {
  it("no-ops when there is no gate on the document", async () => {
    gateFindUnique.mockResolvedValue(null)
    const result = await reevaluateConfidenceBandForDocument({ workspaceId: "w1", documentId: "d1" })
    expect(result).toEqual({ outcome: "no-op" })
    expect(documentFindUnique).not.toHaveBeenCalled()
  })

  it("no-ops when the gate is already overridden — human decisions are not silently rewritten", async () => {
    gateFindUnique.mockResolvedValue({ id: "g1", state: "overridden" })
    const result = await reevaluateConfidenceBandForDocument({ workspaceId: "w1", documentId: "d1" })
    expect(result).toEqual({ outcome: "no-op" })
    expect(documentFindUnique).not.toHaveBeenCalled()
  })

  it("resolves the gate when the new bands let the bill pass", async () => {
    gateFindUnique.mockResolvedValue({ id: "g1", state: "blocked" })
    documentFindUnique.mockResolvedValue({
      id: "d1",
      workspaceId: "w1",
      docType: "invoice",
      fieldSnapshot: { total: 100 },
      receivedAt: new Date(),
      confidence: { fieldConfidence: { total: 0.9 } },
      codingConfidence: null,
    })
    // Bands widened: 0.5 floor lets the 0.9 bill through.
    configFindUnique.mockResolvedValue({ confidenceBands: [{ upTo: null, min: 0.5 }] })
    gateUpdate.mockResolvedValue({ id: "g1", state: "resolved" })

    const result = await reevaluateConfidenceBandForDocument({ workspaceId: "w1", documentId: "d1" })
    expect(result).toEqual({ outcome: "resolved" })
    // resolveGate is called through the actions module; its own tests cover the state
    // write, we just care that this hook drove it.
    expect(gateUpdate).toHaveBeenCalled()
  })

  it("refreshes the payload when the gate is still blocking", async () => {
    gateFindUnique.mockResolvedValue({ id: "g1", state: "blocked" })
    documentFindUnique.mockResolvedValue({
      id: "d1",
      workspaceId: "w1",
      docType: "invoice",
      fieldSnapshot: { total: 2000 },
      receivedAt: new Date(),
      confidence: { fieldConfidence: { total: 0.7 } },
      codingConfidence: null,
    })
    configFindUnique.mockResolvedValue({
      confidenceBands: [{ upTo: null, min: 0.95 }],
    })
    gateUpdate.mockResolvedValue({ id: "g1", state: "blocked" })

    const result = await reevaluateConfidenceBandForDocument({ workspaceId: "w1", documentId: "d1" })
    expect(result).toEqual({ outcome: "still-blocking" })
    expect(gateUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "g1" },
        data: expect.objectContaining({
          severity: "soft",
          payload: expect.objectContaining({ bandMin: 0.95, overallConfidence: 0.7 }),
        }),
      }),
    )
  })

  it("no-ops when the document itself has vanished", async () => {
    gateFindUnique.mockResolvedValue({ id: "g1", state: "blocked" })
    documentFindUnique.mockResolvedValue(null)
    const result = await reevaluateConfidenceBandForDocument({ workspaceId: "w1", documentId: "d1" })
    expect(result).toEqual({ outcome: "no-op" })
  })
})

describe("reevaluateOpenConfidenceBandGates", () => {
  it("walks every blocked gate and returns the counts", async () => {
    gateFindMany.mockResolvedValue([
      { id: "g1", documentId: "d1" },
      { id: "g2", documentId: "d2" },
    ])
    // gate.findUnique is called both by reevaluate (documentId_gateType lookup) and by
    // resolveGate (id lookup); make the mock answer either shape with the right state.
    const gateRows: Record<string, { id: string; state: string; workspaceId: string; documentId: string; gateType: string }> = {
      g1: { id: "g1", state: "blocked", workspaceId: "w1", documentId: "d1", gateType: CONFIDENCE_BAND_GATE_TYPE },
      g2: { id: "g2", state: "blocked", workspaceId: "w1", documentId: "d2", gateType: CONFIDENCE_BAND_GATE_TYPE },
    }
    const byDoc: Record<string, string> = { d1: "g1", d2: "g2" }
    gateFindUnique.mockImplementation(async (args: { where: Record<string, unknown> }) => {
      if (typeof args.where.id === "string") return gateRows[args.where.id] ?? null
      const key = args.where.documentId_gateType as { documentId: string } | undefined
      if (key) return gateRows[byDoc[key.documentId]] ?? null
      return null
    })
    documentFindUnique
      .mockResolvedValueOnce({
        id: "d1",
        workspaceId: "w1",
        docType: "invoice",
        fieldSnapshot: { total: 100 },
        receivedAt: new Date(),
        confidence: { fieldConfidence: { total: 0.99 } },
        codingConfidence: null,
      })
      .mockResolvedValueOnce({
        id: "d2",
        workspaceId: "w1",
        docType: "invoice",
        fieldSnapshot: { total: 5000 },
        receivedAt: new Date(),
        confidence: { fieldConfidence: { total: 0.5 } },
        codingConfidence: null,
      })
    configFindUnique.mockResolvedValue({ confidenceBands: [{ upTo: null, min: 0.9 }] })
    gateUpdate.mockResolvedValue({ id: "any", state: "resolved" })

    const result = await reevaluateOpenConfidenceBandGates("w1")
    expect(result).toEqual({ resolved: 1, stillBlocking: 1 })
    expect(gateFindMany).toHaveBeenCalledWith({
      where: { workspaceId: "w1", gateType: CONFIDENCE_BAND_GATE_TYPE, state: "blocked" },
      select: { id: true, documentId: true },
    })
  })

  it("returns zero counts on an empty workspace", async () => {
    gateFindMany.mockResolvedValue([])
    const result = await reevaluateOpenConfidenceBandGates("w1")
    expect(result).toEqual({ resolved: 0, stillBlocking: 0 })
  })
})
