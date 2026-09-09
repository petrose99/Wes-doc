import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/db", () => ({ prisma: {} }))

const { computeContentHash, projectStatementLines } = await import("@/models/statement-lines")
const { prisma } = await import("@/lib/db")

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any

beforeEach(() => {
  for (const key of Object.keys(db)) delete db[key]
  db.statementLine = {
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn(async ({ data }: { data: unknown }) => data),
    update: vi.fn(),
    delete: vi.fn(),
  }
  db.bankMatch = { findMany: vi.fn().mockResolvedValue([]) }
})

const line = (over: Partial<Parameters<typeof computeContentHash>[0]> = {}) => ({
  lineIndex: 0,
  txnDate: new Date("2026-08-10"),
  amount: 100,
  currencyCode: "USD",
  description: "Payment to ACME",
  counterparty: null,
  direction: "debit" as const,
  ...over,
})

describe("computeContentHash", () => {
  it("is stable across whitespace and case in the description", () => {
    const a = computeContentHash(line({ description: "Payment to ACME" }))
    const b = computeContentHash(line({ description: "  payment  TO   acme  " }))
    expect(a).toBe(b)
  })
  it("changes when the amount changes by a cent", () => {
    expect(computeContentHash(line({ amount: 100 }))).not.toBe(computeContentHash(line({ amount: 100.01 })))
  })
  it("changes when the date changes", () => {
    expect(computeContentHash(line({ txnDate: new Date("2026-08-10") }))).not.toBe(
      computeContentHash(line({ txnDate: new Date("2026-08-11") })),
    )
  })
})

describe("projectStatementLines", () => {
  it("upserts fresh rows on first projection", async () => {
    const lines = [line({ lineIndex: 0 }), line({ lineIndex: 1, description: "Refund" })]
    const result = await projectStatementLines("w1", "stmt1", lines)
    expect(result.upserted).toBe(2)
    expect(db.statementLine.create).toHaveBeenCalledTimes(2)
    expect(db.statementLine.delete).not.toHaveBeenCalled()
  })

  it("suffixes duplicate hashes so uniqueness holds", async () => {
    const dup = line({ lineIndex: 0 })
    const dup2 = line({ lineIndex: 1 })
    await projectStatementLines("w1", "stmt1", [dup, dup2])
    const createCalls = (db.statementLine.create as ReturnType<typeof vi.fn>).mock.calls
    const hashes = createCalls.map((c) => (c[0] as { data: { contentHash: string } }).data.contentHash)
    expect(new Set(hashes).size).toBe(2)
    expect(hashes[1]).toMatch(/-2$/)
  })

  it("keeps a vanished line orphaned (lineIndex -1) when an accepted match still references it", async () => {
    const orphan = { id: "sl1", contentHash: computeContentHash(line({ lineIndex: 0 })), lineIndex: 0 }
    db.statementLine.findMany.mockResolvedValueOnce([orphan])
    db.bankMatch.findMany.mockResolvedValueOnce([{ statementLineId: "sl1" }])
    const result = await projectStatementLines("w1", "stmt1", []) // every existing line vanished
    expect(result.orphaned).toBe(1)
    expect(result.deleted).toBe(0)
    expect(db.statementLine.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "sl1" }, data: { lineIndex: -1 } }))
    expect(db.statementLine.delete).not.toHaveBeenCalled()
  })

  it("deletes a vanished line when nothing accepted references it", async () => {
    const gone = { id: "sl2", contentHash: computeContentHash(line({ lineIndex: 0 })), lineIndex: 0 }
    db.statementLine.findMany.mockResolvedValueOnce([gone])
    db.bankMatch.findMany.mockResolvedValueOnce([])
    const result = await projectStatementLines("w1", "stmt1", [])
    expect(result.deleted).toBe(1)
    expect(db.statementLine.delete).toHaveBeenCalledWith({ where: { id: "sl2" } })
  })
})
