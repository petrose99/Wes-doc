import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/db", () => ({ prisma: {} }))
vi.mock("@/lib/integrations/quickbooks/client", () => ({ getCompanyInfo: vi.fn(), getPreferences: vi.fn() }))
vi.mock("@/lib/integrations/xero/client", () => ({ listTrackingCategories: vi.fn() }))

const { deriveQuickBooksCapabilities, deriveXeroCapabilities, parseLedgerCapabilities, readLedgerCapabilities, LEDGER_CAPABILITIES_REUSE_MS } = await import("@/lib/integrations/ledger-capabilities")
const { IntegrationRetryableError } = await import("@/lib/integrations/errors")
const { prisma } = await import("@/lib/db")
const quickbooks = await import("@/lib/integrations/quickbooks/client")
const xero = await import("@/lib/integrations/xero/client")

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any
const now = new Date("2026-09-27T10:00:00.000Z")

const plusCompany = { NameValue: [{ Name: "OfferingSku", Value: "QuickBooks Online Plus" }] }
const essentialsCompany = { NameValue: [{ Name: "OfferingSku", Value: "QuickBooks Online Essentials" }] }
const allOnPrefs = {
  TaxPrefs: { UsingSalesTax: true },
  AccountingInfoPrefs: { ClassTrackingPerTxnLine: true, TrackDepartments: true },
  VendorAndPurchasesPrefs: { BillableExpenseTracking: true },
}
const off = { vat: false, tracking: [], location: false, customer: false, billable: false, itemLines: false }

describe("deriveQuickBooksCapabilities", () => {
  it("Plus with every preference on reads VAT, Class tracking, Location, Customer, Billable and item lines", () => {
    expect(deriveQuickBooksCapabilities(plusCompany, allOnPrefs)).toEqual({
      vat: true, tracking: [{ id: "class", name: "Class" }], location: true, customer: true, billable: true, itemLines: true,
    })
  })

  it("a plan below Plus has no Class, Location, Billable or item lines even when the preferences say on", () => {
    expect(deriveQuickBooksCapabilities(essentialsCompany, allOnPrefs)).toEqual({ vat: true, tracking: [], location: false, customer: true, billable: false, itemLines: false })
  })

  it("Advanced counts as Plus", () => {
    const advanced = { NameValue: [{ Name: "OfferingSku", Value: "QuickBooks Online Advanced" }] }
    expect(deriveQuickBooksCapabilities(advanced, allOnPrefs)?.location).toBe(true)
  })

  it("a missing tracking, location or billable flag reads false, never a guess of true", () => {
    expect(deriveQuickBooksCapabilities(plusCompany, { TaxPrefs: { UsingSalesTax: false } })).toEqual({ vat: false, tracking: [], location: false, customer: true, billable: false, itemLines: true })
  })

  it("a missing VAT setting is unreadable — null, so nothing is posted on a guess", () => {
    expect(deriveQuickBooksCapabilities(plusCompany, { AccountingInfoPrefs: { TrackDepartments: true } })).toBeNull()
  })

  it("a missing plan is unreadable — null", () => {
    expect(deriveQuickBooksCapabilities({ NameValue: [] }, allOnPrefs)).toBeNull()
  })
})

describe("deriveXeroCapabilities", () => {
  it("VAT is always on; tracking is the first two ACTIVE categories in Xero's order", () => {
    const categories = [
      { id: "t1", name: "Region", status: "ARCHIVED", options: [] },
      { id: "t2", name: "Department", status: "ACTIVE", options: [] },
      { id: "t3", name: "Project", status: "ACTIVE", options: [] },
      { id: "t4", name: "Extra", status: "ACTIVE", options: [] },
    ]
    expect(deriveXeroCapabilities(categories)).toEqual({
      vat: true, tracking: [{ id: "t2", name: "Department" }, { id: "t3", name: "Project" }], location: false, customer: false, billable: false, itemLines: true,
    })
  })

  it("no categories means tracking off", () => {
    expect(deriveXeroCapabilities([]).tracking).toEqual([])
  })
})

describe("parseLedgerCapabilities", () => {
  it("round-trips a stored value", () => {
    const value = { vat: true, tracking: [{ id: "class", name: "Class" }], location: true, customer: true, billable: false, itemLines: true }
    expect(parseLedgerCapabilities(JSON.parse(JSON.stringify(value)))).toEqual(value)
  })

  it.each([null, undefined, "x", {}, { vat: "yes", tracking: [], location: false, customer: false, billable: false, itemLines: false }, { vat: true, tracking: [{ id: 1 }], location: false, customer: false, billable: false, itemLines: false }, { vat: true, tracking: [], location: false, customer: false, billable: false }])(
    "returns null for a shape it does not recognise (%j), never throws",
    (value) => { expect(parseLedgerCapabilities(value)).toBeNull() },
  )
})

