import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/db", () => ({ prisma: {} }))
vi.mock("@/prisma/client", () => ({ Prisma: {}, PrismaClient: vi.fn() }))
vi.mock("@/lib/config", () => ({ default: { app: { baseURL: "https://app.test" } } }))
vi.mock("@/lib/workspace-scope", () => ({ unscoped: (fn: () => unknown) => fn() }))
vi.mock("@/lib/audit", () => ({ recordSystemAudit: vi.fn().mockResolvedValue(undefined), recordDocumentAudit: vi.fn() }))
vi.mock("@/lib/email", () => ({ sendReminderEmail: vi.fn().mockResolvedValue({}) }))
vi.mock("@/lib/fx/apply-to-document", () => ({ applyFxToDocument: vi.fn().mockResolvedValue({ status: "converted" }) }))

const { migrateCompanyCurrencies, migrationTarget } = await import("@/models/company-currency-migration")
const { prisma } = await import("@/lib/db")
const { recordSystemAudit } = await import("@/lib/audit")
const { sendReminderEmail } = await import("@/lib/email")
const { applyFxToDocument } = await import("@/lib/fx/apply-to-document")

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any

const noLock = { currencyLockedAt: null, currencyLockCause: null, currencyLockProvider: null }
const riverside = { id: "w1", name: "Riverside", country: "LS", baseCurrency: "USD", ...noLock }

beforeEach(() => {
  vi.clearAllMocks()
  for (const key of Object.keys(db)) delete db[key]
  db.$transaction = vi.fn(async (fn: (tx: unknown) => unknown) => fn(db))
  db.$queryRaw = vi.fn().mockResolvedValue([])
  db.workspace = {
    findMany: vi.fn().mockResolvedValue([riverside]),
    findUniqueOrThrow: vi.fn().mockResolvedValue(noLock),
    update: vi.fn().mockResolvedValue({}),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  }
  db.integrationPush = { findFirst: vi.fn().mockResolvedValue(null) }
  db.paymentRun = { findFirst: vi.fn().mockResolvedValue(null) }
  db.document = { findMany: vi.fn().mockResolvedValue([{ id: "d1" }]) }
  db.approvalWorkflowStage = { count: vi.fn().mockResolvedValue(1) }
  db.documentAuditEvent = { findMany: vi.fn().mockResolvedValue([]), update: vi.fn().mockResolvedValue({}) }
  db.workspaceMember = { findMany: vi.fn().mockResolvedValue([{ user: { email: "owner@riverside.test" } }]) }
})

describe("migrationTarget", () => {
  it("leaves the three allowed pairs alone", () => {
    expect(migrationTarget("LS", "LSL")).toBeNull()
    expect(migrationTarget("LS", "ZAR")).toBeNull()
    expect(migrationTarget("ZA", "ZAR")).toBeNull()
  })
  it("gives Lesotho LSL, South Africa ZAR, and any other country South Africa/ZAR", () => {
    expect(migrationTarget("LS", "USD")).toEqual({ country: "LS", baseCurrency: "LSL" })
    expect(migrationTarget("ZA", "USD")).toEqual({ country: "ZA", baseCurrency: "ZAR" })
    expect(migrationTarget("US", "USD")).toEqual({ country: "ZA", baseCurrency: "ZAR" })
  })
})

