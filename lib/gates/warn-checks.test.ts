import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"

import {
  buildWarnCheckContext,
  computeDaysToDue,
  createWarnChecksGateRunner,
  evaluateAllChecks,
  type LoadedSupplier,
} from "./warn-checks"
import type { GateContext } from "./types"

function makeDocument(overrides: Partial<GateContext["document"]> = {}): GateContext["document"] {
  return {
    id: "doc-1",
    workspaceId: "ws-1",
    docType: "invoice",
    fieldSnapshot: { total: 100, currency: "USD", vendor: "Acme Corp" },
    receivedAt: new Date("2026-09-11T00:00:00Z"),
    ...overrides,
  } as GateContext["document"]
}

function makeCtx(overrides: Partial<GateContext["document"]> = {}): GateContext {
  return {
    workspaceId: "ws-1",
    documentId: "doc-1",
    document: makeDocument(overrides),
  }
}

describe("computeDaysToDue", () => {
  const now = new Date("2026-09-11T12:00:00Z")

  it("returns null when there is no due date", () => {
    expect(computeDaysToDue(null, now)).toBeNull()
  })

  it("returns days remaining, truncated toward zero", () => {
    expect(computeDaysToDue(new Date("2026-09-25T12:00:00Z"), now)).toBe(14)
    // Same day: 0.
    expect(computeDaysToDue(new Date("2026-09-11T14:00:00Z"), now)).toBe(0)
  })

  it("returns negative when overdue", () => {
    expect(computeDaysToDue(new Date("2026-09-01T12:00:00Z"), now)).toBe(-10)
  })
})

describe("buildWarnCheckContext", () => {
  const now = new Date("2026-09-11T00:00:00Z")

  it("fills every documented variable when the snapshot has it", () => {
    const ctx = buildWarnCheckContext({
      document: makeDocument({
        fieldSnapshot: {
          total: 250,
          currency: "EUR",
          category: "software",
          description: "Adobe Creative Cloud",
          vatRate: 0.15,
          dueDate: "2026-09-25T00:00:00Z",
          vendor: "Adobe Inc",
        },
      }),
      supplier: { id: "sup-1" } as LoadedSupplier,
      now,
    })
    expect(ctx).toEqual({
      total: 250,
      currency: "EUR",
      supplierKnown: true,
      category: "software",
      description: "Adobe Creative Cloud",
      vatRate: 0.15,
      daysToDue: 14,
    })
  })

  it("returns nulls for missing fields — a rule referencing them must silent-pass", () => {
    const ctx = buildWarnCheckContext({
      document: makeDocument({ fieldSnapshot: {} }),
      supplier: null,
      now,
    })
    expect(ctx.total).toBeNull()
    expect(ctx.currency).toBeNull()
    expect(ctx.description).toBeNull()
    expect(ctx.daysToDue).toBeNull()
    expect(ctx.supplierKnown).toBe(false)
  })

  it("parses numeric strings coming out of extraction", () => {
    const ctx = buildWarnCheckContext({
      document: makeDocument({ fieldSnapshot: { total: "1,250.50" } }),
      supplier: null,
      now,
    })
    expect(ctx.total).toBe(1250.5)
  })

  it("supports either dueDate | due_date | due in the snapshot", () => {
    for (const key of ["dueDate", "due_date", "due"] as const) {
      const ctx = buildWarnCheckContext({
        document: makeDocument({ fieldSnapshot: { [key]: "2026-09-18T00:00:00Z" } }),
        supplier: null,
        now,
      })
      expect(ctx.daysToDue).toBe(7)
    }
  })
})

describe("evaluateAllChecks", () => {
  const ctx = {
    total: 1500,
    currency: "USD",
    supplierKnown: false,
    category: "software",
    description: "Adobe",
    vatRate: 0.15,
    daysToDue: -3,
  } as const

  it("fires and passes each rule independently", () => {
    const outcomes = evaluateAllChecks(
      [
        { id: "1", name: "big and unknown", whenExpr: "total > 1000 and not supplierKnown", message: "Verify supplier" },
        { id: "2", name: "overdue rent", whenExpr: 'daysToDue < 0 and category == "rent"', message: "Rent overdue" },
      ],
      ctx,
    )
    expect(outcomes).toEqual([
      { checkId: "1", name: "big and unknown", status: "fired", message: "Verify supplier" },
      { checkId: "2", name: "overdue rent", status: "passed" },
    ])
  })

  it("marks an unparseable rule as errored without touching the others", () => {
    const outcomes = evaluateAllChecks(
      [
        { id: "1", name: "broken", whenExpr: "total > > 5", message: "" },
        { id: "2", name: "ok", whenExpr: "total > 500", message: "Large" },
      ],
      ctx,
    )
    expect(outcomes[0].status).toBe("errored")
    expect(outcomes[1].status).toBe("fired")
  })

  it("marks a type-error rule as errored", () => {
    const outcomes = evaluateAllChecks(
      [{ id: "1", name: "bad", whenExpr: 'currency < "USD"', message: "" }],
      ctx,
    )
    expect(outcomes[0].status).toBe("errored")
    if (outcomes[0].status === "errored") {
      expect(outcomes[0].error).toContain("eval:")
    }
  })
})

