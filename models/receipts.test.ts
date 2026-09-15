import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/db", () => ({ prisma: {} }))

const { listWorkspaceReceipts } = await import("@/models/receipts")
const { prisma } = await import("@/lib/db")

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any

beforeEach(() => {
  vi.clearAllMocks()
  for (const key of Object.keys(db)) delete db[key]
  db.document = { findMany: vi.fn().mockResolvedValue([]) }
  db.reviewTask = { findMany: vi.fn().mockResolvedValue([]) }
  db.expenseClaimItem = { findMany: vi.fn().mockResolvedValue([]) }
  db.documentAuditEvent = { findMany: vi.fn().mockResolvedValue([]) }
  db.documentCheckResult = { findMany: vi.fn().mockResolvedValue([]) }
})

describe("listWorkspaceReceipts", () => {
  it("returns an empty page when the workspace has no receipt-shape documents", async () => {
    const res = await listWorkspaceReceipts({ workspaceId: "w1" })
    expect(res.receipts).toEqual([])
  })

  it("maps extracted fields and flags a receipt blocked by an open check", async () => {
    db.document.findMany.mockResolvedValue([
      {
        id: "d1", filename: "a.pdf", status: "reviewed", reviewedAt: new Date(),
        template: { code: "receipt" },
        reviewedData: { merchant: "Corner Store", total: 42, currency_code: "USD", receipt_number: "R-1", purchase_date: "2026-08-15" },
      },
    ])
    db.reviewTask.findMany.mockResolvedValue([{ documentId: "d1", detail: "arithmetic_mismatch: totals don't add up" }])
    const res = await listWorkspaceReceipts({ workspaceId: "w1" })
    expect(res.receipts).toHaveLength(1)
    expect(res.receipts[0]).toMatchObject({
      documentId: "d1", merchant: "Corner Store", total: 42, receiptNumber: "R-1",
      blockedByCheck: true, openCheckCodes: ["arithmetic_mismatch"], claimId: null, claimStatus: null,
    })
  })

  it("marks a receipt claimed once it has an ExpenseClaimItem, carrying the claim's status", async () => {
    db.document.findMany.mockResolvedValue([
      { id: "d1", filename: "a.pdf", status: "reviewed", reviewedAt: new Date(), template: { code: "expense_receipt" }, reviewedData: {} },
    ])
    db.expenseClaimItem.findMany.mockResolvedValue([{ documentId: "d1", claim: { id: "c1", status: "submitted" } }])
    const res = await listWorkspaceReceipts({ workspaceId: "w1" })
    expect(res.receipts[0]).toMatchObject({ claimId: "c1", claimStatus: "submitted" })
  })

  it("filters by claim state", async () => {
    db.document.findMany.mockResolvedValue([
      { id: "d1", filename: "a.pdf", status: "reviewed", reviewedAt: new Date(), template: { code: "receipt" }, reviewedData: {} },
      { id: "d2", filename: "b.pdf", status: "reviewed", reviewedAt: new Date(), template: { code: "receipt" }, reviewedData: {} },
    ])
    db.expenseClaimItem.findMany.mockResolvedValue([{ documentId: "d1", claim: { id: "c1", status: "draft" } }])
    const res = await listWorkspaceReceipts({ workspaceId: "w1", claimFilter: "claimed" })
    expect(res.receipts.map((r) => r.documentId)).toEqual(["d1"])
  })

  it("times the Review SLA clock from the most recent still-open ReviewTask", async () => {
    db.document.findMany.mockResolvedValue([
      { id: "d1", filename: "a.pdf", status: "needs_review", reviewedAt: null, template: { code: "receipt" }, reviewedData: {} },
    ])
    const openedAt = new Date("2026-09-10T00:00:00Z")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db.reviewTask.findMany.mockImplementation((args: any) => {
      if (args?.where?.reason === "check_failed") return Promise.resolve([])
      return Promise.resolve([{ documentId: "d1", status: "in_review", createdAt: openedAt }])
    })
    const res = await listWorkspaceReceipts({ workspaceId: "w1" })
    expect(res.receipts[0].reviewTaskOpenedAt).toEqual(openedAt)
  })

  it("flags a receipt touchless only when it has a push.touchless_enqueued audit event", async () => {
    db.document.findMany.mockResolvedValue([
      { id: "d1", filename: "a.pdf", status: "reviewed", reviewedAt: new Date(), template: { code: "receipt" }, reviewedData: {} },
      { id: "d2", filename: "b.pdf", status: "reviewed", reviewedAt: new Date(), template: { code: "receipt" }, reviewedData: {} },
    ])
    db.documentAuditEvent.findMany.mockResolvedValue([{ documentId: "d1" }])
    const res = await listWorkspaceReceipts({ workspaceId: "w1" })
    expect(res.receipts.find((r) => r.documentId === "d1")?.touchless).toBe(true)
    expect(res.receipts.find((r) => r.documentId === "d2")?.touchless).toBe(false)
  })

  it("flags a receipt escalated only when it has an open DocumentCheckResult escalation (#223)", async () => {
    db.document.findMany.mockResolvedValue([
      { id: "d1", filename: "a.pdf", status: "reviewed", reviewedAt: new Date(), template: { code: "receipt" }, reviewedData: {} },
      { id: "d2", filename: "b.pdf", status: "reviewed", reviewedAt: new Date(), template: { code: "receipt" }, reviewedData: {} },
    ])
    db.documentCheckResult.findMany.mockResolvedValue([{ documentId: "d1" }])
    const res = await listWorkspaceReceipts({ workspaceId: "w1" })
    expect(res.receipts.find((r) => r.documentId === "d1")?.escalated).toBe(true)
    expect(res.receipts.find((r) => r.documentId === "d2")?.escalated).toBe(false)
  })

  it("derives approvalStatus from the most recent ReviewTask, defaulting to approved with none (#223)", async () => {
    db.document.findMany.mockResolvedValue([
      { id: "d1", filename: "a.pdf", status: "reviewed", reviewedAt: new Date(), template: { code: "receipt" }, reviewedData: {} },
      { id: "d2", filename: "b.pdf", status: "reviewed", reviewedAt: new Date(), template: { code: "receipt" }, reviewedData: {} },
    ])
    db.reviewTask.findMany.mockResolvedValue([{ documentId: "d1", status: "rejected", createdAt: new Date("2026-09-10T00:00:00Z") }])
    const res = await listWorkspaceReceipts({ workspaceId: "w1" })
    expect(res.receipts.find((r) => r.documentId === "d1")?.approvalStatus).toBe("rejected")
    expect(res.receipts.find((r) => r.documentId === "d2")?.approvalStatus).toBe("approved")
  })
})
