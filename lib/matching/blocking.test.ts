import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/db", () => ({ prisma: {} }))
vi.mock("@/prisma/client", () => ({ Prisma: { JsonNull: null } }))

const { candidateDocumentIds } = await import("./blocking")
const { prisma } = await import("@/lib/db")

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any

beforeEach(() => {
  vi.clearAllMocks()
  for (const key of Object.keys(db)) delete db[key]
  db.documentFieldValue = { findMany: vi.fn().mockResolvedValue([]) }
  db.document = { findMany: vi.fn().mockResolvedValue([]) }
})

describe("candidateDocumentIds", () => {
  it("returns the union of amount, date and PO blocks (deduplicated)", async () => {
    db.documentFieldValue.findMany
      .mockResolvedValueOnce([{ documentId: "d1" }, { documentId: "d2" }]) // amount
      .mockResolvedValueOnce([{ documentId: "d2" }, { documentId: "d3" }]) // date
      .mockResolvedValueOnce([{ documentId: "d4" }])                       // PO

    const result = await candidateDocumentIds({
      workspaceId: "w1", documentId: "src", amount: 100, date: "2026-08-10", poNumber: "PO-42",
    })
    expect(result.sort()).toEqual(["d1", "d2", "d3", "d4"])
  })

  it("excludes the source document from the result", async () => {
    db.documentFieldValue.findMany.mockResolvedValueOnce([{ documentId: "src" }, { documentId: "d1" }])
    const result = await candidateDocumentIds({
      workspaceId: "w1", documentId: "src", amount: 100, date: null, poNumber: null,
    })
    expect(result).toEqual(["d1"])
  })

  it("widens amount by ±2%", async () => {
    await candidateDocumentIds({ workspaceId: "w1", documentId: "src", amount: 100, date: null, poNumber: null })
    const [call] = db.documentFieldValue.findMany.mock.calls
    const where = call[0].where
    expect(where.fieldKey.in).toContain("total")
    expect(where.valueNumber.gte).toBeCloseTo(98)
    expect(where.valueNumber.lte).toBeCloseTo(102)
  })

  it("falls back to recent-200 when no blocks matched", async () => {
    // All blocks empty — trigger fallback path.
    db.documentFieldValue.findMany.mockResolvedValue([])
    db.document.findMany.mockResolvedValueOnce([{ id: "recent1" }, { id: "recent2" }])
    const result = await candidateDocumentIds({
      workspaceId: "w1", documentId: "src", amount: null, date: null, poNumber: null,
    })
    expect(result.sort()).toEqual(["recent1", "recent2"])
    expect(db.document.findMany).toHaveBeenCalledWith(expect.objectContaining({
      take: 200,
      orderBy: { receivedAt: "desc" },
    }))
  })
})
