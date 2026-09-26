import { beforeEach, describe, expect, it, vi } from "vitest"

const mockFindMany = vi.fn()
const mockDeleteMany = vi.fn()

vi.mock("@/lib/db", () => ({
  prisma: {
    supplierAccountRule: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
    },
  },
}))

const { listSupplierAccountRules, deleteSupplierAccountRule } = await import("@/models/supplier-account-rules")

beforeEach(() => { vi.clearAllMocks() })

describe("listSupplierAccountRules", () => {
  it("scopes to the workspace and connection, ordered by supplier name", async () => {
    mockFindMany.mockResolvedValue([])
    await listSupplierAccountRules("ws1", "conn1")
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { workspaceId: "ws1", connectionId: "conn1" },
      select: { id: true, supplierName: true, accountExternalId: true, taxCodeExternalId: true, tracking: true, locationExternalId: true, lastUsedAt: true },
      orderBy: { supplierName: "asc" },
    })
  })

  it("reads the whole coding set back, parsing Tracking tolerantly", async () => {
    const lastUsedAt = new Date("2026-09-01")
    mockFindMany.mockResolvedValue([
      { id: "r1", supplierName: "acme", accountExternalId: "a1", taxCodeExternalId: "INPUT", tracking: [{ categoryId: "region", optionId: "north" }, { bad: true }], locationExternalId: "loc1", lastUsedAt },
      { id: "r2", supplierName: "beta", accountExternalId: "a2", taxCodeExternalId: null, tracking: "not json", locationExternalId: null, lastUsedAt },
      { id: "r3", supplierName: "gamma", accountExternalId: "a3", taxCodeExternalId: null, tracking: null, locationExternalId: null, lastUsedAt },
    ])
    const rows = await listSupplierAccountRules("ws1", "conn1")
    expect(rows.map((row) => row.tracking)).toEqual([[{ categoryId: "region", optionId: "north" }], [], []])
    expect(rows[0]).toMatchObject({ taxCodeExternalId: "INPUT", locationExternalId: "loc1" })
  })
})

describe("deleteSupplierAccountRule", () => {
  it("deletes scoped to workspace, connection, and rule id — no cross-workspace forget", async () => {
    mockDeleteMany.mockResolvedValue({ count: 1 })
    await deleteSupplierAccountRule("ws1", "conn1", "rule1")
    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { workspaceId: "ws1", connectionId: "conn1", id: "rule1" } })
  })
})