describe("readLedgerCapabilities", () => {
  const connection = { id: "conn-1", workspaceId: "w1", provider: "quickbooks", externalTenantId: "realm-1", ledgerCapabilities: null, ledgerCapabilitiesReadAt: null }

  beforeEach(() => {
    vi.clearAllMocks()
    for (const key of Object.keys(db)) delete db[key]
    db.integrationConnection = { updateMany: vi.fn().mockResolvedValue({ count: 1 }) }
  })

  it("reads QuickBooks and stores the result scoped to the workspace", async () => {
    vi.mocked(quickbooks.getCompanyInfo).mockResolvedValue(plusCompany)
    vi.mocked(quickbooks.getPreferences).mockResolvedValue(allOnPrefs)
    const result = await readLedgerCapabilities(connection, now)
    expect(result.location).toBe(true)
    expect(quickbooks.getCompanyInfo).toHaveBeenCalledWith("realm-1", "conn-1")
    expect(db.integrationConnection.updateMany).toHaveBeenCalledWith({ where: { id: "conn-1", workspaceId: "w1" }, data: { ledgerCapabilities: result, ledgerCapabilitiesReadAt: now } })
  })

  it("reads Xero's tracking categories", async () => {
    vi.mocked(xero.listTrackingCategories).mockResolvedValue([{ id: "t2", name: "Department", status: "ACTIVE", options: [] }])
    const result = await readLedgerCapabilities({ ...connection, provider: "xero" }, now)
    expect(result.tracking).toEqual([{ id: "t2", name: "Department" }])
    expect(xero.listTrackingCategories).toHaveBeenCalledWith("realm-1", "conn-1")
  })

  it("throws a retryable ledger_capabilities_unreadable when QuickBooks does not say whether VAT is on, and stores nothing", async () => {
    vi.mocked(quickbooks.getCompanyInfo).mockResolvedValue(plusCompany)
    vi.mocked(quickbooks.getPreferences).mockResolvedValue({})
    const error = await readLedgerCapabilities(connection, now).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(IntegrationRetryableError)
    expect((error as InstanceType<typeof IntegrationRetryableError>).code).toBe("ledger_capabilities_unreadable")
    expect(db.integrationConnection.updateMany).not.toHaveBeenCalled()
  })

  it("reuses a stored read inside the reuse window without a provider call", async () => {
    const stored = { vat: true, tracking: [], location: false, customer: true, billable: false, itemLines: false }
    const fresh = { ...connection, ledgerCapabilities: stored, ledgerCapabilitiesReadAt: new Date(now.getTime() - 60_000) }
    await expect(readLedgerCapabilities(fresh, now, LEDGER_CAPABILITIES_REUSE_MS)).resolves.toEqual(stored)
    expect(quickbooks.getPreferences).not.toHaveBeenCalled()
  })

  it("reads afresh when the stored value is past the window or unparseable", async () => {
    vi.mocked(quickbooks.getCompanyInfo).mockResolvedValue(plusCompany)
    vi.mocked(quickbooks.getPreferences).mockResolvedValue(allOnPrefs)
    const stale = { ...connection, ledgerCapabilities: { vat: true, tracking: [], location: false, customer: true, billable: false, itemLines: false }, ledgerCapabilitiesReadAt: new Date(now.getTime() - LEDGER_CAPABILITIES_REUSE_MS - 1) }
    await readLedgerCapabilities(stale, now, LEDGER_CAPABILITIES_REUSE_MS)
    await readLedgerCapabilities({ ...connection, ledgerCapabilities: { junk: 1 }, ledgerCapabilitiesReadAt: now }, now, LEDGER_CAPABILITIES_REUSE_MS)
    expect(quickbooks.getPreferences).toHaveBeenCalledTimes(2)
  })

  it("a connect-only provider (Sage) has every capability off and makes no call", async () => {
    await expect(readLedgerCapabilities({ ...connection, provider: "sage" }, now)).resolves.toEqual(off)
    expect(db.integrationConnection.updateMany).not.toHaveBeenCalled()
  })

  it("a connection with no tenant yet is unreadable", async () => {
    await expect(readLedgerCapabilities({ ...connection, externalTenantId: null }, now)).rejects.toThrow("ledger_capabilities_unreadable")
  })
})
