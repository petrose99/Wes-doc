import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/db", () => ({ prisma: {} }))
vi.mock("@/prisma/client", () => ({ Prisma: {}, PrismaClient: vi.fn() }))
vi.mock("@/lib/integrations/quickbooks/client", () => ({ getHomeCurrency: vi.fn() }))
vi.mock("@/lib/integrations/xero/client", () => ({ getBaseCurrency: vi.fn() }))

const { readLedgerCurrency, requeueLedgerCurrencyFailures, LEDGER_CURRENCY_REUSE_MS } = await import("@/lib/integrations/ledger-currency")
const { prisma } = await import("@/lib/db")
const quickbooks = await import("@/lib/integrations/quickbooks/client")
const xero = await import("@/lib/integrations/xero/client")

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any
const now = new Date("2026-09-26T10:00:00.000Z")
const connection = { id: "conn-1", workspaceId: "w1", provider: "xero", externalTenantId: "tenant-1", ledgerCurrency: "ZAR", ledgerCurrencyReadAt: new Date(now.getTime() - 30_000) }

beforeEach(() => {
  vi.clearAllMocks()
  for (const key of Object.keys(db)) delete db[key]
  db.integrationConnection = { updateMany: vi.fn().mockResolvedValue({ count: 1 }) }
  db.integrationPush = { findMany: vi.fn().mockResolvedValue([]), update: vi.fn().mockResolvedValue({}) }
  db.reviewTask = { updateMany: vi.fn().mockResolvedValue({ count: 0 }) }
})

describe("readLedgerCurrency", () => {
  it("reads Xero's base currency and stores it with the read time", async () => {
    vi.mocked(xero.getBaseCurrency).mockResolvedValue("LSL")
    await expect(readLedgerCurrency(connection, now)).resolves.toBe("LSL")
    expect(xero.getBaseCurrency).toHaveBeenCalledWith("tenant-1", "conn-1")
    expect(db.integrationConnection.updateMany).toHaveBeenCalledWith({ where: { id: "conn-1", workspaceId: "w1" }, data: { ledgerCurrency: "LSL", ledgerCurrencyReadAt: now } })
  })

  it("reads QuickBooks' home currency", async () => {
    vi.mocked(quickbooks.getHomeCurrency).mockResolvedValue("ZAR")
    await expect(readLedgerCurrency({ ...connection, provider: "quickbooks" }, now)).resolves.toBe("ZAR")
    expect(quickbooks.getHomeCurrency).toHaveBeenCalledWith("tenant-1", "conn-1")
  })

  it("reuses a stored read no older than the reuse window, without a provider call", async () => {
    await expect(readLedgerCurrency(connection, now, LEDGER_CURRENCY_REUSE_MS)).resolves.toBe("ZAR")
    expect(xero.getBaseCurrency).not.toHaveBeenCalled()
    expect(db.integrationConnection.updateMany).not.toHaveBeenCalled()
  })

  it("reads afresh once the stored read is older than the window", async () => {
    vi.mocked(xero.getBaseCurrency).mockResolvedValue("LSL")
    const stale = { ...connection, ledgerCurrencyReadAt: new Date(now.getTime() - 61_000) }
    await expect(readLedgerCurrency(stale, now, LEDGER_CURRENCY_REUSE_MS)).resolves.toBe("LSL")
  })

  it("on a failed read leaves the stored value alone and returns null", async () => {
    vi.mocked(xero.getBaseCurrency).mockRejectedValue(new Error("http_503"))
    await expect(readLedgerCurrency(connection, now)).resolves.toBeNull()
    expect(db.integrationConnection.updateMany).not.toHaveBeenCalled()
  })

  it("returns null for a connection with no tenant or a provider it cannot read", async () => {
    await expect(readLedgerCurrency({ ...connection, externalTenantId: null }, now)).resolves.toBeNull()
    await expect(readLedgerCurrency({ ...connection, provider: "sage" }, now)).resolves.toBeNull()
  })
})

describe("requeueLedgerCurrencyFailures", () => {
  it("puts each push refused for the ledger currency back in the queue with a fresh key, and resolves its task", async () => {
    db.integrationPush.findMany.mockResolvedValue([{ id: "p1", documentId: "d1" }, { id: "p2", documentId: "d2" }])

    await expect(requeueLedgerCurrencyFailures("w1", now)).resolves.toBe(2)

    expect(db.integrationPush.findMany).toHaveBeenCalledWith({ where: { workspaceId: "w1", status: "failed", errorCode: "ledger_currency_differs" }, select: { id: true, documentId: true } })
    const updates = db.integrationPush.update.mock.calls.map((c: any[]) => c[0])
    expect(updates.map((u: any) => u.where.id)).toEqual(["p1", "p2"])
    expect(updates[0].data).toEqual({ status: "pending", attempts: 0, nextAttemptAt: now, leaseUntil: null, errorCode: null, completedAt: null, idempotencyKey: expect.any(String) })
    expect(updates[0].data.idempotencyKey).not.toBe(updates[1].data.idempotencyKey)
    expect(db.reviewTask.updateMany).toHaveBeenCalledWith({
      where: { workspaceId: "w1", documentId: { in: ["d1", "d2"] }, reason: "push_preflight", status: { in: ["open", "in_review"] }, detail: { contains: "ledger_currency_differs" } },
      data: { status: "approved", resolvedAt: now },
    })
  })

  it("does nothing when no push is waiting on the ledger currency", async () => {
    await expect(requeueLedgerCurrencyFailures("w1", now)).resolves.toBe(0)
    expect(db.integrationPush.update).not.toHaveBeenCalled()
    expect(db.reviewTask.updateMany).not.toHaveBeenCalled()
  })

  it("runs on the client it is given, so a currency change re-queues in its own transaction", async () => {
    const tx = { integrationPush: { findMany: vi.fn().mockResolvedValue([]) }, reviewTask: { updateMany: vi.fn() } }
    await requeueLedgerCurrencyFailures("w1", now, tx as any)
    expect(tx.integrationPush.findMany).toHaveBeenCalled()
    expect(db.integrationPush.findMany).not.toHaveBeenCalled()
  })
})
