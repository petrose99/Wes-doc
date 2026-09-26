import { beforeEach, describe, expect, it, vi } from "vitest"

const mockUpdateMany = vi.fn()
const mockFindMany = vi.fn()
const mockPushCount = vi.fn()
const mockPushFindMany = vi.fn()
const mockAttachmentFindFirst = vi.fn()
const mockEnqueueAttachmentForPush = vi.fn()
const mockKickIntegrationAttachDrain = vi.fn()

vi.mock("@/lib/db", () => ({
  prisma: {
    integrationConnection: {
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
    },
    accountingEntity: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
    integrationPush: {
      count: (...args: unknown[]) => mockPushCount(...args),
      findMany: (...args: unknown[]) => mockPushFindMany(...args),
    },
    integrationAttachment: {
      findFirst: (...args: unknown[]) => mockAttachmentFindFirst(...args),
    },
  },
}))

vi.mock("@/lib/integration-attach", () => ({
  enqueueAttachmentForPush: (...args: unknown[]) => mockEnqueueAttachmentForPush(...args),
  kickIntegrationAttachDrain: (...args: unknown[]) => mockKickIntegrationAttachDrain(...args),
}))

const {
  resolveAccountNames, setWorkspaceIntegrationTenant, setWorkspaceIntegrationDefaultAccount,
  countBackfillableAttachments, queueBackfillAttachments, getDocumentAttachment,
} = await import("@/models/integrations")

beforeEach(() => { vi.clearAllMocks() })

describe("resolveAccountNames", () => {
  it("omits ids the AccountingEntity lookup misses, rather than falling back to the raw id (#430)", async () => {
    mockFindMany.mockResolvedValue([{ externalId: "acc-1", name: "Fuel" }])
    const result = await resolveAccountNames("conn1", ["acc-1", "acc-missing"])
    expect(result).toEqual({ "acc-1": "Fuel" })
    expect(result).not.toHaveProperty("acc-missing")
  })

  it("returns an empty map for an empty id list without querying", async () => {
    const result = await resolveAccountNames("conn1", [])
    expect(result).toEqual({})
    expect(mockFindMany).not.toHaveBeenCalled()
  })
})

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

describe("setWorkspaceIntegrationDefaultAccount", () => {
  it("flips defaultExpenseAccountGuessed to false — an Owner's pick ends the guessed state (#429)", async () => {
    mockUpdateMany.mockResolvedValue({ count: 1 })
    await setWorkspaceIntegrationDefaultAccount("ws1", "conn1", { id: "acc-1", name: "General Expenses" })
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: "conn1", workspaceId: "ws1" },
      data: { defaultExpenseAccountId: "acc-1", defaultExpenseAccountName: "General Expenses", defaultExpenseAccountGuessed: false },
    })
  })

  it("throws when no matching connection is found", async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 })
    await expect(
      setWorkspaceIntegrationDefaultAccount("ws1", "conn1", { id: "acc-1", name: "General Expenses" })
    ).rejects.toThrow("integration_connection_not_found")
  })
})

describe("countBackfillableAttachments (#461)", () => {
  it("counts succeeded pushes with no attachment row, scoped to the workspace", async () => {
    mockPushCount.mockResolvedValue(3)
    const count = await countBackfillableAttachments("ws1")
    expect(count).toBe(3)
    expect(mockPushCount).toHaveBeenCalledWith({ where: { workspaceId: "ws1", status: "succeeded", attachment: null } })
  })
})

describe("queueBackfillAttachments (#461)", () => {
  it("enqueues an attach for every backfillable push and kicks the drain once", async () => {
    mockPushFindMany.mockResolvedValue([{ id: "push1" }, { id: "push2" }])
    const queued = await queueBackfillAttachments("ws1")
    expect(queued).toBe(2)
    expect(mockEnqueueAttachmentForPush).toHaveBeenCalledWith("push1")
    expect(mockEnqueueAttachmentForPush).toHaveBeenCalledWith("push2")
    expect(mockKickIntegrationAttachDrain).toHaveBeenCalledTimes(1)
  })

  it("does not kick the drain when there is nothing to back-fill", async () => {
    mockPushFindMany.mockResolvedValue([])
    const queued = await queueBackfillAttachments("ws1")
    expect(queued).toBe(0)
    expect(mockKickIntegrationAttachDrain).not.toHaveBeenCalled()
  })
})

describe("getDocumentAttachment (#462)", () => {
  it("returns the most recent attach for the document, scoped to the workspace", async () => {
    mockAttachmentFindFirst.mockResolvedValue({
      status: "failed", attempts: 5, errorCode: "attach_oversize", provider: "xero",
      connection: { status: "connected" },
    })
    const result = await getDocumentAttachment("ws1", "doc1")
    expect(result).toEqual({
      status: "failed", attempts: 5, errorCode: "attach_oversize", provider: "xero",
      connection: { status: "connected" },
    })
    expect(mockAttachmentFindFirst).toHaveBeenCalledWith({
      where: { workspaceId: "ws1", documentId: "doc1" },
      orderBy: { createdAt: "desc" },
      select: { status: true, attempts: true, errorCode: true, provider: true, connection: { select: { status: true } } },
    })
  })

  it("returns null when the document has never had an attach queued", async () => {
    mockAttachmentFindFirst.mockResolvedValue(null)
    expect(await getDocumentAttachment("ws1", "doc1")).toBeNull()
  })
})
