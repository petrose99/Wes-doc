import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/db", () => ({ prisma: {} }))

const { listOpenExceptions, countOpenExceptions } = await import("@/models/exceptions")
const { prisma } = await import("@/lib/db")

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any

beforeEach(() => {
  vi.clearAllMocks()
  for (const key of Object.keys(db)) delete db[key]
  db.documentCheckResult = { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) }
})

describe("listOpenExceptions", () => {
  it("returns an empty list when there are no escalated checks", async () => {
    expect(await listOpenExceptions("w1")).toEqual([])
  })

  it("projects vendor/amount off the document's reviewedData and defaults a null escalationStatus to open", async () => {
    db.documentCheckResult.findMany.mockResolvedValue([
      {
        id: "c1", documentId: "d1", checkCode: "invoice_arithmetic", message: "Totals do not add up",
        escalationStatus: null, updatedAt: new Date("2026-09-15T00:00:00Z"),
        escalationAssignee: null,
        document: { filename: "acme.pdf", docType: "invoice", reviewedData: { vendor: "Acme Ltd", total: 250, currency_code: "USD" } },
      },
    ])
    const rows = await listOpenExceptions("w1")
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      id: "c1", documentId: "d1", checkCode: "invoice_arithmetic", message: "Totals do not add up",
      vendor: "Acme Ltd", amount: 250, currencyCode: "USD",
      docTypeLabel: "Invoice", escalationStatus: "open", assigneeId: null, assigneeName: null,
    })
  })

  it("carries the assignee through when one is set", async () => {
    db.documentCheckResult.findMany.mockResolvedValue([
      {
        id: "c2", documentId: "d2", checkCode: "statement_balance", message: "Balance mismatch",
        escalationStatus: "in_review", updatedAt: new Date(),
        escalationAssignee: { id: "u1", name: "Alex Reviewer", email: "alex@example.com" },
        document: { filename: "statement.pdf", docType: "bank_statement", reviewedData: {} },
      },
    ])
    const rows = await listOpenExceptions("w1")
    expect(rows[0]).toMatchObject({ escalationStatus: "in_review", assigneeId: "u1", assigneeName: "Alex Reviewer" })
  })

  it("falls back to the filename when no vendor/merchant/supplier field is present", async () => {
    db.documentCheckResult.findMany.mockResolvedValue([
      {
        id: "c3", documentId: "d3", checkCode: "duplicate", message: "Possible duplicate",
        escalationStatus: "open", updatedAt: new Date(), escalationAssignee: null,
        document: { filename: "unlabeled.pdf", docType: null, reviewedData: null },
      },
    ])
    const rows = await listOpenExceptions("w1")
    expect(rows[0].vendor).toBeNull()
    expect(rows[0].docTypeLabel).toBe("Document")
  })
})

describe("countOpenExceptions", () => {
  it("delegates to a count scoped to open/in_review (or unset) escalations", async () => {
    db.documentCheckResult.count.mockResolvedValue(3)
    expect(await countOpenExceptions("w1")).toBe(3)
    expect(db.documentCheckResult.count).toHaveBeenCalledWith({
      where: { workspaceId: "w1", status: "escalated", OR: [{ escalationStatus: null }, { escalationStatus: { in: ["open", "in_review"] } }] },
    })
  })
})
