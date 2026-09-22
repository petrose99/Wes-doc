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
  createBill: vi.fn().mockResolvedValue({ id: "bill-1" }),
  findBillByDocNumber: vi.fn().mockResolvedValue(false),
}))
vi.mock("@/lib/integrations/quickbooks/bill-mapper", () => ({ toQuickBooksBillBody: vi.fn().mockReturnValue({}) }))
vi.mock("@/lib/integrations/xero/client", () => ({
  findOrCreateContact: vi.fn().mockResolvedValue("contact-1"),
  createBill: vi.fn().mockResolvedValue({ id: "bill-1" }),
  findBillByInvoiceNumber: vi.fn().mockResolvedValue(false),
}))
vi.mock("@/lib/integrations/xero/bill-mapper", () => ({ toXeroBillBody: vi.fn().mockReturnValue({}) }))

const { attemptIntegrationPush, getLedgerConnectionBandStatus } = await import("./integration-push")
const { IntegrationAuthError } = await import("./integrations/errors")
const db = (await import("@/lib/db")) as unknown as { prisma: Record<string, any> }
const quickbooks = (await import("./integrations/quickbooks/client")) as unknown as Record<string, any>

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
  return {
    integrationPush: { findUnique: vi.fn().mockResolvedValue(push), update: vi.fn().mockResolvedValue({}) },
    integrationConnection: { update: vi.fn().mockResolvedValue({}), findFirst: vi.fn() },
    accountingEntity: { findMany: vi.fn().mockResolvedValue([]) },
    reviewTask: { findFirst: vi.fn().mockResolvedValue(null) },
  }
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

describe("getLedgerConnectionBandStatus", () => {
  it("has no no_default_account state left — only disconnected/needs_reconnect/null, per the glossary's three states", async () => {
    const prisma = { integrationConnection: { findFirst: vi.fn().mockResolvedValue({ status: "connected" }) } }
    db.prisma = prisma as any
    expect(await getLedgerConnectionBandStatus("w1")).toBeNull()
  })
})
