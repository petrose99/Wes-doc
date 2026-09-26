import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/db", () => ({ prisma: {} }))
vi.mock("@/prisma/client", () => ({ Prisma: {}, PrismaClient: vi.fn() }))
vi.mock("@/lib/audit", () => ({ recordDocumentAudit: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/lib/fx/apply-to-document", () => ({ applyFxToDocument: vi.fn().mockResolvedValue({ status: "converted" }) }))

vi.mock("@/lib/integrations/ledger-currency", () => ({ requeueLedgerCurrencyFailures: vi.fn().mockResolvedValue(3) }))

const { changeCompanyCurrency, countUnpostedDocuments, getCurrencyLock, readCompanyCurrencyForPush, recordCurrencyLock } = await import("@/models/company-currency")
const { requeueLedgerCurrencyFailures } = await import("@/lib/integrations/ledger-currency")
const { prisma } = await import("@/lib/db")
const { recordDocumentAudit } = await import("@/lib/audit")
const { applyFxToDocument } = await import("@/lib/fx/apply-to-document")

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any

const unlocked = { country: "LS", baseCurrency: "LSL", currencyLockedAt: null, currencyLockCause: null, currencyLockProvider: null }

beforeEach(() => {
  vi.clearAllMocks()
  for (const key of Object.keys(db)) delete db[key]
  db.$transaction = vi.fn(async (fn: (tx: unknown) => unknown) => fn(db))
  db.$queryRaw = vi.fn().mockResolvedValue([])
  db.workspace = { findUniqueOrThrow: vi.fn().mockResolvedValue(unlocked), update: vi.fn().mockResolvedValue({}), updateMany: vi.fn().mockResolvedValue({ count: 1 }) }
  db.integrationPush = { count: vi.fn().mockResolvedValue(0) }
  db.document = { findMany: vi.fn().mockResolvedValue([{ id: "d1" }, { id: "d2" }]), count: vi.fn().mockResolvedValue(2) }
})

describe("readCompanyCurrencyForPush", () => {
  it("reads the currency FOR SHARE, so a push waits for a currency change in progress and sees its result", async () => {
    db.$queryRaw.mockResolvedValue([{ base_currency: "ZAR" }])
    await expect(readCompanyCurrencyForPush("w1")).resolves.toBe("ZAR")
    const sql = (db.$queryRaw.mock.calls[0][0] as string[]).join("?")
    expect(sql).toMatch(/FROM workspaces WHERE id = \?::uuid FOR SHARE/)
  })

  it("throws for a missing workspace rather than judge the push in another currency", async () => {
    db.$queryRaw.mockResolvedValue([])
    await expect(readCompanyCurrencyForPush("w1")).rejects.toThrow("workspace_not_found")
  })
})

describe("getCurrencyLock", () => {
  it("is unlocked while nothing has been recorded", async () => {
    await expect(getCurrencyLock("w1")).resolves.toEqual({ locked: false })
  })

  it("reads the recorded cause, provider and date", async () => {
    const at = new Date("2026-09-12T10:00:00Z")
    db.workspace.findUniqueOrThrow.mockResolvedValue({ ...unlocked, currencyLockedAt: at, currencyLockCause: "bill", currencyLockProvider: "xero" })
    await expect(getCurrencyLock("w1")).resolves.toEqual({ locked: true, cause: "bill", provider: "xero", at })
  })
})

describe("recordCurrencyLock", () => {
  it("sets the lock only when none is recorded, so a later push or a deletion never moves it", async () => {
    const at = new Date("2026-09-12T10:00:00Z")
    await recordCurrencyLock("w1", "payment_batch", null, at)
    expect(db.workspace.updateMany).toHaveBeenCalledWith({
      where: { id: "w1", currencyLockedAt: null },
      data: { currencyLockedAt: at, currencyLockCause: "payment_batch", currencyLockProvider: null },
    })
  })
})

describe("countUnpostedDocuments", () => {
  it("counts the company's documents with no succeeded push", async () => {
    await expect(countUnpostedDocuments("w1")).resolves.toBe(2)
    expect(db.document.count).toHaveBeenCalledWith({ where: { workspaceId: "w1", integrationPushes: { none: { status: "succeeded" } } } })
  })
})

describe("changeCompanyCurrency", () => {
  it("locks the workspace row, changes the currency, audits it and re-converts every unposted document", async () => {
    await expect(changeCompanyCurrency("w1", "ZAR", "u1")).resolves.toEqual({ count: 2, requeued: 3 })

    expect(db.$queryRaw).toHaveBeenCalled()
    expect(db.workspace.update).toHaveBeenCalledWith({ where: { id: "w1" }, data: { baseCurrency: "ZAR" } })
    expect(requeueLedgerCurrencyFailures).toHaveBeenCalledWith("w1", expect.any(Date), db)
    expect(recordDocumentAudit).toHaveBeenCalledWith(
      { workspaceId: "w1", actorId: "u1", type: "company_currency_changed", detail: { from: "LSL", to: "ZAR", count: 2, requeued: 3 } },
      db,
    )
    expect(vi.mocked(applyFxToDocument).mock.calls.map((c) => c[0])).toEqual(["d1", "d2"])
  })

  it("refuses once the currency is locked, and changes nothing", async () => {
    db.workspace.findUniqueOrThrow.mockResolvedValue({ ...unlocked, currencyLockedAt: new Date(), currencyLockCause: "bill", currencyLockProvider: "xero" })
    await expect(changeCompanyCurrency("w1", "ZAR", "u1")).rejects.toThrow("company_currency_locked")
    expect(db.workspace.update).not.toHaveBeenCalled()
    expect(applyFxToDocument).not.toHaveBeenCalled()
  })

  it("refuses a currency the company's country does not allow", async () => {
    db.workspace.findUniqueOrThrow.mockResolvedValue({ ...unlocked, country: "ZA", baseCurrency: "ZAR" })
    await expect(changeCompanyCurrency("w1", "LSL", "u1")).rejects.toThrow("company_currency_not_allowed")
    expect(db.workspace.update).not.toHaveBeenCalled()
  })

  it("refuses while a push of this company is being posted (leased, pending)", async () => {
    db.integrationPush.count.mockResolvedValue(1)
    await expect(changeCompanyCurrency("w1", "ZAR", "u1")).rejects.toThrow("company_currency_push_in_flight")
    expect(db.integrationPush.count).toHaveBeenCalledWith({ where: { workspaceId: "w1", status: "pending", leaseUntil: { gt: expect.any(Date) } } })
    expect(db.workspace.update).not.toHaveBeenCalled()
  })

  it("is a no-op when the currency is unchanged", async () => {
    await expect(changeCompanyCurrency("w1", "LSL", "u1")).resolves.toEqual({ count: 0, requeued: 0 })
    expect(requeueLedgerCurrencyFailures).not.toHaveBeenCalled()
    expect(db.workspace.update).not.toHaveBeenCalled()
    expect(recordDocumentAudit).not.toHaveBeenCalled()
  })
})