describe("migrateCompanyCurrencies", () => {
  it("migrates an unlocked company, re-converts its unposted documents and marks the notice pending", async () => {
    const result = await migrateCompanyCurrencies()
    expect(db.workspace.update).toHaveBeenCalledWith({ where: { id: "w1" }, data: { country: "LS", baseCurrency: "LSL" } })
    expect(recordSystemAudit).toHaveBeenCalledWith(
      { workspaceId: "w1", type: "company_currency_migrated", detail: { from: "USD", to: "LSL", count: 1, noticePending: true } },
      db,
    )
    expect(applyFxToDocument).toHaveBeenCalledWith("d1")
    expect(result.migrated).toEqual([{ workspaceId: "w1", name: "Riverside", from: "USD", to: "LSL", count: 1 }])
    expect(result.supportList).toEqual([])
  })

  it("does not mark a notice when no approval limit is set", async () => {
    db.approvalWorkflowStage.count.mockResolvedValue(0)
    await migrateCompanyCurrencies()
    expect(recordSystemAudit).toHaveBeenCalledWith(expect.objectContaining({ detail: expect.objectContaining({ noticePending: false }) }), db)
  })

  it("backfills the lock from the earliest succeeded push and puts that company on the support list", async () => {
    const at = new Date("2026-09-12T10:00:00Z")
    db.integrationPush.findFirst.mockResolvedValue({ provider: "xero", completedAt: at, createdAt: at, document: { docType: "bank_statement" } })
    db.paymentRun.findFirst.mockResolvedValue({ createdAt: new Date("2026-09-20T10:00:00Z") })
    const result = await migrateCompanyCurrencies()
    expect(db.workspace.updateMany).toHaveBeenCalledWith({
      where: { id: "w1", currencyLockedAt: null },
      data: { currencyLockedAt: at, currencyLockCause: "bank_statement", currencyLockProvider: "xero" },
    })
    expect(db.workspace.update).not.toHaveBeenCalled()
    expect(result.supportList).toEqual([{ workspaceId: "w1", name: "Riverside", country: "LS", baseCurrency: "USD", cause: "bank_statement", provider: "xero", at }])
  })

  it("backfills a payment batch lock when the batch came first", async () => {
    const at = new Date("2026-09-01T10:00:00Z")
    db.paymentRun.findFirst.mockResolvedValue({ createdAt: at })
    const result = await migrateCompanyCurrencies()
    expect(db.workspace.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { currencyLockedAt: at, currencyLockCause: "payment_batch", currencyLockProvider: null } }))
    expect(result.supportList).toHaveLength(1)
  })

  it("reads an already-recorded lock and lists the company without backfilling", async () => {
    const at = new Date("2026-09-12T10:00:00Z")
    db.workspace.findMany.mockResolvedValue([{ ...riverside, currencyLockedAt: at, currencyLockCause: "bill", currencyLockProvider: "quickbooks" }])
    db.workspace.findUniqueOrThrow.mockResolvedValue({ currencyLockedAt: at, currencyLockCause: "bill", currencyLockProvider: "quickbooks" })
    const result = await migrateCompanyCurrencies()
    expect(db.integrationPush.findFirst).not.toHaveBeenCalled()
    expect(result.supportList[0]).toMatchObject({ cause: "bill", provider: "quickbooks" })
  })

  it("writes nothing on a dry run", async () => {
    db.paymentRun.findFirst.mockResolvedValueOnce(null)
    const result = await migrateCompanyCurrencies({ dryRun: true })
    expect(db.workspace.update).not.toHaveBeenCalled()
    expect(db.workspace.updateMany).not.toHaveBeenCalled()
    expect(recordSystemAudit).not.toHaveBeenCalled()
    expect(sendReminderEmail).not.toHaveBeenCalled()
    expect(result.migrated).toEqual([{ workspaceId: "w1", name: "Riverside", from: "USD", to: "LSL", count: null }])
  })

  it("sends each pending notice to every Owner and then clears the flag", async () => {
    db.workspace.findMany.mockResolvedValue([])
    db.documentAuditEvent.findMany.mockResolvedValue([{ id: "a1", workspaceId: "w1", detail: { from: "USD", to: "ZAR", count: 2, noticePending: true } }])
    db.workspaceMember.findMany.mockResolvedValue([{ user: { email: "a@x.test" } }, { user: { email: "b@x.test" } }])
    const result = await migrateCompanyCurrencies()
    expect(db.workspaceMember.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { workspaceId: "w1", role: "owner" } }))
    expect(sendReminderEmail).toHaveBeenCalledTimes(2)
    expect(sendReminderEmail).toHaveBeenCalledWith({
      to: "a@x.test",
      subject: "Currency changed to ZAR",
      heading: "Currency changed to ZAR",
      body: "Currency changed to ZAR. Check your approval limits; they were set in USD.",
      actionUrl: "https://app.test/workspaces/w1/admin/approval-flows",
      actionLabel: "Open approval flows",
    })
    expect(db.documentAuditEvent.update).toHaveBeenCalledWith({ where: { id: "a1" }, data: { detail: { from: "USD", to: "ZAR", count: 2, noticePending: false } } })
    expect(result.noticesSent).toBe(1)
  })

  it("leaves the flag pending when a send fails, so a re-run retries it", async () => {
    db.workspace.findMany.mockResolvedValue([])
    db.documentAuditEvent.findMany.mockResolvedValue([{ id: "a1", workspaceId: "w1", detail: { from: "USD", to: "ZAR", count: 0, noticePending: true } }])
    vi.mocked(sendReminderEmail).mockRejectedValueOnce(new Error("resend down"))
    const result = await migrateCompanyCurrencies()
    expect(db.documentAuditEvent.update).not.toHaveBeenCalled()
    expect(result.noticesSent).toBe(0)
  })
})
