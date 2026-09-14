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
})
