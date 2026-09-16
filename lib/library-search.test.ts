import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/db", () => ({ prisma: {} }))
vi.mock("@/lib/retrieval", () => ({
  searchDocumentChunks: vi.fn().mockResolvedValue([]),
  findMatchingDocuments: vi.fn().mockResolvedValue(null),
  searchDocumentsByContent: vi.fn().mockResolvedValue([]),
}))

const { isValidScope, runGlobalSearch } = await import("./library-search")
const { prisma } = await import("@/lib/db")
const { findMatchingDocuments } = await import("@/lib/retrieval")

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any

beforeEach(() => {
  vi.clearAllMocks()
  for (const key of Object.keys(db)) delete db[key]
  db.document = { findMany: vi.fn().mockResolvedValue([]) }
  db.workspaceSearch = { create: vi.fn().mockResolvedValue(undefined) }
})

// #249: global search's result links need each hit's docType to route to a typed destination
// instead of the nav-less /pipeline (see components/shell/global-search.tsx).
describe("runGlobalSearch", () => {
  it("enriches each result with the document's docType", async () => {
    vi.mocked(findMatchingDocuments).mockResolvedValue({
      kind: "matches", filters: [{ fieldKey: "supplier_name", op: "contains", value: "acme" }], total: 1, truncated: false,
      documents: [{ documentId: "d1", filename: "acme.pdf", values: { vendor: "Acme" } }],
    })
    db.document.findMany.mockResolvedValue([{ id: "d1", docType: "receipt" }])
    const { items } = await runGlobalSearch("w1", "vendor:acme", "u1")
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ documentId: "d1", docType: "receipt" })
  })

  it("defaults docType to null when the document row carries none", async () => {
    vi.mocked(findMatchingDocuments).mockResolvedValue({
      kind: "matches", filters: [{ fieldKey: "supplier_name", op: "contains", value: "acme" }], total: 1, truncated: false,
      documents: [{ documentId: "d2", filename: "b.pdf", values: {} }],
    })
    db.document.findMany.mockResolvedValue([{ id: "d2", docType: null }])
    const { items } = await runGlobalSearch("w1", "vendor:acme", "u1")
    expect(items[0].docType).toBeNull()
  })

  it("returns no items (and skips the docType lookup) for a blank query", async () => {
    const { items } = await runGlobalSearch("w1", "   ", "u1")
    expect(items).toEqual([])
    expect(db.document.findMany).not.toHaveBeenCalled()
  })
})

describe("isValidScope", () => {
  it("accepts valid scopes", () => {
    expect(isValidScope("smart")).toBe(true)
    expect(isValidScope("content")).toBe(true)
    expect(isValidScope("filename")).toBe(true)
    expect(isValidScope("supplier")).toBe(true)
    expect(isValidScope("category")).toBe(true)
  })

  it("rejects invalid scopes", () => {
    expect(isValidScope("bogus")).toBe(false)
    expect(isValidScope(undefined)).toBe(false)
    expect(isValidScope("")).toBe(false)
  })
})
