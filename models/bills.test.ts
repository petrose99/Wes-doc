import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/db", () => ({ prisma: {} }))
vi.mock("@/models/ledger-payments", () => ({ getDocumentPaymentStatuses: vi.fn().mockResolvedValue(new Map()) }))

const { listWorkspaceBills } = await import("@/models/bills")
const { prisma } = await import("@/lib/db")
const { getDocumentPaymentStatuses } = await import("@/models/ledger-payments")

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any

beforeEach(() => {
  vi.clearAllMocks()
  for (const key of Object.keys(db)) delete db[key]
  db.document = { findMany: vi.fn().mockResolvedValue([]) }
  db.reviewTask = { findMany: vi.fn().mockResolvedValue([]) }
  db.supplier = { findMany: vi.fn().mockResolvedValue([]) }
  db.documentAuditEvent = { findMany: vi.fn().mockResolvedValue([]) }
})

describe("listWorkspaceBills", () => {
  it("returns an empty page when the workspace has no invoice-shape documents", async () => {
    const res = await listWorkspaceBills({ workspaceId: "w1" })
    expect(res.bills).toEqual([])
    expect(res.summary.current).toEqual({ count: 0, total: 0 })
  })

  it("infers due-date from the supplier's payment terms when the invoice has none", async () => {
    db.document.findMany.mockResolvedValue([
      {
        id: "d1", filename: "a.pdf", status: "reviewed", reviewedAt: new Date(),
        template: { code: "invoice" },
        reviewedData: { vendor: "Acme Ltd", total: 100, currency_code: "USD", invoice_number: "INV-1", issue_date: "2026-08-15" },
      },
    ])
    db.supplier.findMany.mockResolvedValue([
      // Supplier normalizer strips "Ltd" → key is "acme".
      { id: "s1", normalizedKey: "acme", paymentTermsDays: 30 },
    ])
    const res = await listWorkspaceBills({ workspaceId: "w1", asOf: new Date("2026-09-10T00:00:00Z") })
    expect(res.bills).toHaveLength(1)
    expect(res.bills[0].dueDate?.toISOString().slice(0, 10)).toBe("2026-09-14")
    expect(res.bills[0].agingBucket).toBe("current")
    expect(res.bills[0].supplierId).toBe("s1")
  })

  it("prefers an extracted due_date over supplier terms and buckets it as overdue when past", async () => {
    db.document.findMany.mockResolvedValue([
      {
        id: "d1", filename: "a.pdf", status: "reviewed", reviewedAt: new Date(),
        template: { code: "invoice" },
        reviewedData: { vendor: "Acme Ltd", total: 500, currency_code: "USD", due_date: "2026-08-01", issue_date: "2026-07-15" },
      },
    ])
    const res = await listWorkspaceBills({ workspaceId: "w1", asOf: new Date("2026-09-10T00:00:00Z") })
    expect(res.bills[0].extractedDueDate?.toISOString().slice(0, 10)).toBe("2026-08-01")
    expect(res.bills[0].agingBucket).toBe("31-60")
    expect(res.summary["31-60"]).toEqual({ count: 1, total: 500 })
  })

  it("flags bills with an open check_failed review task as blocked-by-check", async () => {
    db.document.findMany.mockResolvedValue([
      { id: "d1", filename: "a.pdf", status: "reviewed", reviewedAt: new Date(), template: { code: "invoice" }, reviewedData: { total: 100 } },
    ])
    db.reviewTask.findMany.mockResolvedValue([
      { documentId: "d1", detail: "bank_detail_change: IBAN changed" },
    ])
    const res = await listWorkspaceBills({ workspaceId: "w1" })
    expect(res.bills[0].blockedByCheck).toBe(true)
    expect(res.bills[0].openCheckCodes).toEqual(["bank_detail_change"])
  })

  it("onlyBlocked filters out bills without any open check task", async () => {
    db.document.findMany.mockResolvedValue([
      { id: "d1", filename: "a.pdf", status: "reviewed", reviewedAt: new Date(), template: { code: "invoice" }, reviewedData: { total: 100 } },
      { id: "d2", filename: "b.pdf", status: "reviewed", reviewedAt: new Date(), template: { code: "invoice" }, reviewedData: { total: 200 } },
    ])
    db.reviewTask.findMany.mockResolvedValue([{ documentId: "d1", detail: "duplicate: exact" }])
    const res = await listWorkspaceBills({ workspaceId: "w1", onlyBlocked: true })
    expect(res.bills.map((b) => b.documentId)).toEqual(["d1"])
  })

  it("times the Review SLA clock from the most recent still-open ReviewTask of any reason", async () => {
    db.document.findMany.mockResolvedValue([
      { id: "d1", filename: "a.pdf", status: "needs_review", reviewedAt: null, template: { code: "invoice" }, reviewedData: { total: 100 } },
    ])
    const openedAt = new Date("2026-09-10T00:00:00Z")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db.reviewTask.findMany.mockImplementation((args: any) => {
      if (args?.where?.reason === "check_failed") return Promise.resolve([])
      return Promise.resolve([{ documentId: "d1", status: "open", createdAt: openedAt }])
    })
    const res = await listWorkspaceBills({ workspaceId: "w1" })
    expect(res.bills[0].approvalStatus).toBe("not_started")
    expect(res.bills[0].reviewTaskOpenedAt).toEqual(openedAt)
  })

  it("leaves reviewTaskOpenedAt null once the latest ReviewTask has resolved", async () => {
    db.document.findMany.mockResolvedValue([
      { id: "d1", filename: "a.pdf", status: "reviewed", reviewedAt: new Date(), template: { code: "invoice" }, reviewedData: { total: 100 } },
    ])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db.reviewTask.findMany.mockImplementation((args: any) => {
      if (args?.where?.reason === "check_failed") return Promise.resolve([])
      return Promise.resolve([{ documentId: "d1", status: "approved", createdAt: new Date("2026-09-10T00:00:00Z") }])
    })
    const res = await listWorkspaceBills({ workspaceId: "w1" })
    expect(res.bills[0].approvalStatus).toBe("approved")
    expect(res.bills[0].reviewTaskOpenedAt).toBeNull()
  })

  it("carries the ledger payment status when a bill has been synced", async () => {
    db.document.findMany.mockResolvedValue([
      { id: "d1", filename: "a.pdf", status: "reviewed", reviewedAt: new Date(), template: { code: "invoice" }, reviewedData: { total: 100 } },
    ])
    vi.mocked(getDocumentPaymentStatuses).mockResolvedValue(
      new Map([["d1", { paymentStatus: "paid", dueAmount: 0, paidAmount: 100, syncedAt: new Date() }]]),
    )
    const res = await listWorkspaceBills({ workspaceId: "w1" })
    expect(res.bills[0].paymentStatus).toBe("paid")
    expect(res.bills[0].paidAmount).toBe(100)
  })

  it("flags a bill touchless only when it has a push.touchless_enqueued audit event", async () => {
    db.document.findMany.mockResolvedValue([
      { id: "d1", filename: "a.pdf", status: "reviewed", reviewedAt: new Date(), template: { code: "invoice" }, reviewedData: { total: 100 } },
      { id: "d2", filename: "b.pdf", status: "reviewed", reviewedAt: new Date(), template: { code: "invoice" }, reviewedData: { total: 200 } },
    ])
    db.documentAuditEvent.findMany.mockResolvedValue([{ documentId: "d1" }])
    const res = await listWorkspaceBills({ workspaceId: "w1" })
    expect(res.bills.find((b) => b.documentId === "d1")?.touchless).toBe(true)
    expect(res.bills.find((b) => b.documentId === "d2")?.touchless).toBe(false)
  })
})
