import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/db", () => ({ prisma: {} }))
vi.mock("@/prisma/client", () => ({ Prisma: { JsonNull: null } }))
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }))
vi.mock("@/models/review-tasks", () => ({ createReviewTask: vi.fn() }))
vi.mock("@/lib/matching/resolve", () => ({ resolveDocumentMatches: vi.fn() }))

const { runDocumentMatching } = await import("@/models/document-matches")
const { prisma } = await import("@/lib/db")
const { track } = await import("@/lib/analytics")
const { createReviewTask } = await import("@/models/review-tasks")
const { resolveDocumentMatches } = await import("@/lib/matching/resolve")

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const resolve = resolveDocumentMatches as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  for (const key of Object.keys(db)) delete db[key]
  db.documentCheckResult = { upsert: vi.fn(), deleteMany: vi.fn() }
  db.reviewTask = { findFirst: vi.fn().mockResolvedValue(null) }
})

describe("runDocumentMatching", () => {
  it("clears any stale discrepancy row when the matcher returns no discrepancies", async () => {
    resolve.mockResolvedValue([
      { sourceId: "d1", targetId: "d2", matchType: "po_to_invoice", confidence: 0.95, discrepancies: [] },
    ])
    await runDocumentMatching({ workspaceId: "w1", documentId: "d1" })
    expect(db.documentCheckResult.deleteMany).toHaveBeenCalledWith({
      where: { documentId: "d1", checkCode: "three_way_match_discrepancy" },
    })
    expect(db.documentCheckResult.upsert).not.toHaveBeenCalled()
    expect(createReviewTask).not.toHaveBeenCalled()
  })

  it("upserts a warn check + opens one review task when a match has discrepancies", async () => {
    resolve.mockResolvedValue([
      {
        sourceId: "d1",
        targetId: "d2",
        matchType: "po_to_invoice",
        confidence: 0.7,
        discrepancies: [{ field: "amount", expected: "100", actual: "110" }],
      },
    ])
    await runDocumentMatching({ workspaceId: "w1", documentId: "d1" })
    expect(db.documentCheckResult.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { documentId_checkCode: { documentId: "d1", checkCode: "three_way_match_discrepancy" } },
        create: expect.objectContaining({ status: "warn", checkCode: "three_way_match_discrepancy" }),
      }),
    )
    expect(track).toHaveBeenCalledWith(
      "document_check_failed",
      { documentId: "d1", checkCode: "three_way_match_discrepancy", status: "warn" },
      { workspaceId: "w1" },
    )
    expect(createReviewTask).toHaveBeenCalledTimes(1)
  })

  it("does not open a second review task when one is already open for the same check", async () => {
    resolve.mockResolvedValue([
      {
        sourceId: "d1",
        targetId: "d2",
        matchType: "po_to_invoice",
        confidence: 0.7,
        discrepancies: [{ field: "amount", expected: "100", actual: "110" }],
      },
    ])
    db.reviewTask.findFirst.mockResolvedValue({ id: "existing" })
    await runDocumentMatching({ workspaceId: "w1", documentId: "d1" })
    expect(createReviewTask).not.toHaveBeenCalled()
  })

  it("swallows an internal error rather than throwing past the caller", async () => {
    resolve.mockRejectedValue(new Error("boom"))
    await expect(runDocumentMatching({ workspaceId: "w1", documentId: "d1" })).resolves.toEqual([])
  })
})
