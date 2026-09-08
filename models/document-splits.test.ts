import { beforeEach, describe, expect, it, vi } from "vitest"

const mockCreate = vi.fn()
const mockUpdate = vi.fn()
const mockUpdateMany = vi.fn()
const mockFindMany = vi.fn()
const mockFindUniqueOrThrow = vi.fn()
const mockJobCreate = vi.fn()

const mockPrisma = {
  document: {
    create: (...args: unknown[]) => mockCreate(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
    updateMany: (...args: unknown[]) => mockUpdateMany(...args),
    findMany: (...args: unknown[]) => mockFindMany(...args),
    findUniqueOrThrow: (...args: unknown[]) => mockFindUniqueOrThrow(...args),
  },
  documentProcessingJob: {
    create: (...args: unknown[]) => mockJobCreate(...args),
    updateMany: (...args: unknown[]) => mockUpdateMany(...args),
  },
  $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(mockPrisma)),
}

vi.mock("@/lib/db", () => ({
  prisma: mockPrisma,
}))

const { createChildDocuments, listChildDocuments, markSplitStatus } = await import("@/models/document-splits")

beforeEach(() => { vi.clearAllMocks() })

describe("createChildDocuments", () => {
  it("creates children and marks parent as split", async () => {
    mockFindUniqueOrThrow.mockResolvedValue({
      source: "upload",
      mimeType: "application/pdf",
      sizeBytes: 1000,
      sha256: "abc123",
      storageKey: "key",
      templateId: null,
      templateVersionId: null,
      uploadBatchId: null,
      receivedAt: new Date(),
    })
    mockCreate.mockResolvedValue({})
    mockUpdate.mockResolvedValue({})
    mockUpdateMany.mockResolvedValue({ count: 0 })
    mockJobCreate.mockResolvedValue({})

    const ids = await createChildDocuments("ws1", "f1", "parent1", [
      { parentDocumentId: "parent1", pageRange: "1-2", filename: "part1.pdf" },
      { parentDocumentId: "parent1", pageRange: "3-4", filename: "part2.pdf" },
    ])

    expect(ids).toHaveLength(2)
    expect(mockCreate).toHaveBeenCalledTimes(2)
    expect(mockJobCreate).toHaveBeenCalledTimes(2)
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "parent1" },
      data: { splitStatus: "split", status: "split" },
    }))
  })
})

describe("listChildDocuments", () => {
  it("returns children ordered by receivedAt", async () => {
    mockFindMany.mockResolvedValue([
      { id: "c1", filename: "part1.pdf", pageRange: "1-2", status: "received" },
    ])
    const result = await listChildDocuments("ws1", "parent1")
    expect(result).toHaveLength(1)
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { workspaceId: "ws1", parentDocumentId: "parent1" },
    }))
  })
})

describe("markSplitStatus", () => {
  it("updates split status", async () => {
    mockUpdate.mockResolvedValue({})
    await markSplitStatus("doc1", "rejected")
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: { splitStatus: "rejected" },
    }))
  })
})
