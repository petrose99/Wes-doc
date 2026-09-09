import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/db", () => ({ prisma: {} }))
vi.mock("@/lib/integration-token-refresh", () => ({ getValidAccessToken: vi.fn().mockResolvedValue("token") }))
vi.mock("@/lib/integrations/bigcapital/client", () => ({
  listCashflowAccounts: vi.fn().mockResolvedValue([{ id: "10", name: "Chase", accountType: "bank" }]),
  createCashflowTransaction: vi.fn().mockResolvedValue({ id: "cf1" }),
}))

const { onBankMatchAccepted, onBankMatchUnaccepted } = await import("./close-loop")
const { prisma } = await import("@/lib/db")
const bigcapital = await import("@/lib/integrations/bigcapital/client")

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
    expect(result).toEqual({ documentUpdated: false, ledgerReconciled: false, paymentPosted: false })
  })

  it("marks the matched document paid + reconciles the mirrored ledger row + posts Bigcapital payment", async () => {
    db.bankMatch = { findFirst: vi.fn().mockResolvedValue({ id: "m1", matchedDocumentId: "doc1", statementDocumentId: "stmt1", statementLineId: "sl1", kind: "bank" }) }
    db.document = { update: vi.fn().mockResolvedValue({}) }
    db.integrationPush = { findMany: vi.fn().mockResolvedValue([
      { externalBillId: "ext1", connectionId: "c1", connection: { provider: "bigcapital" } },
    ]) }
    db.ledgerTransaction = {
      findFirst: vi.fn().mockResolvedValue({ id: "lt1" }),
      update: vi.fn().mockResolvedValue({}),
    }
    db.integrationConnection = { findFirst: vi.fn().mockResolvedValue({ externalTenantId: "org1", defaultExpenseAccountId: "50" }) }
    db.statementLine = { findFirst: vi.fn().mockResolvedValue({ amount: 100, txnDate: new Date("2026-08-10"), description: "PAY ACME" }) }

    const result = await onBankMatchAccepted({ workspaceId: "w1", matchId: "m1" })

    expect(result.documentUpdated).toBe(true)
    expect(result.ledgerReconciled).toBe(true)
    expect(result.paymentPosted).toBe(true)
    expect(db.document.update).toHaveBeenCalledWith({ where: { id: "doc1" }, data: { paymentStatus: "paid" } })
    expect(db.ledgerTransaction.update).toHaveBeenCalledWith({
      where: { id: "lt1" },
      data: { reconciled: true, reconciledSource: "docubite" },
    })
    expect(bigcapital.createCashflowTransaction).toHaveBeenCalledWith(
      "token",
      "org1",
      expect.objectContaining({ amount: 100, reference_no: "bankmatch:m1", transaction_type: "other_expense" }),
    )
  })

  it("skips Bigcapital payment when the connection has no expense account configured", async () => {
    db.bankMatch = { findFirst: vi.fn().mockResolvedValue({ id: "m1", matchedDocumentId: "doc1", statementDocumentId: "stmt1", statementLineId: "sl1", kind: "bank" }) }
    db.document = { update: vi.fn().mockResolvedValue({}) }
    db.integrationPush = { findMany: vi.fn().mockResolvedValue([{ externalBillId: "ext1", connectionId: "c1", connection: { provider: "bigcapital" } }]) }
    db.ledgerTransaction = { findFirst: vi.fn().mockResolvedValue({ id: "lt1" }), update: vi.fn().mockResolvedValue({}) }
    db.integrationConnection = { findFirst: vi.fn().mockResolvedValue({ externalTenantId: "org1", defaultExpenseAccountId: null }) }
    db.statementLine = { findFirst: vi.fn().mockResolvedValue({ amount: 100, txnDate: new Date("2026-08-10"), description: "x" }) }

    const result = await onBankMatchAccepted({ workspaceId: "w1", matchId: "m1" })
    expect(result.paymentPosted).toBe(false)
    expect(result.ledgerReconciled).toBe(true)
    expect(bigcapital.createCashflowTransaction).not.toHaveBeenCalled()
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