describe("createWarnChecksGateRunner", () => {
  const now = new Date("2026-09-11T00:00:00Z")
  const nowFn = () => now
  let logSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    logSpy = vi.spyOn(console, "error").mockImplementation(() => {})
  })
  afterEach(() => {
    logSpy.mockRestore()
  })

  const supplierUnknown = async () => null
  const supplierKnown = async () => ({ id: "sup-1" }) as LoadedSupplier

  it("is a silent pass for non-invoice documents", async () => {
    const runner = createWarnChecksGateRunner({
      loadEnabledChecks: async () => [{ id: "1", name: "n", whenExpr: "total > 0", message: "m" }],
      loadSupplier: supplierUnknown,
      now: nowFn,
    })
    const verdict = await runner.run(makeCtx({ docType: "receipt" }))
    expect(verdict).toEqual({ blocked: false })
  })

  it("is a silent pass with no enabled rules", async () => {
    const runner = createWarnChecksGateRunner({
      loadEnabledChecks: async () => [],
      loadSupplier: supplierUnknown,
      now: nowFn,
    })
    const verdict = await runner.run(makeCtx())
    expect(verdict).toEqual({ blocked: false })
  })

  it("blocks soft with the list of matched rules when any fire", async () => {
    const runner = createWarnChecksGateRunner({
      loadEnabledChecks: async () => [
        { id: "1", name: "big and unknown", whenExpr: "total > 50 and not supplierKnown", message: "Verify" },
        { id: "2", name: "eur only", whenExpr: 'currency == "EUR"', message: "Only EUR" },
      ],
      loadSupplier: supplierUnknown,
      now: nowFn,
    })
    const verdict = await runner.run(
      makeCtx({ fieldSnapshot: { total: 100, currency: "USD", vendor: "New Vendor" } }),
    )
    expect(verdict.blocked).toBe(true)
    if (verdict.blocked) {
      expect(verdict.severity).toBe("soft")
      expect(verdict.payload).toEqual({
        matches: [{ checkId: "1", name: "big and unknown", message: "Verify" }],
      })
    }
  })

  it("uses the loaded supplier to fill supplierKnown", async () => {
    const runner = createWarnChecksGateRunner({
      loadEnabledChecks: async () => [
        { id: "1", name: "unknown vendor", whenExpr: "not supplierKnown", message: "unknown" },
      ],
      loadSupplier: supplierKnown,
      now: nowFn,
    })
    const verdict = await runner.run(
      makeCtx({ fieldSnapshot: { total: 100, vendor: "Known Vendor" } }),
    )
    expect(verdict).toEqual({ blocked: false })
  })

  it("logs an errored rule but does not block on its account", async () => {
    const runner = createWarnChecksGateRunner({
      loadEnabledChecks: async () => [
        { id: "1", name: "broken", whenExpr: "total > > 5", message: "" },
      ],
      loadSupplier: supplierUnknown,
      now: nowFn,
    })
    const verdict = await runner.run(makeCtx())
    expect(verdict).toEqual({ blocked: false })
    expect(logSpy).toHaveBeenCalledOnce()
    const logMessage = String(logSpy.mock.calls[0][0])
    expect(logMessage).toContain("warn-checks")
    expect(logMessage).toContain("broken")
  })

  it("skips the supplier lookup entirely when no vendor was extracted", async () => {
    const loadSupplier = vi.fn(supplierKnown)
    const runner = createWarnChecksGateRunner({
      loadEnabledChecks: async () => [
        { id: "1", name: "big", whenExpr: "total > 50", message: "big" },
      ],
      loadSupplier,
      now: nowFn,
    })
    await runner.run(makeCtx({ fieldSnapshot: { total: 100 } }))
    expect(loadSupplier).not.toHaveBeenCalled()
  })
})
