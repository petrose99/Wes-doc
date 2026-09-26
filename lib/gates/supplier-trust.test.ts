import { describe, expect, it, vi, beforeEach } from "vitest"

vi.mock("next/headers", () => ({
  headers: vi.fn(() => { throw new Error("no request scope") }),
}))

const supplierFindUnique = vi.fn()
const supplierUpdate = vi.fn()
const gateFindUnique = vi.fn()
const gateFindMany = vi.fn()
const gateUpdate = vi.fn()
const documentFindUnique = vi.fn()
const automationConfigFindUnique = vi.fn()

const workspaceFindUnique = vi.fn(async () => ({ baseCurrency: "ZAR" }))

vi.mock("@/lib/db", () => ({
  prisma: {
    workspace: { findUnique: workspaceFindUnique },
    supplier: { findUnique: supplierFindUnique, update: supplierUpdate },
    gate: { findUnique: gateFindUnique, findMany: gateFindMany, update: gateUpdate },
    document: { findUnique: documentFindUnique },
    workspaceAutomationConfig: { findUnique: automationConfigFindUnique },
    auditEvent: { create: vi.fn() },
  },
}))

vi.mock("@/lib/gates/actions", () => ({
  resolveGate: vi.fn(async () => ({})),
}))

const {
  SUPPLIER_TRUST_GATE_TYPE,
  coerceSupplierTrustThreshold,
  createSupplierTrustGateRunner,
  supplierTrustGateRunner,
  verifySupplier,
  reevaluateSupplierTrustForDocument,
  reevaluateOpenSupplierTrustGates,
} = await import("@/lib/gates/supplier-trust")
const { resolveGate } = await import("@/lib/gates/actions")
import type { GateContext } from "@/lib/gates/types"

const baseCtx = (over: Partial<GateContext["document"]> = {}): GateContext => ({
  workspaceId: "w1",
  baseCurrency: "ZAR",
  documentId: "inv-1",
  document: {
    id: "inv-1",
    workspaceId: "w1",
    docType: "invoice",
    fieldSnapshot: { vendor: "Acme Ltd", total: 1000 },
    receivedAt: new Date(),
    ...over,
  } as GateContext["document"],
})

beforeEach(() => {
  supplierFindUnique.mockReset()
  supplierUpdate.mockReset()
  gateFindUnique.mockReset()
  gateFindMany.mockReset()
  gateUpdate.mockReset()
  documentFindUnique.mockReset()
  automationConfigFindUnique.mockReset()
  ;(resolveGate as unknown as ReturnType<typeof vi.fn>).mockReset()
})

describe("coerceSupplierTrustThreshold", () => {
  it("returns the seed on null / undefined / non-object", () => {
    expect(coerceSupplierTrustThreshold(null)).toEqual({ amount: 500 })
    expect(coerceSupplierTrustThreshold(undefined)).toEqual({ amount: 500 })
    expect(coerceSupplierTrustThreshold(42)).toEqual({ amount: 500 })
    expect(coerceSupplierTrustThreshold([1, 2])).toEqual({ amount: 500 })
  })

  it("falls back to seed on missing/malformed amount", () => {
    expect(coerceSupplierTrustThreshold({ amount: "bad" })).toEqual({ amount: 500 })
    expect(coerceSupplierTrustThreshold({ amount: -1 })).toEqual({ amount: 500 })
    expect(coerceSupplierTrustThreshold({})).toEqual({ amount: 500 })
  })

  it("preserves a valid amount and an explicit currency", () => {
    expect(coerceSupplierTrustThreshold({ amount: 250 })).toEqual({ amount: 250 })
    expect(coerceSupplierTrustThreshold({ amount: 250, currency: "ZAR" })).toEqual({
      amount: 250,
      currency: "ZAR",
    })
  })

  it("drops a malformed currency (wrong length or type)", () => {
    expect(coerceSupplierTrustThreshold({ amount: 250, currency: "ZA" })).toEqual({ amount: 250 })
    expect(coerceSupplierTrustThreshold({ amount: 250, currency: 42 })).toEqual({ amount: 250 })
  })

  it("accepts zero — a workspace that wants every unverified bill flagged sets amount: 0", () => {
    // A 0 threshold means "any bill from any unverified supplier fires", which is the
    // strict opt-in the ticket allows. Not the seed, but a valid shape.
    expect(coerceSupplierTrustThreshold({ amount: 0 })).toEqual({ amount: 0 })
  })
})

