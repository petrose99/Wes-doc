import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/db", () => ({ prisma: {} }))
vi.mock("@/lib/audit", () => ({ recordDocumentAudit: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/models/company-currency", () => ({ recordCurrencyLock: vi.fn().mockResolvedValue(undefined) }))

const { rejectPaymentBatch } = await import("@/models/payment-batches")
const { prisma } = await import("@/lib/db")
const { recordDocumentAudit } = await import("@/lib/audit")

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any

function batch(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "run1", status: "pending_approval", name: "Batch 1", submittedById: "u1", exportedAt: null,
    items: [{ documentId: "d1", expenseClaimId: null, amount: 100, currencyCode: "ZAR" }],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  for (const key of Object.keys(db)) delete db[key]
  db.paymentRun = { findFirst: vi.fn(), update: vi.fn() }
  db.paymentRunItem = { updateMany: vi.fn() }
  db.$transaction = vi.fn((ops: unknown[]) => Promise.all(ops))
})

describe("rejectPaymentBatch", () => {
  it("rejects an approved batch, releases its items, and records fromStatus on the audit detail", async () => {
    db.paymentRun.findFirst.mockResolvedValue(batch({ status: "approved" }))
    await rejectPaymentBatch({ workspaceId: "w1", actorId: "u2", batchId: "run1", reason: "wrong payer" })

    expect(db.paymentRun.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "run1" },
      data: expect.objectContaining({ status: "rejected", rejectedById: "u2", rejectedReason: "wrong payer" }),
    }))
    expect(db.paymentRunItem.updateMany).toHaveBeenCalledWith({ where: { runId: "run1" }, data: { active: false } })
    expect(recordDocumentAudit).toHaveBeenCalledWith(expect.objectContaining({
      type: "payment_batch.rejected",
      detail: expect.objectContaining({ batchId: "run1", reason: "wrong payer", fromStatus: "approved" }),
    }))
  })

  it("still rejects a pending batch, recording fromStatus pending_approval", async () => {
    db.paymentRun.findFirst.mockResolvedValue(batch({ status: "pending_approval" }))
    await rejectPaymentBatch({ workspaceId: "w1", actorId: "u2", batchId: "run1", reason: "duplicate" })
    expect(recordDocumentAudit).toHaveBeenCalledWith(expect.objectContaining({
      detail: expect.objectContaining({ fromStatus: "pending_approval" }),
    }))
  })

  it("includes exportedAt on the audit detail when the file was already downloaded", async () => {
    const exportedAt = new Date("2026-09-18T10:00:00.000Z")
    db.paymentRun.findFirst.mockResolvedValue(batch({ status: "approved", exportedAt }))
    await rejectPaymentBatch({ workspaceId: "w1", actorId: "u2", batchId: "run1", reason: "already handled" })
    expect(recordDocumentAudit).toHaveBeenCalledWith(expect.objectContaining({
      detail: expect.objectContaining({ exportedAt: exportedAt.toISOString() }),
    }))
  })

  it("throws payment_batch_not_pending for a paid batch and makes no writes", async () => {
    db.paymentRun.findFirst.mockResolvedValue(batch({ status: "paid" }))
    await expect(rejectPaymentBatch({ workspaceId: "w1", actorId: "u2", batchId: "run1", reason: "too late" }))
      .rejects.toThrow("payment_batch_not_pending")
    expect(db.paymentRun.update).not.toHaveBeenCalled()
    expect(db.paymentRunItem.updateMany).not.toHaveBeenCalled()
  })

  it("requires a reason", async () => {
    db.paymentRun.findFirst.mockResolvedValue(batch({ status: "approved" }))
    await expect(rejectPaymentBatch({ workspaceId: "w1", actorId: "u2", batchId: "run1", reason: "  " }))
      .rejects.toThrow("reason_required")
  })
})
