import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/db", () => ({ prisma: {} }))

const { onBankMatchAccepted, onBankMatchUnaccepted } = await import("./close-loop")
const { prisma } = await import("@/lib/db")

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any

beforeEach(() => {
  vi.clearAllMocks()
  for (const key of Object.keys(db)) delete db[key]
})

describe("onBankMatchAccepted", () => {
  it("does nothing when the match isn't accepted", async () => {
    db.bankMatch = { findFirst: vi.fn().mockResolvedValue(null) }
    const result = await onBankMatchAccepted({ workspaceId: "w1", matchId: "m1" })
    expect(result).toEqual({ documentUpdated: false, ledgerReconciled: false })
  })

  it("marks the matched document paid + reconciles the mirrored ledger row", async () => {
    db.bankMatch = { findFirst: vi.fn().mockResolvedValue({ id: "m1", matchedDocumentId: "doc1", statementDocumentId: "stmt1", statementLineId: "sl1", kind: "bank" }) }
    db.document = { update: vi.fn().mockResolvedValue({}) }
    db.integrationPush = { findMany: vi.fn().mockResolvedValue([
      { externalBillId: "ext1", connectionId: "c1" },
    ]) }
    db.ledgerTransaction = {
      findFirst: vi.fn().mockResolvedValue({ id: "lt1" }),
      update: vi.fn().mockResolvedValue({}),
    }

    const result = await onBankMatchAccepted({ workspaceId: "w1", matchId: "m1" })

    expect(result.documentUpdated).toBe(true)
    expect(result.ledgerReconciled).toBe(true)
    expect(db.document.update).toHaveBeenCalledWith({ where: { id: "doc1" }, data: { paymentStatus: "paid" } })
    expect(db.ledgerTransaction.update).toHaveBeenCalledWith({
      where: { id: "lt1" },
      data: { reconciled: true, reconciledSource: "docubite" },
    })
  })

  it("leaves ledgerReconciled false when no mirrored ledger row is found", async () => {
    db.bankMatch = { findFirst: vi.fn().mockResolvedValue({ id: "m1", matchedDocumentId: "doc1", statementDocumentId: "stmt1", statementLineId: "sl1", kind: "bank" }) }
    db.document = { update: vi.fn().mockResolvedValue({}) }
    db.integrationPush = { findMany: vi.fn().mockResolvedValue([{ externalBillId: "ext1", connectionId: "c1" }]) }
    db.ledgerTransaction = { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn().mockResolvedValue({}) }

    const result = await onBankMatchAccepted({ workspaceId: "w1", matchId: "m1" })
    expect(result.ledgerReconciled).toBe(false)
    expect(db.ledgerTransaction.update).not.toHaveBeenCalled()
  })
})

describe("onBankMatchUnaccepted", () => {
  it("clears paymentStatus + reverses reconciled when no other accepted match remains", async () => {
    db.bankMatch = { findFirst: vi.fn().mockResolvedValue({ matchedDocumentId: "doc1" }), count: vi.fn().mockResolvedValue(0) }
    db.document = { update: vi.fn().mockResolvedValue({}) }
    db.integrationPush = { findMany: vi.fn().mockResolvedValue([{ externalBillId: "ext1" }]) }
    db.ledgerTransaction = { updateMany: vi.fn().mockResolvedValue({ count: 1 }) }

    await onBankMatchUnaccepted({ workspaceId: "w1", matchId: "m1" })

    expect(db.document.update).toHaveBeenCalledWith({ where: { id: "doc1" }, data: { paymentStatus: null } })
    expect(db.ledgerTransaction.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { reconciled: false, reconciledSource: null },
    }))
  })

  it("keeps paymentStatus when another accepted match still covers the document", async () => {
    db.bankMatch = { findFirst: vi.fn().mockResolvedValue({ matchedDocumentId: "doc1" }), count: vi.fn().mockResolvedValue(1) }
    db.document = { update: vi.fn().mockResolvedValue({}) }

    await onBankMatchUnaccepted({ workspaceId: "w1", matchId: "m1" })

    expect(db.document.update).not.toHaveBeenCalled()
  })
})
