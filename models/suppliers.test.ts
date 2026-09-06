import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/db", () => ({ prisma: {} }))
vi.mock("@/lib/suppliers/alias", () => ({ resolveSupplier: vi.fn() }))

const { markSupplierTouchless, markSupplierCleanReview, creditSupplierForCleanApproval } = await import("@/models/suppliers")
const { prisma } = await import("@/lib/db")
const { resolveSupplier } = await import("@/lib/suppliers/alias")

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any

beforeEach(() => {
  vi.clearAllMocks()
  db.supplier = { update: vi.fn().mockResolvedValue({}) }
  db.document = { findFirst: vi.fn() }
  db.documentAuditEvent = { count: vi.fn().mockResolvedValue(0) }
  vi.mocked(resolveSupplier).mockResolvedValue({ supplierId: "s1" } as never)
})

describe("markSupplierTouchless", () => {
  // The two counters gate different things and are now earned by different signals: touchlessSeen
  // by eligibility, consecutiveClean by a clean human approval. Bumping both here made the
  // confidence step-down unearnable.
  it("bumps only the cold-start counter, never the clean streak", async () => {
    await markSupplierTouchless("w1", "Acme Ltd")
    expect(db.supplier.update).toHaveBeenCalledWith({ where: { id: "s1" }, data: { touchlessSeen: { increment: 1 } } })
  })
})

describe("markSupplierCleanReview", () => {
  it("bumps only the clean streak", async () => {
    await markSupplierCleanReview("w1", "Acme Ltd")
    expect(db.supplier.update).toHaveBeenCalledWith({ where: { id: "s1" }, data: { consecutiveClean: { increment: 1 } } })
  })

  it("does nothing without a supplier name", async () => {
    await markSupplierCleanReview("w1", "   ")
    expect(db.supplier.update).not.toHaveBeenCalled()
  })
})

describe("creditSupplierForCleanApproval", () => {
  const document = { rawExtraction: { vendor: "Acme Ltd" }, reviewedData: null, template: { code: "invoice" } }

  it("credits the streak when the reviewer edited nothing", async () => {
    db.document.findFirst.mockResolvedValue(document)
    await creditSupplierForCleanApproval("w1", "d1")
    expect(db.supplier.update).toHaveBeenCalledWith({ where: { id: "s1" }, data: { consecutiveClean: { increment: 1 } } })
  })

  // A correction means the extraction was wrong at the current threshold — the whole point of the
  // streak is that it only counts documents nobody had to fix.
  it("does not credit when a field-edit audit event exists", async () => {
    db.document.findFirst.mockResolvedValue(document)
    db.documentAuditEvent.count.mockResolvedValue(1)
    await creditSupplierForCleanApproval("w1", "d1")
    expect(db.supplier.update).not.toHaveBeenCalled()
  })

  it("does not credit when the document has no supplier field", async () => {
    db.document.findFirst.mockResolvedValue({ ...document, rawExtraction: {}, reviewedData: null })
    await creditSupplierForCleanApproval("w1", "d1")
    expect(db.supplier.update).not.toHaveBeenCalled()
  })
})
