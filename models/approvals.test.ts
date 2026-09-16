import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/db", () => ({ prisma: {} }))

const { listApprovalInvoiceRows, listPoMismatchRows, countReadyToApprove } = await import("@/models/approvals")
const { prisma } = await import("@/lib/db")

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any

const STAGE = { stageIndex: 0, name: "Owner sign-off", requireOwner: true, approverIds: [], minAmount: null }
const OWNER = { userId: "owner-1", role: "owner" }
const MEMBER = { userId: "member-1", role: "member" }

function task(overrides: Record<string, unknown> = {}) {
  return {
    id: "task-1",
    documentId: "doc-1",
    currentStageIndex: 0,
    updatedAt: new Date("2026-09-10T00:00:00Z"),
    workflow: { stages: [STAGE] },
    document: {
      id: "doc-1", filename: "invoice.pdf", reviewedData: { vendor: "Acme", invoice_number: "INV-1", total: 1000, currency_code: "USD" },
      cancelledAt: null, template: { code: "invoice" },
    },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  for (const key of Object.keys(db)) delete db[key]
  db.reviewTask = { findMany: vi.fn().mockResolvedValue([task()]) }
  db.gate = { findMany: vi.fn().mockResolvedValue([]) }
  db.documentCheckResult = { findMany: vi.fn().mockResolvedValue([]) }
  db.workspaceMember = { findMany: vi.fn().mockResolvedValue([OWNER, MEMBER]) }
})

describe("listApprovalInvoiceRows", () => {
  it("reads a ready row for a decidable, unblocked stage", async () => {
    const rows = await listApprovalInvoiceRows("w1", { userId: "owner-1", role: "owner" })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      documentId: "doc-1", supplier: "Acme", invoiceNumber: "INV-1", total: 1000,
      stage: { index: 0, total: 1, name: "Owner sign-off" }, canDecide: true, eligibility: { status: "ready" },
    })
  })

  it("canDecide is false for an actor the stage doesn't name", async () => {
    const rows = await listApprovalInvoiceRows("w1", { userId: "member-1", role: "member" })
    expect(rows[0].canDecide).toBe(false)
  })

  it("reads not_eligible when a hard gate is blocked on the document", async () => {
    db.gate.findMany.mockResolvedValue([{ id: "g1", documentId: "doc-1", gateType: "duplicate", severity: "hard", firedAt: new Date(), payload: null }])
    const rows = await listApprovalInvoiceRows("w1", OWNER)
    expect(rows[0].eligibility).toEqual({ status: "not_eligible", reason: "A hard check failed on this invoice." })
  })

  it("reads not_eligible when an exception is open on the document", async () => {
    db.documentCheckResult.findMany.mockResolvedValue([{ documentId: "doc-1" }])
    const rows = await listApprovalInvoiceRows("w1", OWNER)
    expect(rows[0].eligibility).toEqual({ status: "not_eligible", reason: "An exception is open on this invoice." })
  })

  it("reads no_approver when the stage names approvers who are no longer members", async () => {
    db.reviewTask.findMany.mockResolvedValue([task({ workflow: { stages: [{ ...STAGE, requireOwner: false, approverIds: ["ghost"] }] } })])
    const rows = await listApprovalInvoiceRows("w1", OWNER)
    expect(rows[0].eligibility).toEqual({ status: "no_approver" })
  })

  it("excludes a cancelled invoice", async () => {
    db.reviewTask.findMany.mockResolvedValue([task({ document: { ...task().document, cancelledAt: new Date() } })])
    expect(await listApprovalInvoiceRows("w1", OWNER)).toHaveLength(0)
  })

  it("excludes a non-invoice document", async () => {
    db.reviewTask.findMany.mockResolvedValue([task({ document: { ...task().document, template: { code: "purchase_order" } } })])
    expect(await listApprovalInvoiceRows("w1", OWNER)).toHaveLength(0)
  })
})

describe("listPoMismatchRows", () => {
  it("is empty when no match-variance gate is open", async () => {
    expect(await listPoMismatchRows("w1", OWNER)).toHaveLength(0)
  })

  it("reads one row per invoice with an open match-variance gate", async () => {
    db.gate.findMany.mockResolvedValue([{
      id: "g1", documentId: "doc-1", gateType: "match-variance", severity: "soft", firedAt: new Date(),
      payload: { matchType: "2-way", variance: 600, threshold: 500, percent: 0.02, floor: { amount: 500 }, anchorTotal: 950, invoiceTotal: 1000, poDocumentId: "po-1" },
    }])
    db.reviewTask.findMany.mockResolvedValue([task({ document: { ...task().document, reviewedData: { ...task().document.reviewedData, po_number: "PO-9" } } })])
    const rows = await listPoMismatchRows("w1", OWNER)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ gateId: "g1", poNumber: "PO-9", invoiceTotal: 1000, poTotal: 950, variance: 600, threshold: 500, matchType: "2-way", eligibility: { status: "ready" } })
  })

  it("a soft match-variance gate alone does not make the row not_eligible", async () => {
    db.gate.findMany.mockResolvedValue([{
      id: "g1", documentId: "doc-1", gateType: "match-variance", severity: "soft", firedAt: new Date(),
      payload: { matchType: "2-way", variance: 600, threshold: 500, anchorTotal: 950, invoiceTotal: 1000 },
    }])
    const rows = await listPoMismatchRows("w1", OWNER)
    expect(rows[0].eligibility).toEqual({ status: "ready" })
  })
})

describe("countReadyToApprove", () => {
  it("counts a decidable, eligible task once even though it also has a PO mismatch", async () => {
    db.gate.findMany.mockResolvedValue([{
      id: "g1", documentId: "doc-1", gateType: "match-variance", severity: "soft", firedAt: new Date(),
      payload: { matchType: "2-way", variance: 600, threshold: 500, anchorTotal: 950, invoiceTotal: 1000 },
    }])
    expect(await countReadyToApprove("w1", OWNER)).toBe(1)
  })

  it("never counts a row the actor cannot decide", async () => {
    expect(await countReadyToApprove("w1", MEMBER)).toBe(0)
  })

  it("never counts a not-eligible row", async () => {
    db.documentCheckResult.findMany.mockResolvedValue([{ documentId: "doc-1" }])
    expect(await countReadyToApprove("w1", OWNER)).toBe(0)
  })
})
