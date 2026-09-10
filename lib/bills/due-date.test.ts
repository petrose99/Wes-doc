import { describe, expect, it } from "vitest"
import { agingBucket, inferDueDate } from "@/lib/bills/due-date"

describe("inferDueDate", () => {
  it("prefers an explicit extracted due_date over the supplier's default terms", () => {
    const due = new Date("2026-10-01")
    const inv = new Date("2026-09-01")
    expect(inferDueDate({ extractedDueDate: due, documentDate: inv, supplierPaymentTermsDays: 30 })).toEqual(due)
  })

  it("infers document_date + paymentTermsDays when there's no explicit due_date", () => {
    const inv = new Date("2026-09-01T00:00:00Z")
    const result = inferDueDate({ extractedDueDate: null, documentDate: inv, supplierPaymentTermsDays: 30 })
    expect(result?.toISOString().slice(0, 10)).toBe("2026-10-01")
  })

  it("returns null when neither an extracted due date nor a document date + terms is available", () => {
    expect(inferDueDate({ extractedDueDate: null, documentDate: null, supplierPaymentTermsDays: 30 })).toBeNull()
    expect(inferDueDate({ extractedDueDate: null, documentDate: new Date("2026-09-01"), supplierPaymentTermsDays: null })).toBeNull()
  })

  it("treats terms=0 (due on receipt) as a valid fallback", () => {
    const inv = new Date("2026-09-01T00:00:00Z")
    const result = inferDueDate({ extractedDueDate: null, documentDate: inv, supplierPaymentTermsDays: 0 })
    expect(result?.toISOString().slice(0, 10)).toBe("2026-09-01")
  })
})

describe("agingBucket", () => {
  const asOf = new Date("2026-09-10T00:00:00Z")

  it("returns null for a bill with no due date", () => {
    expect(agingBucket(null, asOf)).toBeNull()
  })

  it("returns 'current' for a bill not yet due", () => {
    expect(agingBucket(new Date("2026-09-15T00:00:00Z"), asOf)).toBe("current")
    expect(agingBucket(new Date("2026-09-10T00:00:00Z"), asOf)).toBe("current")
  })

  it("classifies past-due bills into 1-30/31-60/61-90/90+ buckets by days past due", () => {
    expect(agingBucket(new Date("2026-09-05T00:00:00Z"), asOf)).toBe("1-30")
    expect(agingBucket(new Date("2026-08-01T00:00:00Z"), asOf)).toBe("31-60")
    expect(agingBucket(new Date("2026-07-01T00:00:00Z"), asOf)).toBe("61-90")
    expect(agingBucket(new Date("2026-05-01T00:00:00Z"), asOf)).toBe("90+")
  })
})
