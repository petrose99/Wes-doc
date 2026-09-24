import { beforeEach, describe, expect, it, vi } from "vitest"

const mockFindMany = vi.fn()

vi.mock("@/lib/db", () => ({
  prisma: {
    accountingEntity: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}))

const { listAccountingEntitiesIncludingInactive } = await import("@/models/accounting-entities")

beforeEach(() => { vi.clearAllMocks() })

describe("listAccountingEntitiesIncludingInactive", () => {
  it("scopes to workspace and entity type without filtering on active (#429 archived-account detection)", async () => {
    mockFindMany.mockResolvedValue([])
    await listAccountingEntitiesIncludingInactive("ws1", "account")
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { workspaceId: "ws1", entityType: "account" },
      orderBy: { name: "asc" },
    })
  })
})
