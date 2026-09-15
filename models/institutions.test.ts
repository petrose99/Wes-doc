import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/db", () => ({ prisma: {} }))

const { normalizeInstitutionKey, resolveOrCreateInstitution, acceptStatementLayoutAsNew } = await import("@/models/institutions")
const { prisma } = await import("@/lib/db")

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any

beforeEach(() => {
  vi.clearAllMocks()
  for (const key of Object.keys(db)) delete db[key]
  db.institution = { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() }
  db.document = { findFirst: vi.fn() }
  db.documentCheckResult = { findUnique: vi.fn(), update: vi.fn() }
  db.$transaction = vi.fn((ops: unknown[]) => Promise.all(ops))
})

describe("normalizeInstitutionKey", () => {
  it("lowercases, trims, and collapses whitespace", () => {
    expect(normalizeInstitutionKey("  Standard   Bank  ")).toBe("standard bank")
  })

  it("treats differently-cased/spaced names as the same key", () => {
    expect(normalizeInstitutionKey("Standard Bank")).toBe(normalizeInstitutionKey("standard  bank"))
  })

  it("keeps genuinely different names distinct", () => {
    expect(normalizeInstitutionKey("Standard Bank")).not.toBe(normalizeInstitutionKey("Standard Bank Ltd"))
  })
})

describe("resolveOrCreateInstitution", () => {
  it("returns the existing institution when the normalized key already exists", async () => {
    db.institution.findUnique.mockResolvedValue({ id: "inst1", name: "Standard Bank", normalizedKey: "standard bank" })
    const result = await resolveOrCreateInstitution("w1", "  Standard   Bank  ")
    expect(result).toEqual({ id: "inst1", name: "Standard Bank", normalizedKey: "standard bank" })
    expect(db.institution.create).not.toHaveBeenCalled()
  })

  it("creates a new institution when no row matches the normalized key", async () => {
    db.institution.findUnique.mockResolvedValue(null)
    db.institution.create.mockResolvedValue({ id: "inst2", name: "First National", normalizedKey: "first national" })
    const result = await resolveOrCreateInstitution("w1", "First National")
    expect(db.institution.create).toHaveBeenCalledWith({ data: { workspaceId: "w1", name: "First National", normalizedKey: "first national" } })
    expect(result).toEqual({ id: "inst2", name: "First National", normalizedKey: "first national" })
  })

  it("rejects a blank name", async () => {
    await expect(resolveOrCreateInstitution("w1", "   ")).rejects.toThrow("Institution name is required")
  })

  it("re-reads the row instead of throwing when a concurrent create races the unique constraint", async () => {
    db.institution.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "inst3", name: "Amalgamated", normalizedKey: "amalgamated" })
    db.institution.create.mockRejectedValue(new Error("unique constraint"))
    const result = await resolveOrCreateInstitution("w1", "Amalgamated")
    expect(result).toEqual({ id: "inst3", name: "Amalgamated", normalizedKey: "amalgamated" })
  })
})

describe("acceptStatementLayoutAsNew", () => {
  const rows = [{ date: "2026-09-01", description: "Coffee", amount: "12.50", balance: "1000.00" }]

  it("errors when the document is not found", async () => {
    db.document.findFirst.mockResolvedValue(null)
    const result = await acceptStatementLayoutAsNew("w1", "d1")
    expect(result).toEqual({ success: false, error: "Document not found" })
  })

  it("errors when no institution has been asserted", async () => {
    db.document.findFirst.mockResolvedValue({ id: "d1", institutionId: null, reviewedData: {} })
    const result = await acceptStatementLayoutAsNew("w1", "d1")
    expect(result).toEqual({ success: false, error: "No institution asserted for this document" })
  })

  it("errors when there is no statement_layout_drift check to resolve", async () => {
    db.document.findFirst.mockResolvedValue({ id: "d1", institutionId: "inst1", reviewedData: { transactions: rows } })
    db.documentCheckResult.findUnique.mockResolvedValue(null)
    const result = await acceptStatementLayoutAsNew("w1", "d1")
    expect(result.success).toBe(false)
  })

  it("updates the institution's saved layout and resolves the check to pass", async () => {
    db.document.findFirst.mockResolvedValue({ id: "d1", institutionId: "inst1", reviewedData: { transactions: rows } })
    db.documentCheckResult.findUnique.mockResolvedValue({ id: "check1", workspaceId: "w1", documentId: "d1", checkCode: "statement_layout_drift", status: "warn" })

    const result = await acceptStatementLayoutAsNew("w1", "d1")

    expect(result.success).toBe(true)
    expect(db.institution.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "inst1" },
      data: expect.objectContaining({ savedLayout: expect.objectContaining({ columns: expect.arrayContaining(["date", "description", "amount", "balance"]) }) }),
    }))
    expect(db.documentCheckResult.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "check1" },
      data: expect.objectContaining({ status: "pass" }),
    }))
  })

  it("refuses a check row that belongs to a different workspace", async () => {
    db.document.findFirst.mockResolvedValue({ id: "d1", institutionId: "inst1", reviewedData: { transactions: rows } })
    db.documentCheckResult.findUnique.mockResolvedValue({ id: "check1", workspaceId: "other-workspace", documentId: "d1", checkCode: "statement_layout_drift", status: "warn" })
    const result = await acceptStatementLayoutAsNew("w1", "d1")
    expect(result.success).toBe(false)
    expect(db.institution.update).not.toHaveBeenCalled()
  })
})
