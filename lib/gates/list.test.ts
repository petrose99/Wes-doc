import { describe, expect, it, vi, beforeEach } from "vitest"

const findMany = vi.fn()

vi.mock("@/lib/db", () => ({
  prisma: { gate: { findMany } },
}))

const { listOpenGatesForDocument, listOpenGatesForDocuments, overrideEligibility, HARD_GATE_OVERRIDE_REFUSAL_REASON } = await import("@/lib/gates/list")

const rowStub = (over: Partial<Record<string, unknown>> = {}) => ({
  id: "g1", documentId: "d1", gateType: "match-variance", severity: "soft", firedAt: new Date("2026-01-01T00:00:00Z"), payload: null,
  ...over,
})

beforeEach(() => {
  findMany.mockReset()
})

describe("overrideEligibility", () => {
  it("refuses a hard gate with an explanatory reason", () => {
    const result = overrideEligibility("hard")
    expect(result.overridable).toBe(false)
    expect(!result.overridable && result.reason).toBe(HARD_GATE_OVERRIDE_REFUSAL_REASON)
  })

  it("allows a soft gate", () => {
    expect(overrideEligibility("soft")).toEqual({ overridable: true })
  })

  it("treats any severity other than the literal string 'hard' as overridable — never silently blocks on a typo or unknown value", () => {
    expect(overrideEligibility("Hard")).toEqual({ overridable: true })
    expect(overrideEligibility("")).toEqual({ overridable: true })
  })
})

describe("listOpenGatesForDocument", () => {
  it("queries only blocked gates for the given document, oldest first", async () => {
    findMany.mockResolvedValue([rowStub()])
    const gates = await listOpenGatesForDocument("w1", "d1")
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { workspaceId: "w1", documentId: "d1", state: "blocked" },
      orderBy: { firedAt: "asc" },
    }))
    expect(gates).toEqual([{ id: "g1", documentId: "d1", gateType: "match-variance", severity: "soft", firedAt: rowStub().firedAt, payload: null }])
  })

  it("narrows an unexpected severity string down to the hard/soft union rather than passing it through raw", async () => {
    findMany.mockResolvedValue([rowStub({ severity: "duplicate" })])
    const [gate] = await listOpenGatesForDocument("w1", "d1")
    expect(gate.severity).toBe("soft")
  })

  it("returns an empty array when nothing is open", async () => {
    findMany.mockResolvedValue([])
    expect(await listOpenGatesForDocument("w1", "d1")).toEqual([])
  })
})

describe("listOpenGatesForDocuments", () => {
  it("groups rows by documentId", async () => {
    findMany.mockResolvedValue([
      rowStub({ id: "g1", documentId: "d1" }),
      rowStub({ id: "g2", documentId: "d1", gateType: "confidence-band" }),
      rowStub({ id: "g3", documentId: "d2", severity: "hard", gateType: "duplicate" }),
    ])
    const byDocument = await listOpenGatesForDocuments("w1", ["d1", "d2"])
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { workspaceId: "w1", documentId: { in: ["d1", "d2"] }, state: "blocked" },
    }))
    expect(byDocument.get("d1")?.map((g) => g.id)).toEqual(["g1", "g2"])
    expect(byDocument.get("d2")?.map((g) => g.id)).toEqual(["g3"])
    expect(byDocument.get("d2")?.[0].severity).toBe("hard")
  })

  it("short-circuits without a query when given no document ids", async () => {
    const byDocument = await listOpenGatesForDocuments("w1", [])
    expect(findMany).not.toHaveBeenCalled()
    expect(byDocument.size).toBe(0)
  })

  it("omits documents with no open gates from the map rather than mapping them to an empty array", async () => {
    findMany.mockResolvedValue([rowStub({ documentId: "d1" })])
    const byDocument = await listOpenGatesForDocuments("w1", ["d1", "d2"])
    expect(byDocument.has("d1")).toBe(true)
    expect(byDocument.has("d2")).toBe(false)
  })
})
