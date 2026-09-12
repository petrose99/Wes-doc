import { describe, expect, it, vi, beforeEach } from "vitest"

vi.mock("next/headers", () => ({
  headers: vi.fn(() => { throw new Error("no request scope") }),
}))

const gateFindMany = vi.fn()
const gateUpdate = vi.fn()
const gateFindUnique = vi.fn()
const auditCreate = vi.fn()

vi.mock("@/lib/db", () => ({
  prisma: {
    gate: { findMany: gateFindMany, update: gateUpdate, findUnique: gateFindUnique },
    auditEvent: { create: auditCreate },
    document: { findMany: vi.fn() },
  },
}))

const {
  createDuplicateGateRunner,
  resolveDuplicateGatesAgainst,
  duplicateGateRunner,
  DUPLICATE_GATE_TYPE,
} = await import("@/lib/gates/duplicate")

import type { GateContext } from "@/lib/gates/types"

function ctx(over: Partial<GateContext["document"]> = {}): GateContext {
  return {
    workspaceId: "w1",
    documentId: "d1",
    document: {
      id: "d1",
      workspaceId: "w1",
      docType: "invoice",
      receivedAt: new Date("2026-01-15"),
      fieldSnapshot: {
        vendor: "Acme Supplies",
        invoice_number: "INV-100",
        total: 500,
        issue_date: "2026-01-10",
      },
      ...over,
    },
  }
}

beforeEach(() => {
  gateFindMany.mockReset()
  gateUpdate.mockReset()
  gateFindUnique.mockReset()
  auditCreate.mockReset()
})

describe("duplicateGateRunner", () => {
  it("exports the kebab-case gateType the registry indexes by", () => {
    expect(duplicateGateRunner.gateType).toBe(DUPLICATE_GATE_TYPE)
    expect(DUPLICATE_GATE_TYPE).toBe("duplicate")
  })

  it("passes when there are no other documents at all — the rule needs a counterpart", async () => {
    const runner = createDuplicateGateRunner({ findCandidates: async () => [] })
    expect(await runner.run(ctx())).toEqual({ blocked: false })
  })

  it("passes on a non-invoice docType — a bank statement or receipt is not a bill", async () => {
    const runner = createDuplicateGateRunner({ findCandidates: async () => { throw new Error("must not query") } })
    expect(await runner.run(ctx({ docType: "bank_statement" }))).toEqual({ blocked: false })
    expect(await runner.run(ctx({ docType: null as unknown as string | undefined }))).toEqual({ blocked: false })
  })

  it("passes when the supplier is missing — nothing to anchor the rule on", async () => {
    const runner = createDuplicateGateRunner({ findCandidates: async () => [{ id: "d2", fieldSnapshot: { vendor: "Acme Supplies", invoice_number: "INV-100" } }] })
    expect(await runner.run(ctx({ fieldSnapshot: { invoice_number: "INV-100", total: 500, issue_date: "2026-01-10" } }))).toEqual({ blocked: false })
  })

  it("passes when neither branch has any facts: no invoice-number AND missing total-or-date", async () => {
    const runner = createDuplicateGateRunner({ findCandidates: async () => { throw new Error("must not query") } })
    expect(await runner.run(ctx({ fieldSnapshot: { vendor: "Acme Supplies" } }))).toEqual({ blocked: false })
  })

  it("blocks on same supplier + same normalized invoice-number — the strong branch", async () => {
    const runner = createDuplicateGateRunner({
      findCandidates: async () => [
        { id: "d2", fieldSnapshot: { vendor: "ACME SUPPLIES", invoice_number: "inv 100", total: 999, issue_date: "2026-09-01" } },
      ],
    })
    const verdict = await runner.run(ctx())
    expect(verdict).toEqual({
      blocked: true,
      severity: "hard",
      payload: expect.objectContaining({ matchedDocumentId: "d2", reason: "invoice_number" }),
    })
  })

  it("does NOT match on invoice-number when the supplier normalizes to something different", async () => {
    const runner = createDuplicateGateRunner({
      findCandidates: async () => [
        { id: "d2", fieldSnapshot: { vendor: "Bravo Ltd", invoice_number: "INV-100", total: 500, issue_date: "2026-01-10" } },
      ],
    })
    expect(await runner.run(ctx())).toEqual({ blocked: false })
  })

  it("blocks on same supplier + same total + same day — the total+date branch", async () => {
    const runner = createDuplicateGateRunner({
      findCandidates: async () => [
        { id: "d3", fieldSnapshot: { vendor: "Acme Supplies", invoice_number: "OTHER-999", total: 500, issue_date: "2026-01-10" } },
      ],
    })
    const verdict = await runner.run(ctx())
    expect(verdict).toMatchObject({
      blocked: true,
      severity: "hard",
      payload: { matchedDocumentId: "d3", reason: "total_and_date" },
    })
  })

  it("blocks on total+date within the ±3 day window", async () => {
    const runner = createDuplicateGateRunner({
      findCandidates: async () => [
        { id: "d4", fieldSnapshot: { vendor: "Acme Supplies", invoice_number: "OTHER-1", total: 500, issue_date: "2026-01-13" } },
      ],
    })
    expect(await runner.run(ctx())).toMatchObject({ blocked: true, payload: { matchedDocumentId: "d4", reason: "total_and_date" } })
  })

  it("passes when total+date is 4 days apart — one day past the tolerance", async () => {
    const runner = createDuplicateGateRunner({
      findCandidates: async () => [
        { id: "d5", fieldSnapshot: { vendor: "Acme Supplies", invoice_number: "OTHER-2", total: 500, issue_date: "2026-01-14" } },
      ],
    })
    expect(await runner.run(ctx())).toEqual({ blocked: false })
  })

  it("skips the total+date branch when the incoming bill has no date", async () => {
    const runner = createDuplicateGateRunner({
      findCandidates: async () => [
        { id: "d6", fieldSnapshot: { vendor: "Acme Supplies", invoice_number: "OTHER-3", total: 500, issue_date: "2026-01-10" } },
      ],
    })
    expect(await runner.run(ctx({ fieldSnapshot: { vendor: "Acme Supplies", invoice_number: "INV-999", total: 500 } }))).toEqual({ blocked: false })
  })

  it("does not match a candidate that is the same document as the arriving one", async () => {
    const runner = createDuplicateGateRunner({
      findCandidates: async () => [
        { id: "d1", fieldSnapshot: { vendor: "Acme Supplies", invoice_number: "INV-100", total: 500, issue_date: "2026-01-10" } },
      ],
    })
    expect(await runner.run(ctx())).toEqual({ blocked: false })
  })

  it("prefers the invoice-number branch payload when both branches could match the same candidate", async () => {
    const runner = createDuplicateGateRunner({
      findCandidates: async () => [
        { id: "d7", fieldSnapshot: { vendor: "Acme Supplies", invoice_number: "INV-100", total: 500, issue_date: "2026-01-11" } },
      ],
    })
    const verdict = await runner.run(ctx())
    expect(verdict).toMatchObject({ blocked: true, payload: { reason: "invoice_number", matchedDocumentId: "d7" } })
  })
})