describe("createSupplierTrustGateRunner", () => {
  const noSupplier = async () => null
  const flatThreshold = async () => ({ amount: 500 })

  it("passes silently on non-invoice documents", async () => {
    const runner = createSupplierTrustGateRunner({
      findSupplier: noSupplier,
      getThreshold: flatThreshold,
    })
    const verdict = await runner.run(baseCtx({ docType: "receipt" }))
    expect(verdict).toEqual({ blocked: false })
  })

  it("passes silently when the vendor field is missing / blank", async () => {
    const runner = createSupplierTrustGateRunner({
      findSupplier: noSupplier,
      getThreshold: flatThreshold,
    })
    for (const snapshot of [{ total: 5000 }, { vendor: "", total: 5000 }, { vendor: "   ", total: 5000 }]) {
      const verdict = await runner.run(baseCtx({ fieldSnapshot: snapshot }))
      expect(verdict).toEqual({ blocked: false })
    }
  })

  it("passes silently when the total field is missing / non-numeric", async () => {
    const runner = createSupplierTrustGateRunner({
      findSupplier: noSupplier,
      getThreshold: flatThreshold,
    })
    for (const snapshot of [{ vendor: "Acme" }, { vendor: "Acme", total: "not-a-number" }]) {
      const verdict = await runner.run(baseCtx({ fieldSnapshot: snapshot }))
      expect(verdict).toEqual({ blocked: false })
    }
  })

  it("passes when the supplier row shows verifiedAt — verified supplier, any total", async () => {
    const runner = createSupplierTrustGateRunner({
      findSupplier: async () => ({ id: "s1", verifiedAt: new Date("2026-01-01") }),
      getThreshold: flatThreshold,
    })
    const verdict = await runner.run(baseCtx({ fieldSnapshot: { vendor: "Acme Ltd", total: 100000 } }))
    expect(verdict).toEqual({ blocked: false })
  })

  it("passes when an unverified supplier's bill sits at or under the threshold", async () => {
    const runner = createSupplierTrustGateRunner({
      findSupplier: async () => ({ id: "s1", verifiedAt: null }),
      getThreshold: flatThreshold,
    })
    for (const total of [1, 100, 499, 500]) {
      const verdict = await runner.run(baseCtx({ fieldSnapshot: { vendor: "Acme Ltd", total } }))
      expect(verdict).toEqual({ blocked: false })
    }
  })

  it("fires soft when an unverified supplier's bill exceeds the threshold", async () => {
    const runner = createSupplierTrustGateRunner({
      findSupplier: async () => ({ id: "s1", verifiedAt: null }),
      getThreshold: flatThreshold,
    })
    const verdict = await runner.run(baseCtx({ fieldSnapshot: { vendor: "Acme Ltd", total: 5000 } }))
    expect(verdict).toEqual({
      blocked: true,
      severity: "soft",
      payload: {
        supplierName: "Acme Ltd",
        normalizedKey: "acme",
        supplierId: "s1",
        threshold: 500,
        currency: "ZAR",
        invoiceTotal: 5000,
      },
    })
  })

  it("fires on a newcomer whose supplier row does not exist yet — no supplierId in payload", async () => {
    const runner = createSupplierTrustGateRunner({
      findSupplier: async () => null,
      getThreshold: flatThreshold,
    })
    const verdict = await runner.run(baseCtx({ fieldSnapshot: { vendor: "New Supplier Co", total: 5000 } }))
    expect(verdict).toMatchObject({
      blocked: true,
      severity: "soft",
      payload: expect.objectContaining({
        supplierName: "New Supplier Co",
        normalizedKey: "new supplier",
        threshold: 500,
        invoiceTotal: 5000,
      }),
    })
    if (verdict.blocked) {
      expect(verdict.payload).not.toHaveProperty("supplierId")
    }
  })

  it("uses the workspace base currency when the threshold does not pin one", async () => {
    const runner = createSupplierTrustGateRunner({
      findSupplier: async () => null,
      getThreshold: async () => ({ amount: 500 }),
    })
    const ctx = baseCtx({ fieldSnapshot: { vendor: "Acme Ltd", total: 5000 } })
    ctx.baseCurrency = "LSL"
    const verdict = await runner.run(ctx)
    expect(verdict).toMatchObject({
      blocked: true,
      payload: expect.objectContaining({ currency: "LSL", threshold: 500 }),
    })
  })

  it("uses the pinned threshold currency over the workspace base currency", async () => {
    const runner = createSupplierTrustGateRunner({
      findSupplier: async () => null,
      getThreshold: async () => ({ amount: 500, currency: "EUR" }),
    })
    const ctx = baseCtx({ fieldSnapshot: { vendor: "Acme Ltd", total: 5000 } })
    const verdict = await runner.run(ctx)
    expect(verdict).toMatchObject({
      blocked: true,
      payload: expect.objectContaining({ currency: "EUR" }),
    })
  })

  it("normalizes the extracted vendor to a canonical key so 'Acme Ltd' and 'Acme Limited' collide", async () => {
    // The gate runner reads the same normalizer as the duplicate gate; we assert the key
    // that ends up in payload rather than the resolver's contract with the DB.
    const runner = createSupplierTrustGateRunner({
      findSupplier: async () => null,
      getThreshold: async () => ({ amount: 500 }),
    })
    const v1 = await runner.run(baseCtx({ fieldSnapshot: { vendor: "Acme Ltd", total: 1000 } }))
    const v2 = await runner.run(baseCtx({ fieldSnapshot: { vendor: "Acme Limited", total: 1000 } }))
    expect(v1.blocked && v1.payload?.normalizedKey).toBe("acme")
    expect(v2.blocked && v2.payload?.normalizedKey).toBe("acme")
  })
})

