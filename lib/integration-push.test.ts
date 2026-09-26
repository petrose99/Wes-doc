import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// DB + every provider/network dependency is stubbed so attemptIntegrationPush's control flow
// (the ADR 0005 step-6 pre-check and the Nango-boundary token removal) is testable without a
// database, a real provider account, or a network call.
vi.mock("@/lib/db", () => ({ prisma: {} }))
vi.mock("@/prisma/client", () => ({ Prisma: {}, PrismaClient: vi.fn() }))
vi.mock("@/lib/config", () => ({ default: { app: { baseURL: "https://app.test" }, aws: { internalWorkerSecret: "s" }, integrations: { enabled: true } } }))
vi.mock("@/lib/audit", () => ({ recordSystemAudit: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/lib/webhooks", () => ({ emitAccountsPayableEvent: vi.fn().mockResolvedValue({ queued: 0 }) }))
vi.mock("@/lib/webhook-delivery", () => ({ kickWebhookDrain: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/lib/integration-preflight", () => ({ preflightPush: vi.fn().mockReturnValue({ ok: true }) }))
vi.mock("@/models/review-tasks", () => ({ createReviewTask: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/lib/integrations/quickbooks/client", () => ({
  findOrCreateVendor: vi.fn().mockResolvedValue("vendor-1"),
  createBill: vi.fn().mockResolvedValue({ id: "bill-1", totalTax: null, total: null, warnings: [] }),
  findBillByDocNumber: vi.fn().mockResolvedValue(false),
}))
vi.mock("@/lib/integrations/quickbooks/bill-mapper", () => ({ toQuickBooksBillBody: vi.fn().mockReturnValue({}) }))
vi.mock("@/lib/integrations/xero/client", () => ({
  findOrCreateContact: vi.fn().mockResolvedValue("contact-1"),
  createBill: vi.fn().mockResolvedValue({ id: "bill-1", totalTax: null, total: null, warnings: [] }),
  findBillByInvoiceNumber: vi.fn().mockResolvedValue(false),
}))
vi.mock("@/lib/integrations/xero/bill-mapper", () => ({ toXeroBillBody: vi.fn().mockReturnValue({}) }))
vi.mock("@/lib/integrations/ledger-currency", () => ({ LEDGER_CURRENCY_REUSE_MS: 60_000, readLedgerCurrency: vi.fn().mockResolvedValue("USD") }))
vi.mock("@/lib/integrations/ledger-capabilities", () => ({ LEDGER_CAPABILITIES_REUSE_MS: 86_400_000, readLedgerCapabilities: vi.fn() }))
vi.mock("@/models/accounting-entities", () => ({ loadLineCodingContext: vi.fn() }))
vi.mock("@/models/document-checks", () => ({ recordLedgerReadBack: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/models/company-currency", () => ({ readCompanyCurrencyForPush: vi.fn().mockResolvedValue("USD"), recordCurrencyLock: vi.fn().mockResolvedValue(undefined) }))

const { attemptIntegrationPush, getLedgerConnectionBandStatus } = await import("./integration-push")
const { IntegrationAuthError } = await import("./integrations/errors")
const db = (await import("@/lib/db")) as unknown as { prisma: Record<string, any> }
const quickbooks = (await import("./integrations/quickbooks/client")) as unknown as Record<string, any>
const ledger = (await import("./integrations/ledger-currency")) as unknown as Record<string, any>
const companyCurrency = (await import("@/models/company-currency")) as unknown as Record<string, any>
const capabilities = (await import("./integrations/ledger-capabilities")) as unknown as Record<string, any>
const entities = (await import("@/models/accounting-entities")) as unknown as Record<string, any>
const { IntegrationPermanentError, IntegrationRetryableError } = await import("./integrations/errors")
const reviewTasks = (await import("@/models/review-tasks")) as unknown as Record<string, any>
const documentChecks = (await import("@/models/document-checks")) as unknown as Record<string, any>

const now = new Date("2026-09-22T12:00:00.000Z")

function makePush(overrides: Record<string, any> = {}) {
  return {
    id: "push-1",
    workspaceId: "w1",
    documentId: "d1",
    status: "pending",
    attempts: 0,
    idempotencyKey: null,
    payload: { vendorName: "Acme", referenceNumber: "INV-1", currencyCode: "USD", expenseAccountId: "acct-1" },
    connection: {
      id: "conn-1", provider: "quickbooks", status: "connected", externalTenantId: "realm-1",
      defaultExpenseAccountId: "acct-1",
    },
    ...overrides,
  }
}

function makePrisma(push: any) {
  const client: Record<string, any> = {
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(client)),
    integrationPush: { findUnique: vi.fn().mockResolvedValue(push), update: vi.fn().mockResolvedValue({}) },
    integrationConnection: { update: vi.fn().mockResolvedValue({}), findFirst: vi.fn() },
    accountingEntity: { findMany: vi.fn().mockResolvedValue([]) },
    reviewTask: { findFirst: vi.fn().mockResolvedValue(null) },
  }
  return client
}

beforeEach(() => { vi.restoreAllMocks() })
afterEach(() => { vi.unstubAllGlobals() })

describe("attemptIntegrationPush", () => {
  it("pauses a needs_reconnect connection without burning an attempt or the lease", async () => {
    const push = makePush({ attempts: 2, connection: { ...makePush().connection, status: "needs_reconnect" } })
    const prisma = makePrisma(push)
    db.prisma = prisma

    await attemptIntegrationPush("push-1", now)

    expect(prisma.integrationPush.update).toHaveBeenCalledExactlyOnceWith({
      where: { id: "push-1" },
      data: { leaseUntil: null, nextAttemptAt: new Date(now.getTime() + 5 * 60 * 1000) },
    })
    // attempts is untouched — the call above never mentions it, matching the map's "no attempts burned".
  })

  it("fails terminally, without a token lookup, when the connection was deleted out from under the push", async () => {
    const push = makePush({ connection: null })
    const prisma = makePrisma(push)
    db.prisma = prisma

    await attemptIntegrationPush("push-1", now)

    const update = prisma.integrationPush.update.mock.calls[0][0]
    expect(update.data.status).toBe("failed")
    expect(update.data.errorCode).toBe("integration_connection_disabled")
  })

  it("pushes straight to the provider with the connection id — no access token is minted", async () => {
    const push = makePush()
    const prisma = makePrisma(push)
    db.prisma = prisma

    await attemptIntegrationPush("push-1", now)

    expect(quickbooks.createBill).toHaveBeenCalledWith("realm-1", "conn-1", {}, null)
    const update = prisma.integrationPush.update.mock.calls[0][0]
    expect(update.data.status).toBe("succeeded")
  })

  it("on a mid-attempt IntegrationAuthError, flips the connection and pauses instead of burning an attempt", async () => {
    quickbooks.findOrCreateVendor.mockRejectedValueOnce(new IntegrationAuthError("revoked"))
    const push = makePush()
    const prisma = makePrisma(push)
    db.prisma = prisma

    await attemptIntegrationPush("push-1", now)

    expect(prisma.integrationConnection.update).toHaveBeenCalledWith({ where: { id: "conn-1" }, data: { status: "needs_reconnect" } })
    expect(prisma.integrationPush.update).toHaveBeenCalledExactlyOnceWith({
      where: { id: "push-1" },
      data: { leaseUntil: null, nextAttemptAt: new Date(now.getTime() + 5 * 60 * 1000) },
    })
  })
})

describe("attemptIntegrationPush — ledger currency (ADR 0013)", () => {
  it("reads the ledger currency (reusing a read up to 60 s old) before anything is posted", async () => {
    const prisma = makePrisma(makePush())
    db.prisma = prisma
    await attemptIntegrationPush("push-1", now)
    expect(ledger.readLedgerCurrency).toHaveBeenCalledWith(expect.objectContaining({ id: "conn-1", workspaceId: "w1", provider: "quickbooks" }), now, 60_000)
    expect(companyCurrency.readCompanyCurrencyForPush).toHaveBeenCalledWith("w1")
  })

  it("refuses a push whose ledger keeps its books in another currency: terminal, one review task, nothing posted", async () => {
    ledger.readLedgerCurrency.mockResolvedValueOnce("ZAR")
    companyCurrency.readCompanyCurrencyForPush.mockResolvedValueOnce("LSL")
    companyCurrency.recordCurrencyLock.mockClear()
    const prisma = makePrisma(makePush({ connection: { ...makePush().connection, provider: "xero" } }))
    db.prisma = prisma

    await attemptIntegrationPush("push-1", now)

    const update = prisma.integrationPush.update.mock.calls[0][0]
    expect(update.data.status).toBe("failed")
    expect(update.data.errorCode).toBe("ledger_currency_differs")
    expect(reviewTasks.createReviewTask).toHaveBeenCalledWith(expect.objectContaining({
      reason: "push_preflight", documentId: "d1",
      detail: "ledger_currency_differs: Xero keeps its books in ZAR; this company's currency is LSL.",
    }))
    expect(companyCurrency.recordCurrencyLock).not.toHaveBeenCalled()
  })

  it("does not open a second task for the same document while one is open", async () => {
    ledger.readLedgerCurrency.mockResolvedValueOnce("ZAR")
    const prisma = makePrisma(makePush())
    prisma.reviewTask.findFirst.mockResolvedValue({ id: "t1" })
    db.prisma = prisma
    reviewTasks.createReviewTask.mockClear()
    await attemptIntegrationPush("push-1", now)
    expect(reviewTasks.createReviewTask).not.toHaveBeenCalled()
  })

  it("leaves a push whose ledger currency can't be read for the backoff to retry, never posting it", async () => {
    ledger.readLedgerCurrency.mockResolvedValueOnce(null)
    quickbooks.createBill.mockClear()
    const prisma = makePrisma(makePush())
    db.prisma = prisma

    await attemptIntegrationPush("push-1", now)

    const update = prisma.integrationPush.update.mock.calls[0][0]
    expect(update.data.status).toBe("pending")
    expect(update.data.errorCode).toBe("ledger_currency_unreadable")
    expect(quickbooks.createBill).not.toHaveBeenCalled()
  })

  it("gates bank-statement batches too", async () => {
    ledger.readLedgerCurrency.mockResolvedValueOnce("ZAR")
    const prisma = makePrisma(makePush({ payload: { ...makePush().payload, documentType: "bank_statement" } }))
    db.prisma = prisma
    await attemptIntegrationPush("push-1", now)
    expect(prisma.integrationPush.update.mock.calls[0][0].data.errorCode).toBe("ledger_currency_differs")
  })

  it("records the currency lock with the push's success, in the same transaction", async () => {
    const prisma = makePrisma(makePush())
    db.prisma = prisma
    await attemptIntegrationPush("push-1", now)
    expect(prisma.$transaction).toHaveBeenCalled()
    expect(companyCurrency.recordCurrencyLock).toHaveBeenCalledWith("w1", "bill", "quickbooks", now, prisma)
  })

  it("names a bank statement as the lock's cause when that was the first thing posted", async () => {
    const prisma = makePrisma(makePush({ payload: { ...makePush().payload, documentType: "bank_statement" } }))
    db.prisma = prisma
    await attemptIntegrationPush("push-1", now)
    expect(companyCurrency.recordCurrencyLock).toHaveBeenCalledWith("w1", "bank_statement", "quickbooks", now, prisma)
  })
})

describe("attemptIntegrationPush — line coding (ADR 0014)", () => {
  const caps = { vat: true, tracking: [], location: false, customer: true, billable: false }
  const context = { provider: "quickbooks", capabilities: caps, references: { taxCodes: new Set(["TAX"]), trackingOptions: new Set(), locations: new Set() }, taxRates: {}, names: {} }
  const coded = (line: Record<string, unknown> = {}) => makePush({
    payload: {
      ...makePush().payload, taxBasis: "exclusive", location: null, taxTotal: null,
      lineItems: [{ amount: 100, taxCode: null, tracking: [], customer: null, billable: false, ...line }],
    },
  })

  beforeEach(() => {
    capabilities.readLedgerCapabilities.mockReset().mockResolvedValue(caps)
    entities.loadLineCodingContext.mockReset().mockImplementation(async (_ws: string, _c: unknown, read: unknown) => ({ ...context, capabilities: read }))
    quickbooks.createBill.mockReset().mockResolvedValue({ id: "bill-1", totalTax: null, total: null, warnings: [] })
    reviewTasks.createReviewTask.mockClear()
  })

  it("refuses a bill whose lines the ledger can't take: terminal, one review task naming the Check, nothing posted", async () => {
    const prisma = makePrisma(coded())
    db.prisma = prisma
    await attemptIntegrationPush("push-1", now)
    expect(capabilities.readLedgerCapabilities).toHaveBeenCalledWith(expect.objectContaining({ id: "conn-1", workspaceId: "w1" }), now, 86_400_000)
    const update = prisma.integrationPush.update.mock.calls[0][0]
    expect(update.data.status).toBe("failed")
    expect(update.data.errorCode).toBe("tax_code_missing")
    expect(reviewTasks.createReviewTask).toHaveBeenCalledWith(expect.objectContaining({ reason: "push_preflight", detail: expect.stringMatching(/^tax_code_missing: /) }))
    expect(quickbooks.createBill).not.toHaveBeenCalled()
  })

  it("posts a bill the ledger can take", async () => {
    const prisma = makePrisma(coded({ taxCode: "TAX" }))
    db.prisma = prisma
    await attemptIntegrationPush("push-1", now)
    expect(prisma.integrationPush.update.mock.calls[0][0].data).toMatchObject({ status: "succeeded" })
  })

  it("leaves the push pending when the ledger's settings can't be read, never posting it", async () => {
    capabilities.readLedgerCapabilities.mockRejectedValueOnce(new IntegrationRetryableError("ledger_capabilities_unreadable"))
    const prisma = makePrisma(coded({ taxCode: "TAX" }))
    db.prisma = prisma
    await attemptIntegrationPush("push-1", now)
    const update = prisma.integrationPush.update.mock.calls[0][0]
    expect(update.data.status).toBe("pending")
    expect(update.data.errorCode).toBe("ledger_capabilities_unreadable")
    expect(quickbooks.createBill).not.toHaveBeenCalled()
  })

  it("skips the gate for a snapshot taken before line coding existed", async () => {
    const prisma = makePrisma(makePush())
    db.prisma = prisma
    await attemptIntegrationPush("push-1", now)
    expect(capabilities.readLedgerCapabilities).not.toHaveBeenCalled()
    expect(prisma.integrationPush.update.mock.calls[0][0].data).toMatchObject({ status: "succeeded" })
  })

  it("on a 5030, re-reads the ledger fresh and names the Check that now fails", async () => {
    capabilities.readLedgerCapabilities.mockResolvedValueOnce(caps).mockResolvedValueOnce({ ...caps, vat: false })
    quickbooks.createBill.mockRejectedValueOnce(new IntegrationPermanentError("quickbooks_feature_not_supported"))
    const prisma = makePrisma(coded({ taxCode: "TAX" }))
    db.prisma = prisma
    await attemptIntegrationPush("push-1", now)
    expect(capabilities.readLedgerCapabilities).toHaveBeenLastCalledWith(expect.anything(), now, 0)
    expect(prisma.integrationPush.update.mock.calls[0][0].data.errorCode).toBe("vat_off_in_quickbooks")
    expect(reviewTasks.createReviewTask).toHaveBeenCalledWith(expect.objectContaining({ detail: expect.stringMatching(/^vat_off_in_quickbooks: /) }))
  })

  it("on a 5030 the fresh read can't explain, fails terminal with a review task", async () => {
    quickbooks.createBill.mockRejectedValueOnce(new IntegrationPermanentError("quickbooks_feature_not_supported"))
    const prisma = makePrisma(coded({ taxCode: "TAX" }))
    db.prisma = prisma
    await attemptIntegrationPush("push-1", now)
    const update = prisma.integrationPush.update.mock.calls[0][0]
    expect(update.data.status).toBe("failed")
    expect(update.data.errorCode).toBe("quickbooks_feature_not_supported")
    expect(reviewTasks.createReviewTask).toHaveBeenCalledWith(expect.objectContaining({ detail: expect.stringMatching(/^quickbooks_feature_not_supported: /) }))
  })
})

describe("attemptIntegrationPush — post read-back (ADR 0014)", () => {
  const readBackPush = () => makePush({ payload: { ...makePush().payload, taxBasis: "exclusive", taxTotal: 20, lineItems: [] } })
  // No coding context: the push gate has nothing to judge, so these cases reach the ledger.
  beforeEach(() => { entities.loadLineCodingContext.mockReset() })

  it("writes the ledger's warn Checks after the push is marked posted", async () => {
    quickbooks.createBill.mockResolvedValueOnce({ id: "bill-1", totalTax: 19, total: 119, warnings: [] })
    const prisma = makePrisma(readBackPush())
    prisma.integrationPush.update.mockImplementation(async () => {
      expect(documentChecks.recordLedgerReadBack).not.toHaveBeenCalled()
      return {}
    })
    db.prisma = prisma
    await attemptIntegrationPush("push-1", now)
    expect(prisma.integrationPush.update.mock.calls[0][0].data).toMatchObject({ status: "succeeded" })
    expect(documentChecks.recordLedgerReadBack).toHaveBeenCalledWith("w1", "d1", [expect.objectContaining({ checkCode: "ledger_vat_differs", status: "warn" })])
  })

  it("keeps the push posted when writing the read-back fails", async () => {
    quickbooks.createBill.mockResolvedValueOnce({ id: "bill-1", totalTax: 19, total: 119, warnings: [] })
    documentChecks.recordLedgerReadBack.mockRejectedValueOnce(new Error("db down"))
    const prisma = makePrisma(readBackPush())
    db.prisma = prisma
    await expect(attemptIntegrationPush("push-1", now)).resolves.toBeUndefined()
    expect(prisma.integrationPush.update).toHaveBeenCalledTimes(1)
    expect(prisma.integrationPush.update.mock.calls[0][0].data).toMatchObject({ status: "succeeded" })
  })
})

describe("getLedgerConnectionBandStatus", () => {
  it("has no no_default_account state left — only disconnected/needs_reconnect/null, per the glossary's three states", async () => {
    const prisma = { integrationConnection: { findFirst: vi.fn().mockResolvedValue({ status: "connected" }) } }
    db.prisma = prisma as any
    expect(await getLedgerConnectionBandStatus("w1")).toBeNull()
  })
})
