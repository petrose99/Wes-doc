import { beforeEach, describe, expect, it, vi } from "vitest"

const mockFindMany = vi.fn()

vi.mock("@/lib/db", () => ({
  prisma: {
    accountingEntity: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}))

const { listAccountingEntities, listAccountingEntitiesIncludingInactive, loadLineCodingContext } = await import("@/models/accounting-entities")

beforeEach(() => { vi.clearAllMocks() })

describe("listAccountingEntitiesIncludingInactive", () => {
  it("scopes to workspace and entity type without filtering on active (#429 archived-account detection)", async () => {
    mockFindMany.mockResolvedValue([])
    await listAccountingEntitiesIncludingInactive("ws1", "conn1", "account")
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { workspaceId: "ws1", connectionId: "conn1", entityType: "account" },
      orderBy: { name: "asc" },
    })
  })
})

describe("listAccountingEntities", () => {
  it("lists the line-coding entity types, active only", async () => {
    mockFindMany.mockResolvedValue([])
    for (const entityType of ["tracking_option", "location", "customer"] as const) {
      await listAccountingEntities("ws1", entityType)
      expect(mockFindMany).toHaveBeenLastCalledWith({ where: { workspaceId: "ws1", entityType, active: true }, orderBy: { name: "asc" } })
    }
  })
})

describe("loadLineCodingContext", () => {
  const capabilities = { vat: true, tracking: [{ id: "class", name: "Class" }], location: false, customer: true, billable: false, itemLines: true }

  it("is null until the ledger's capabilities have been read", async () => {
    expect(await loadLineCodingContext("ws1", { id: "conn1", provider: "quickbooks", ledgerCapabilities: null })).toBeNull()
    expect(mockFindMany).not.toHaveBeenCalled()
  })

  it("reads active references, purchase rates, Tracking names (inactive options still named) and Item references/names, scoped to the connection (#459)", async () => {
    mockFindMany.mockResolvedValue([
      { entityType: "tax_rate", externalId: "TAX15", parentExternalId: null, forPurchases: true, active: true, name: "VAT 15%", taxRatePercent: "15.0000" },
      { entityType: "tax_rate", externalId: "OLD", parentExternalId: null, forPurchases: true, active: false, name: "Old", taxRatePercent: null },
      { entityType: "tracking_option", externalId: "c1", parentExternalId: "class", forPurchases: null, active: true, name: "Retail", taxRatePercent: null },
      { entityType: "tracking_option", externalId: "c9", parentExternalId: "class", forPurchases: null, active: false, name: "Wholesale", taxRatePercent: null },
      { entityType: "item", externalId: "item1", parentExternalId: null, forPurchases: null, active: true, name: "Widget", taxRatePercent: null, trackedInventory: true },
      { entityType: "item", externalId: "item9", parentExternalId: null, forPurchases: null, active: false, name: "Gone item", taxRatePercent: null, trackedInventory: false },
    ])
    const context = await loadLineCodingContext("ws1", { id: "conn1", provider: "quickbooks", ledgerCapabilities: capabilities })
    expect(mockFindMany.mock.calls[0][0].where).toEqual({ workspaceId: "ws1", connectionId: "conn1", entityType: { in: ["tax_rate", "tracking_option", "location", "item"] } })
    expect(context?.references.taxCodes).toEqual(new Set(["TAX15"]))
    expect(context?.references.trackingOptions).toEqual(new Set(["class:c1"]))
    expect(context?.references.items).toEqual(new Map([["item1", { trackedInventory: true }]]))
    expect(context?.taxRates).toEqual({ TAX15: 15, OLD: null })
    expect(context?.names).toEqual({ class: "Class", "class:c1": "Retail", "class:c9": "Wholesale", item1: "Widget", item9: "Gone item" })
  })
})
