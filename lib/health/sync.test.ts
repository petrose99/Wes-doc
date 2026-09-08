import { beforeEach, describe, expect, it, vi } from "vitest"

// Mocked at the module boundary, same posture as lib/health/actions.test.ts — no database, no
// provider. What matters here is the shape of the writes handed to $transaction.
vi.mock("@/lib/db", () => ({ prisma: {} }))
vi.mock("@/lib/integration-token-refresh", () => ({ getValidAccessToken: vi.fn().mockResolvedValue("api-key-1") }))
vi.mock("@/lib/workspace-scope", () => ({ unscoped: (fn: () => unknown) => fn() }))
vi.mock("@/lib/integrations/quickbooks/client", () => ({ listBills: vi.fn(), listExpenses: vi.fn(), listBankTransactions: vi.fn() }))
vi.mock("@/lib/integrations/xero/client", () => ({ listBills: vi.fn(), listExpenses: vi.fn(), listBankTransactions: vi.fn() }))
vi.mock("@/lib/integrations/bigcapital/client", () => ({
  listBills: vi.fn().mockResolvedValue([]),
  listExpenses: vi.fn().mockResolvedValue([]),
  listSaleInvoices: vi.fn().mockResolvedValue([]),
}))

const { syncLedgerTransactions, syncDueLedgerConnections, resetLedgerSyncBackoff } = await import("@/lib/health/sync")
const { prisma } = await import("@/lib/db")
const bigcapital = await import("@/lib/integrations/bigcapital/client")

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any

beforeEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
  resetLedgerSyncBackoff()
  for (const key of Object.keys(db)) delete db[key]
})

describe("syncLedgerTransactions", () => {
  /** Captures the operation descriptors $transaction is handed. The upsert/updateMany mocks return
   * their own argument, which is what the real Prisma client does in spirit — it builds a
   * deferred operation rather than running one. */
  function stubPrisma() {
    const transactions: unknown[][] = []
    db.integrationConnection = {
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "conn1", workspaceId: "ws1", provider: "bigcapital", externalTenantId: "org1" }),
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db.ledgerTransaction = { upsert: vi.fn((args: any) => ({ op: "upsert", args })), updateMany: vi.fn((args: any) => ({ op: "updateMany", args })) }
    db.$transaction = vi.fn(async (ops: unknown[]) => { transactions.push(ops); return [] })
    return transactions
  }

  it("scopes the soft-retire updateMany by workspace", async () => {
    // Without workspaceId the scope guard rejects it, the whole $transaction rolls back, and no row
    // ever records a syncedAt — so syncDueLedgerConnections finds the connection due again on the
    // next worker tick and refetches the provider forever. See the note at the call site.
    const transactions = stubPrisma()
    await syncLedgerTransactions("conn1")

    const retire = transactions[0].find((op) => (op as { op: string }).op === "updateMany") as { args: { where: Record<string, unknown> } }
    expect(retire.args.where.workspaceId).toBe("ws1")
    expect(retire.args.where.connectionId).toBe("conn1")
  })

  it("refuses a connection with no tenant id rather than syncing nothing under a null org", async () => {
    stubPrisma()
    db.integrationConnection.findUniqueOrThrow.mockResolvedValue({ id: "conn1", workspaceId: "ws1", provider: "bigcapital", externalTenantId: null })
    await expect(syncLedgerTransactions("conn1")).rejects.toThrow("integration_connection_not_ready")
  })
})

describe("syncDueLedgerConnections", () => {
  /** One never-synced bigcapital connection — no LedgerTransaction rows, so always "due". */
  function stubDueConnection(listBills: ReturnType<typeof vi.fn>) {
    db.integrationConnection = {
      findMany: vi.fn().mockResolvedValue([{ id: "conn1", provider: "bigcapital" }]),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "conn1", workspaceId: "ws1", provider: "bigcapital", externalTenantId: "org1" }),
    }
    db.ledgerTransaction = {
      groupBy: vi.fn().mockResolvedValue([]),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      upsert: vi.fn((args: any) => args),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      updateMany: vi.fn((args: any) => args),
    }
    db.$transaction = vi.fn().mockResolvedValue([])
    vi.mocked(bigcapital.listBills).mockImplementation(listBills)
  }

  it("holds a failed connection off instead of retrying it on the next tick", async () => {
    // A failed sync writes no syncedAt, so "due" stays true forever. Without the backoff every
    // tick re-hit the provider seconds apart — which is what got production rate-limited.
    const listBills = vi.fn().mockRejectedValue(new Error("http_429"))
    stubDueConnection(listBills)

    await expect(syncDueLedgerConnections()).resolves.toBe(0)
    expect(listBills).toHaveBeenCalledTimes(1)

    await expect(syncDueLedgerConnections()).resolves.toBe(0)
    expect(listBills).toHaveBeenCalledTimes(1)
  })

  it("retries once the backoff has elapsed", async () => {
    const listBills = vi.fn().mockRejectedValue(new Error("http_429"))
    stubDueConnection(listBills)
    await syncDueLedgerConnections()

    vi.useFakeTimers()
    vi.setSystemTime(Date.now() + 6 * 60 * 1000)
    await syncDueLedgerConnections()
    expect(listBills).toHaveBeenCalledTimes(2)
  })

  it("clears the backoff once a sync succeeds", async () => {
    const listBills = vi.fn().mockRejectedValueOnce(new Error("http_429")).mockResolvedValue([])
    stubDueConnection(listBills)
    await syncDueLedgerConnections()

    vi.useFakeTimers()
    vi.setSystemTime(Date.now() + 6 * 60 * 1000)
    await expect(syncDueLedgerConnections()).resolves.toBe(1)
    // Still "due" (the stub reports no rows), so a cleared backoff means an immediate third call.
    await expect(syncDueLedgerConnections()).resolves.toBe(1)
    expect(listBills).toHaveBeenCalledTimes(3)
  })
})