describe("supplierTrustGateRunner (default export, wired against real db mocks)", () => {
  it("reads the workspace threshold from WorkspaceAutomationConfig", async () => {
    automationConfigFindUnique.mockResolvedValueOnce({
      supplierTrustThreshold: { amount: 2000, currency: "EUR" },
    })
    supplierFindUnique.mockResolvedValueOnce({ id: "s1", verifiedAt: null })

    const verdict = await supplierTrustGateRunner.run(
      baseCtx({ fieldSnapshot: { vendor: "Acme Ltd", total: 5000 } }),
    )
    expect(automationConfigFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspaceId: "w1" } }),
    )
    expect(supplierFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId_normalizedKey: { workspaceId: "w1", normalizedKey: "acme" },
        },
      }),
    )
    expect(verdict).toMatchObject({
      blocked: true,
      payload: expect.objectContaining({ threshold: 2000, currency: "EUR" }),
    })
  })

  it("passes when the DB has no automation config row (fresh workspace, seed threshold applies)", async () => {
    automationConfigFindUnique.mockResolvedValueOnce(null)
    supplierFindUnique.mockResolvedValueOnce({ id: "s1", verifiedAt: null })

    const verdict = await supplierTrustGateRunner.run(
      baseCtx({ fieldSnapshot: { vendor: "Acme Ltd", total: 100 } }),
    )
    // Seed threshold is 500; 100 <= 500 ⇒ pass.
    expect(verdict).toEqual({ blocked: false })
  })
})

describe("verifySupplier", () => {
  it("throws when the supplier does not exist", async () => {
    supplierFindUnique.mockResolvedValueOnce(null)
    await expect(verifySupplier({ supplierId: "missing", actorId: "u1" })).rejects.toThrow(
      /not found/,
    )
    expect(supplierUpdate).not.toHaveBeenCalled()
  })

  it("stamps verifiedAt + verifiedById and resolves open supplier-trust gates for that supplier's bills", async () => {
    supplierFindUnique.mockResolvedValueOnce({
      id: "s1",
      workspaceId: "w1",
      normalizedKey: "acme",
      verifiedAt: null,
    })
    supplierUpdate.mockResolvedValueOnce({})
    gateFindMany.mockResolvedValueOnce([
      { id: "g1", payload: { normalizedKey: "acme" } },
      { id: "g2", payload: { normalizedKey: "acme" } },
      // A gate on a different supplier — must not be touched.
      { id: "g3", payload: { normalizedKey: "beta" } },
      // A gate with malformed payload — treated as non-match, skipped.
      { id: "g4", payload: null },
    ])
    ;(resolveGate as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({})

    const result = await verifySupplier({ supplierId: "s1", actorId: "u1" })

    expect(supplierUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "s1" },
        data: expect.objectContaining({ verifiedById: "u1", verifiedAt: expect.any(Date) }),
      }),
    )
    expect(resolveGate).toHaveBeenCalledTimes(2)
    expect(resolveGate).toHaveBeenCalledWith(
      expect.objectContaining({ gateId: "g1", actorId: "u1", reason: "supplier verified" }),
      expect.anything(),
    )
    expect(resolveGate).toHaveBeenCalledWith(
      expect.objectContaining({ gateId: "g2", actorId: "u1", reason: "supplier verified" }),
      expect.anything(),
    )
    expect(result.resolvedGateCount).toBe(2)
  })
})

