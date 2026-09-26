import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/db", () => ({ prisma: {} }))
vi.mock("@/prisma/client", () => ({ Prisma: { JsonNull: null } }))
vi.mock("@/lib/integrations/quickbooks/client", () => ({
  listAccounts: vi.fn(),
  listVendors: vi.fn(),
  listTaxCodes: vi.fn(),
  listClasses: vi.fn(),
  listDepartments: vi.fn(),
  listCustomers: vi.fn(),
  listItems: vi.fn(),
}))
vi.mock("@/lib/integrations/xero/client", () => ({
  listAccounts: vi.fn(),
  listContacts: vi.fn(),
  listTaxRates: vi.fn(),
  listTrackingCategories: vi.fn(),
  listItems: vi.fn(),
}))
vi.mock("@/lib/integrations/ledger-capabilities", () => ({ readLedgerCapabilities: vi.fn() }))
vi.mock("@/models/document-checks", () => ({ refreshLineCodingChecksForConnection: vi.fn() }))

const { syncAccountingEntities } = await import("@/lib/integrations/sync")
const { readLedgerCapabilities } = await import("@/lib/integrations/ledger-capabilities")
const { prisma } = await import("@/lib/db")
const quickbooks = await import("@/lib/integrations/quickbooks/client")
const xero = await import("@/lib/integrations/xero/client")
const { refreshLineCodingChecksForConnection } = await import("@/models/document-checks")

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any

