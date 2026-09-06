import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/db", () => ({ prisma: {} }))

const { resolveSupplier } = await import("@/lib/suppliers/alias")
const { prisma } = await import("@/lib/db")

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any

function supplier(id: string, canonicalName: string, normalizedKey: string) {
  return { id, canonicalName, normalizedKey }
}

beforeEach(() => {
  vi.clearAllMocks()
  db.supplier = { findUnique: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) }
  db.supplierAlias = { findUnique: vi.fn().mockResolvedValue(null) }
})

describe("resolveSupplier — fuzzy scan", () => {
  // The bug this guards: a single generic word ("Jackson") is a real surname shared by unrelated
  // companies. Being a one-token subset of a longer candidate name made tokenSetRatio return a
  // literal 1.0 — clearing the AUTO threshold outright and silently merging two different
  // suppliers. Confirmed live in a 40-document load test against a public invoice corpus, where
  // one such merge went on to trip a false bank_detail_change fraud alert against the wrong IBAN.
  it("does not auto-merge a single-token name into an unrelated longer one", async () => {
    db.supplier.findMany.mockResolvedValue([supplier("s1", "Rodriguez-Jackson", "rodriguez jackson")])
    const result = await resolveSupplier("w1", "Jackson Ltd")
    expect(result.matchKind).not.toBe("fuzzy_auto")
  })

  it("still surfaces the single-token match for review, rather than dropping it to none", async () => {
    db.supplier.findMany.mockResolvedValue([supplier("s1", "Rodriguez-Jackson", "rodriguez jackson")])
    const result = await resolveSupplier("w1", "Jackson Ltd")
    expect(result.matchKind).toBe("fuzzy_review")
    expect(result.supplierId).toBe("s1")
  })

  it("reproduces the second load-test collision the same way", async () => {
    db.supplier.findMany.mockResolvedValue([supplier("s1", "Smith-Cook", "smith cook")])
    const result = await resolveSupplier("w1", "Smith Ltd")
    expect(result.matchKind).toBe("fuzzy_review")
  })

  // A distinctive multi-word name colliding by coincidence is far less likely than a single
  // surname doing so, so this case is deliberately left uncapped — unchanged from before the fix.
  it("still auto-merges a multi-token subset match", async () => {
    db.supplier.findMany.mockResolvedValue([supplier("s1", "Acme Software Services International", "acme software services international")])
    const result = await resolveSupplier("w1", "Acme Software")
    expect(result.matchKind).toBe("fuzzy_auto")
  })

  it("still auto-merges genuinely near-identical multi-word names", async () => {
    db.supplier.findMany.mockResolvedValue([supplier("s1", "Acme Software Services", "acme software services")])
    const result = await resolveSupplier("w1", "Acme Software Service")
    expect(result.matchKind).toBe("fuzzy_auto")
  })
})
