import { beforeEach, describe, expect, it, vi } from "vitest"

const mockUpdateMany = vi.fn()

vi.mock("@/lib/db", () => ({
  prisma: {
    integrationConnection: {
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
    },
  },
}))

const { setWorkspaceIntegrationTenant } = await import("@/models/integrations")

beforeEach(() => { vi.clearAllMocks() })

describe("setWorkspaceIntegrationTenant", () => {
  it("writes the chosen business scoped to the workspace and the sage provider", async () => {
    mockUpdateMany.mockResolvedValue({ count: 1 })
    await setWorkspaceIntegrationTenant("ws1", "conn1", { externalTenantId: "biz-1", tenantName: "Acme Ltd" })
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: "conn1", workspaceId: "ws1", provider: "sage" },
      data: { externalTenantId: "biz-1", tenantName: "Acme Ltd" },
    })
  })

  it("throws when no matching connection is found (wrong workspace, wrong provider, or missing)", async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 })
    await expect(
      setWorkspaceIntegrationTenant("ws1", "conn1", { externalTenantId: "biz-1", tenantName: "Acme Ltd" })
    ).rejects.toThrow("integration_connection_not_found")
  })
})