beforeEach(() => {
  vi.clearAllMocks()
  for (const key of Object.keys(db)) delete db[key]
  db.accountingEntity = { upsert: vi.fn(), updateMany: vi.fn() }
  db.$transaction = vi.fn((ops: unknown[]) => Promise.all(ops))
  vi.mocked(readLedgerCapabilities).mockResolvedValue({ vat: true, tracking: [], location: false, customer: true, billable: false, itemLines: false })
  vi.mocked(quickbooks.listCustomers).mockResolvedValue([])
  vi.mocked(xero.listTrackingCategories).mockResolvedValue([])
  vi.mocked(xero.listItems).mockResolvedValue([])
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const upserted = (entityType: string, externalId: string): any => vi.mocked(db.accountingEntity.upsert).mock.calls
  .map(([arg]: [{ where: { connectionId_entityType_externalId: { entityType: string; externalId: string } } }]) => arg)
  .find((arg: { where: { connectionId_entityType_externalId: { entityType: string; externalId: string } } }) => arg.where.connectionId_entityType_externalId.entityType === entityType && arg.where.connectionId_entityType_externalId.externalId === externalId)

describe("syncAccountingEntities", () => {
  it("reads and stores the ledger's capabilities fresh before any entity is synced", async () => {
    const connection = { id: "c1", workspaceId: "w1", provider: "quickbooks", externalTenantId: "realm1" }
    db.integrationConnection = { findUniqueOrThrow: vi.fn().mockResolvedValue(connection) }
    vi.mocked(readLedgerCapabilities).mockRejectedValueOnce(new Error("ledger_capabilities_unreadable"))

    await expect(syncAccountingEntities("c1")).rejects.toThrow("ledger_capabilities_unreadable")

    expect(readLedgerCapabilities).toHaveBeenCalledWith(connection)
    expect(quickbooks.listAccounts).not.toHaveBeenCalled()
    expect(db.accountingEntity.upsert).not.toHaveBeenCalled()
  })

  it("throws when the connection has no external tenant id yet", async () => {
    db.integrationConnection = { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "c1", workspaceId: "w1", provider: "quickbooks", externalTenantId: null }) }
    await expect(syncAccountingEntities("c1")).rejects.toThrow("integration_connection_not_ready")
  })

  it("upserts every QuickBooks account, vendor, and tax code, and marks stale rows inactive", async () => {
    db.integrationConnection = { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "c1", workspaceId: "w1", provider: "quickbooks", externalTenantId: "realm1" }) }
    vi.mocked(quickbooks.listAccounts).mockResolvedValue([{ id: "a1", name: "Office supplies", active: true }])
    vi.mocked(quickbooks.listVendors).mockResolvedValue([{ id: "v1", name: "Acme", active: true }])
    vi.mocked(quickbooks.listTaxCodes).mockResolvedValue([{ id: "t1", name: "Standard", active: true }])

    await syncAccountingEntities("c1")

    expect(db.accountingEntity.upsert).toHaveBeenCalledTimes(3)
    expect(db.accountingEntity.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { connectionId_entityType_externalId: { connectionId: "c1", entityType: "account", externalId: "a1" } },
    }))
    expect(db.accountingEntity.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ connectionId: "c1" }),
      data: { active: false },
    }))
    // ADR 0014: what the ledger takes may have changed — re-judge its unposted bills' coding.
    expect(refreshLineCodingChecksForConnection).toHaveBeenCalledWith("w1", "c1")
  })

  it("upserts Xero accounts keyed by code, vendors keyed by id, and tax rates keyed by TaxType", async () => {
    db.integrationConnection = { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "c2", workspaceId: "w1", provider: "xero", externalTenantId: "tenant1" }) }
    vi.mocked(xero.listAccounts).mockResolvedValue([{ code: "400", name: "Office supplies", active: true, accountClass: "EXPENSE", taxType: "INPUT2" }])
    vi.mocked(xero.listContacts).mockResolvedValue([{ id: "contact1", name: "Acme", active: true }])
    vi.mocked(xero.listTaxRates).mockResolvedValue([{ taxType: "INPUT2", name: "Standard rate", percent: 15, canApplyToExpenses: true, active: true }])

    await syncAccountingEntities("c2")

    expect(db.accountingEntity.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { connectionId_entityType_externalId: { connectionId: "c2", entityType: "account", externalId: "400" } },
    }))
    expect(db.accountingEntity.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { connectionId_entityType_externalId: { connectionId: "c2", entityType: "tax_rate", externalId: "INPUT2" } },
    }))
    expect(upserted("tax_rate", "INPUT2").create).toMatchObject({ name: "Standard rate", taxRatePercent: 15, forPurchases: true })
    expect(upserted("account", "400").update).toMatchObject({ defaultTaxCode: "INPUT2" })
  })

  it("upserts Xero tracking options under their category, inactive when either is archived", async () => {
    db.integrationConnection = { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "c2", workspaceId: "w1", provider: "xero", externalTenantId: "tenant1" }) }
    vi.mocked(xero.listAccounts).mockResolvedValue([])
    vi.mocked(xero.listContacts).mockResolvedValue([])
    vi.mocked(xero.listTaxRates).mockResolvedValue([])
    vi.mocked(xero.listTrackingCategories).mockResolvedValue([
      { id: "t1", name: "Region", status: "ACTIVE", options: [{ id: "o1", name: "North", status: "ACTIVE" }, { id: "o2", name: "South", status: "ARCHIVED" }] },
      { id: "t2", name: "Old", status: "ARCHIVED", options: [{ id: "o3", name: "Legacy", status: "ACTIVE" }] },
    ])

    await syncAccountingEntities("c2")

    expect(upserted("tracking_option", "o1").create).toMatchObject({ name: "North", active: true, parentExternalId: "t1", parentName: "Region" })
    expect(upserted("tracking_option", "o2").create).toMatchObject({ active: false })
    expect(upserted("tracking_option", "o3").create).toMatchObject({ active: false, parentName: "Old" })
    expect(upserted("customer", "o1")).toBeUndefined()
  })

  it("upserts QuickBooks classes, locations, customers and widened tax codes when the plan has them", async () => {
    db.integrationConnection = { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "c1", workspaceId: "w1", provider: "quickbooks", externalTenantId: "realm1" }) }
    vi.mocked(readLedgerCapabilities).mockResolvedValue({ vat: true, tracking: [{ id: "class", name: "Class" }], location: true, customer: true, billable: true, itemLines: true })
    vi.mocked(quickbooks.listAccounts).mockResolvedValue([{ id: "a1", name: "Fuel", active: true, accountType: "Expense", taxCodeId: "3" }])
    vi.mocked(quickbooks.listVendors).mockResolvedValue([])
    vi.mocked(quickbooks.listTaxCodes).mockResolvedValue([{ id: "3", name: "Standard", active: true, forPurchases: true, percent: 15 }])
    vi.mocked(quickbooks.listClasses).mockResolvedValue([{ id: "k1", name: "Retail", active: true }])
    vi.mocked(quickbooks.listDepartments).mockResolvedValue([{ id: "d1", name: "Cape Town", active: true }])
    vi.mocked(quickbooks.listCustomers).mockResolvedValue([{ id: "cu1", name: "Brightside", active: true }])
    vi.mocked(quickbooks.listItems).mockResolvedValue([{ id: "i1", code: "SKU1", name: "Widget", itemType: "Inventory", trackedInventory: true, active: true, accountExternalId: "a1", taxCodeExternalId: "3" }])

    await syncAccountingEntities("c1")

    expect(upserted("tracking_option", "k1").create).toMatchObject({ name: "Retail", parentExternalId: "class", parentName: "Class" })
    expect(upserted("location", "d1").create).toMatchObject({ name: "Cape Town" })
    expect(upserted("customer", "cu1").create).toMatchObject({ name: "Brightside" })
    expect(upserted("tax_rate", "3").create).toMatchObject({ taxRatePercent: 15, forPurchases: true })
    expect(upserted("account", "a1").create).toMatchObject({ defaultTaxCode: "3" })
    expect(upserted("item", "i1").create).toMatchObject({ code: "SKU1", name: "Widget", trackedInventory: true, purchaseAccountExternalId: "a1", defaultTaxCode: "3", itemType: "Inventory" })
  })

  it("does not read QuickBooks classes, locations or items the plan does not have", async () => {
    db.integrationConnection = { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "c1", workspaceId: "w1", provider: "quickbooks", externalTenantId: "realm1" }) }
    vi.mocked(quickbooks.listAccounts).mockResolvedValue([])
    vi.mocked(quickbooks.listVendors).mockResolvedValue([])
    vi.mocked(quickbooks.listTaxCodes).mockResolvedValue([])

    await syncAccountingEntities("c1")

    expect(quickbooks.listClasses).not.toHaveBeenCalled()
    expect(quickbooks.listDepartments).not.toHaveBeenCalled()
    expect(quickbooks.listItems).not.toHaveBeenCalled()
    expect(quickbooks.listCustomers).toHaveBeenCalled()
  })

  it("always syncs Xero items — no plan gate", async () => {
    db.integrationConnection = { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "c2", workspaceId: "w1", provider: "xero", externalTenantId: "tenant1" }) }
    vi.mocked(xero.listAccounts).mockResolvedValue([])
    vi.mocked(xero.listContacts).mockResolvedValue([])
    vi.mocked(xero.listTaxRates).mockResolvedValue([])
    vi.mocked(xero.listItems).mockResolvedValue([{ id: "i1", code: null, name: "Consulting", itemType: "untracked", trackedInventory: false, active: true, accountExternalId: "400", taxCodeExternalId: "INPUT2" }])

    await syncAccountingEntities("c2")

    expect(xero.listItems).toHaveBeenCalledWith("tenant1", "c2")
    expect(upserted("item", "i1").create).toMatchObject({ name: "Consulting", trackedInventory: false, purchaseAccountExternalId: "400", defaultTaxCode: "INPUT2" })
  })

  it("guesses the Default account off the freshly-synced chart when still guessed (#429)", async () => {
    db.integrationConnection = {
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "c1", workspaceId: "w1", provider: "quickbooks", externalTenantId: "realm1", defaultExpenseAccountGuessed: true }),
      update: vi.fn(),
    }
    vi.mocked(quickbooks.listAccounts).mockResolvedValue([
      { id: "a1", name: "Office supplies", active: true, accountType: "Expense" },
      { id: "a2", name: "Uncategorized Expense", active: true, accountType: "Expense" },
    ])
    vi.mocked(quickbooks.listVendors).mockResolvedValue([])
    vi.mocked(quickbooks.listTaxCodes).mockResolvedValue([])

    await syncAccountingEntities("c1")

    expect(db.integrationConnection.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { defaultExpenseAccountId: "a2", defaultExpenseAccountName: "Uncategorized Expense", defaultExpenseAccountGuessed: true },
    })
  })

  it("does not overwrite an Owner-confirmed Default on re-sync (#429)", async () => {
    db.integrationConnection = {
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "c1", workspaceId: "w1", provider: "quickbooks", externalTenantId: "realm1", defaultExpenseAccountGuessed: false }),
      update: vi.fn(),
    }
    vi.mocked(quickbooks.listAccounts).mockResolvedValue([{ id: "a2", name: "Uncategorized Expense", active: true, accountType: "Expense" }])
    vi.mocked(quickbooks.listVendors).mockResolvedValue([])
    vi.mocked(quickbooks.listTaxCodes).mockResolvedValue([])

    await syncAccountingEntities("c1")

    expect(db.integrationConnection.update).not.toHaveBeenCalled()
  })

  it("leaves the Default null when no account matches the catch-all name (#429)", async () => {
    db.integrationConnection = {
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "c1", workspaceId: "w1", provider: "quickbooks", externalTenantId: "realm1", defaultExpenseAccountGuessed: true }),
      update: vi.fn(),
    }
    vi.mocked(quickbooks.listAccounts).mockResolvedValue([{ id: "a1", name: "Office supplies", active: true, accountType: "Expense" }])
    vi.mocked(quickbooks.listVendors).mockResolvedValue([])
    vi.mocked(quickbooks.listTaxCodes).mockResolvedValue([])

    await syncAccountingEntities("c1")

    expect(db.integrationConnection.update).not.toHaveBeenCalled()
  })
})
