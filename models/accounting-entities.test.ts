import { beforeEach, describe, expect, it, vi } from "vitest"

const mockFindMany = vi.fn()

vi.mock("@/lib/db", () => ({
  prisma: {
    accountingEntity: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}))

const { listAccountingEntities, listAccountingEntitiesIncludingInactive } = await import("@/models/accounting-entities")

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
