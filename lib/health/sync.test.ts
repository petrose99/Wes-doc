import { beforeEach, describe, expect, it, vi } from "vitest"

// Mocked at the module boundary, same posture as lib/health/actions.test.ts — no database, no
// provider. What matters here is the shape of the writes handed to $transaction.
vi.mock("@/lib/db", () => ({ prisma: {} }))
vi.mock("@/lib/workspace-scope", () => ({ unscoped: (fn: () => unknown) => fn() }))
vi.mock("@/lib/integrations/quickbooks/client", () => ({ listBills: vi.fn(), listExpenses: vi.fn(), listBankTransactions: vi.fn() }))
vi.mock("@/lib/integrations/xero/client", () => ({ listBills: vi.fn(), listExpenses: vi.fn(), listBankTransactions: vi.fn() }))

const { syncLedgerTransactions, syncDueLedgerConnections, resetLedgerSyncBackoff } = await import("@/lib/health/sync")
const { prisma } = await import("@/lib/db")
const xero = await import("@/lib/integrations/xero/client")

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
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "conn1", workspaceId: "ws1", provider: "xero", externalTenantId: "org1" }),
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db.ledgerTransaction = {
      upsert: vi.fn((args: any) => ({ op: "upsert", args })),
      updateMany: vi.fn((args: any) => ({ op: "updateMany", args })),
      // Phase 5: syncLedgerTransactions now reads existing reconciled/reconciledSource state up
      // front so `chooseReconciled` can honor a docubite-source row. Default: no prior rows.
      findMany: vi.fn().mockResolvedValue([]),
    }
    db.$transaction = vi.fn(async (ops: unknown[]) => { transactions.push(ops); return [] })
    vi.mocked(xero.listBills).mockResolvedValue([])
    vi.mocked(xero.listBankTransactions).mockResolvedValue([])
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
    db.integrationConnection.findUniqueOrThrow.mockResolvedValue({ id: "conn1", workspaceId: "ws1", provider: "xero", externalTenantId: null })
    await expect(syncLedgerTransactions("conn1")).rejects.toThrow("integration_connection_not_ready")
  })
})

describe("syncDueLedgerConnections", () => {
  /** One never-synced xero connection — no LedgerTransaction rows, so always "due". */
  function stubDueConnection(listBills: ReturnType<typeof vi.fn>) {
    db.integrationConnection = {
      findMany: vi.fn().mockResolvedValue([{ id: "conn1", provider: "xero" }]),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "conn1", workspaceId: "ws1", provider: "xero", externalTenantId: "org1" }),
    }
    db.ledgerTransaction = {
      groupBy: vi.fn().mockResolvedValue([]),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      upsert: vi.fn((args: any) => args),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      updateMany: vi.fn((args: any) => args),
      // Phase 5: syncLedgerTransactions reads existing rows to decide reconciledSource.
      findMany: vi.fn().mockResolvedValue([]),
    }
    db.$transaction = vi.fn().mockResolvedValue([])
    vi.mocked(xero.listBills).mockImplementation(listBills)
    vi.mocked(xero.listBankTransactions).mockResolvedValue([])
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

  it("drops the failure count once a sync succeeds", async () => {
    const listBills = vi.fn().mockRejectedValueOnce(new Error("http_429")).mockResolvedValue([])
    stubDueConnection(listBills)
    await syncDueLedgerConnections()

    vi.useFakeTimers()
    // Past the 5-minute first-failure backoff, so the retry runs and succeeds.
    vi.setSystemTime(Date.now() + 6 * 60 * 1000)
    await expect(syncDueLedgerConnections()).resolves.toBe(1)

    // A failure straight after a success is attempt 1 again, not attempt 3 — so it waits 5 minutes,
    // not 20. Past the 24h post-success hold (LEDGER_SYNC_STALE_MS) so the connection is due again.
    vi.setSystemTime(Date.now() + 25 * 60 * 60 * 1000)
    listBills.mockRejectedValue(new Error("http_429"))
    await syncDueLedgerConnections()
    vi.setSystemTime(Date.now() + 6 * 60 * 1000)
    await syncDueLedgerConnections()
    expect(listBills).toHaveBeenCalledTimes(4)
  })

  it("holds a connection whose provider returned nothing at all", async () => {
    // An organization with no bills, expenses or invoices writes zero LedgerTransaction rows, so
    // there is no syncedAt to age and the staleness check calls it due forever. Without a hold on
    // success that is a full three-endpoint refetch every tick, for an empty ledger.
    const listBills = vi.fn().mockResolvedValue([])
    stubDueConnection(listBills)

    await expect(syncDueLedgerConnections()).resolves.toBe(1)
    await expect(syncDueLedgerConnections()).resolves.toBe(0)
    expect(listBills).toHaveBeenCalledTimes(1)

    vi.useFakeTimers()
    // LEDGER_SYNC_STALE_MS is 24 hours; just past it the connection is attempted again.
    vi.setSystemTime(Date.now() + 25 * 60 * 60 * 1000)
    await expect(syncDueLedgerConnections()).resolves.toBe(1)
    expect(listBills).toHaveBeenCalledTimes(2)
  })
})