describe("reevaluateSupplierTrustForDocument", () => {
  it("no-op when no gate exists for the document", async () => {
    gateFindUnique.mockResolvedValueOnce(null)
    const result = await reevaluateSupplierTrustForDocument({ workspaceId: "w1", documentId: "d1" })
    expect(result.outcome).toBe("no-op")
    expect(resolveGate).not.toHaveBeenCalled()
  })

  it("no-op when the gate has been overridden — an override is a human decision this hook must not silently rewrite", async () => {
    gateFindUnique.mockResolvedValueOnce({ id: "g1", state: "overridden" })
    const result = await reevaluateSupplierTrustForDocument({ workspaceId: "w1", documentId: "d1" })
    expect(result.outcome).toBe("no-op")
    expect(resolveGate).not.toHaveBeenCalled()
  })

  it("resolves when the runner now returns not-blocked (threshold widened / supplier just verified)", async () => {
    gateFindUnique.mockResolvedValueOnce({ id: "g1", state: "blocked" })
    documentFindUnique.mockResolvedValueOnce({
      id: "d1",
      workspaceId: "w1",
      docType: "invoice",
      fieldSnapshot: { vendor: "Acme Ltd", total: 100 },
      receivedAt: new Date(),
    })
    automationConfigFindUnique.mockResolvedValueOnce({ supplierTrustThreshold: { amount: 500 } })
    supplierFindUnique.mockResolvedValueOnce({ id: "s1", verifiedAt: null })

    const result = await reevaluateSupplierTrustForDocument({ workspaceId: "w1", documentId: "d1" })
    expect(result.outcome).toBe("resolved")
    expect(resolveGate).toHaveBeenCalledWith(
      expect.objectContaining({
        gateId: "g1",
        actorId: null,
        reason: "supplier-trust threshold re-evaluated",
      }),
      expect.anything(),
    )
  })

  it("refreshes payload and stays blocking when the runner still fires", async () => {
    gateFindUnique.mockResolvedValueOnce({ id: "g1", state: "blocked" })
    documentFindUnique.mockResolvedValueOnce({
      id: "d1",
      workspaceId: "w1",
      docType: "invoice",
      fieldSnapshot: { vendor: "Acme Ltd", total: 5000 },
      receivedAt: new Date(),
    })
    automationConfigFindUnique.mockResolvedValueOnce({ supplierTrustThreshold: { amount: 500 } })
    supplierFindUnique.mockResolvedValueOnce({ id: "s1", verifiedAt: null })
    gateUpdate.mockResolvedValueOnce({})

    const result = await reevaluateSupplierTrustForDocument({ workspaceId: "w1", documentId: "d1" })
    expect(result.outcome).toBe("still-blocking")
    expect(gateUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "g1" },
        data: expect.objectContaining({ severity: "soft" }),
      }),
    )
    expect(resolveGate).not.toHaveBeenCalled()
  })
})

describe("reevaluateOpenSupplierTrustGates", () => {
  it("counts resolved vs still-blocking across the workspace's open gates", async () => {
    gateFindMany.mockResolvedValueOnce([
      { id: "g1", documentId: "d1" },
      { id: "g2", documentId: "d2" },
    ])
    // First document → resolves.
    gateFindUnique.mockResolvedValueOnce({ id: "g1", state: "blocked" })
    documentFindUnique.mockResolvedValueOnce({
      id: "d1",
      workspaceId: "w1",
      docType: "invoice",
      fieldSnapshot: { vendor: "Acme", total: 100 },
      receivedAt: new Date(),
    })
    automationConfigFindUnique.mockResolvedValueOnce({ supplierTrustThreshold: { amount: 500 } })
    supplierFindUnique.mockResolvedValueOnce({ id: "s1", verifiedAt: null })
    // Second document → still blocking.
    gateFindUnique.mockResolvedValueOnce({ id: "g2", state: "blocked" })
    documentFindUnique.mockResolvedValueOnce({
      id: "d2",
      workspaceId: "w1",
      docType: "invoice",
      fieldSnapshot: { vendor: "Beta", total: 5000 },
      receivedAt: new Date(),
    })
    automationConfigFindUnique.mockResolvedValueOnce({ supplierTrustThreshold: { amount: 500 } })
    supplierFindUnique.mockResolvedValueOnce({ id: "s2", verifiedAt: null })
    gateUpdate.mockResolvedValueOnce({})

    const result = await reevaluateOpenSupplierTrustGates("w1")
    expect(result).toEqual({ resolved: 1, stillBlocking: 1 })
  })
})

describe("SUPPLIER_TRUST_GATE_TYPE", () => {
  it("is 'supplier-trust' — matching the #40 slot", () => {
    expect(SUPPLIER_TRUST_GATE_TYPE).toBe("supplier-trust")
  })
})