describe("resolveDuplicateGatesAgainst", () => {
  it("resolves every blocked duplicate gate whose payload.matchedDocumentId is the deleted document", async () => {
    gateFindMany.mockResolvedValue([{ id: "g1" }, { id: "g2" }])
    gateFindUnique.mockResolvedValueOnce({ id: "g1", workspaceId: "w1", documentId: "d1", gateType: "duplicate", state: "blocked" })
    gateFindUnique.mockResolvedValueOnce({ id: "g2", workspaceId: "w1", documentId: "d3", gateType: "duplicate", state: "blocked" })
    gateUpdate.mockResolvedValueOnce({ id: "g1", workspaceId: "w1", documentId: "d1", gateType: "duplicate", state: "resolved" })
    gateUpdate.mockResolvedValueOnce({ id: "g2", workspaceId: "w1", documentId: "d3", gateType: "duplicate", state: "resolved" })

    const result = await resolveDuplicateGatesAgainst("d2")

    expect(result).toEqual({ resolved: 2 })
    expect(gateFindMany).toHaveBeenCalledWith({
      where: {
        gateType: "duplicate",
        state: "blocked",
        payload: { path: ["matchedDocumentId"], equals: "d2" },
      },
      select: { id: true },
    })
    expect(gateUpdate).toHaveBeenCalledTimes(2)
    expect(auditCreate).toHaveBeenCalledTimes(2)
    for (const call of auditCreate.mock.calls) {
      expect(call[0].data.type).toBe("gate.resolved")
      expect(call[0].data.actorId).toBeNull()
    }
  })

  it("no-ops when nothing was pointing at the deleted document", async () => {
    gateFindMany.mockResolvedValue([])
    const result = await resolveDuplicateGatesAgainst("d99")
    expect(result).toEqual({ resolved: 0 })
    expect(gateUpdate).not.toHaveBeenCalled()
    expect(auditCreate).not.toHaveBeenCalled()
  })
})
