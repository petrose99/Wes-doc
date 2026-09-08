import { beforeEach, describe, expect, it, vi } from "vitest"

// Mocked at the module boundary, same posture as lib/health/actions.test.ts — no database, no
// provider. What matters here is the shape of the writes handed to $transaction.
vi.mock("@/lib/db", () => ({ prisma: {} }))
vi.mock("@/lib/integration-token-refresh", () => ({ getValidAccessToken: vi.fn().mockResolvedValue("api-key-1") }))
vi.mock("@/lib/integrations/quickbooks/client", () => ({ listBills: vi.fn(), listExpenses: vi.fn(), listBankTransactions: vi.fn() }))
vi.mock("@/lib/integrations/xero/client", () => ({ listBills: vi.fn(), listExpenses: vi.fn(), listBankTransactions: vi.fn() }))
vi.mock("@/lib/integrations/bigcapital/client", () => ({
  listBills: vi.fn().mockResolvedValue([]),
  listExpenses: vi.fn().mockResolvedValue([]),
  listSaleInvoices: vi.fn().mockResolvedValue([]),
}))

const { syncLedgerTransactions } = await import("@/lib/health/sync")
const { prisma } = await import("@/lib/db")

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any

beforeEach(() => {
  vi.clearAllMocks()
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
