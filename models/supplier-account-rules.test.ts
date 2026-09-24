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
      select: { id: true, supplierName: true, accountExternalId: true, lastUsedAt: true },
      orderBy: { supplierName: "asc" },
    })
  })
})

describe("deleteSupplierAccountRule", () => {
  it("deletes scoped to workspace, connection, and rule id — no cross-workspace forget", async () => {
    mockDeleteMany.mockResolvedValue({ count: 1 })
    await deleteSupplierAccountRule("ws1", "conn1", "rule1")
    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { workspaceId: "ws1", connectionId: "conn1", id: "rule1" } })
  })
})
