import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/db", () => ({ prisma: {} }))

const { createCreditAllocation, voidCreditAllocation, changeCreditAllocation, voidCreditNote, getSupplierCreditAvailable } = await import("@/models/credits")
const { prisma } = await import("@/lib/db")

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any

const creditNoteDoc = { id: "cn1", docType: "credit_note", reviewedData: { vendor: "Acme Supplies", total: 300 }, template: null }
const invoiceDoc = { id: "inv1", docType: "invoice", reviewedData: { vendor: "Acme Supplies", total: 500 }, template: null }

beforeEach(() => {
  vi.clearAllMocks()
  for (const key of Object.keys(db)) delete db[key]
  db.$transaction = vi.fn(async (fn: (tx: unknown) => unknown) => fn(db))
  db.paymentRunItem = { findMany: vi.fn().mockResolvedValue([]) }
  db.invoicePayment = { findMany: vi.fn().mockResolvedValue([]) }
  db.creditAllocation = { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn(), create: vi.fn().mockResolvedValue({ id: "alloc1" }), update: vi.fn() }
  db.documentAuditEvent = { create: vi.fn() }
  db.document = { findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]), update: vi.fn() }
})

describe("createCreditAllocation", () => {
  it("refuses when the credit note is not found", async () => {
    db.document.findFirst = vi.fn().mockResolvedValueOnce(null)
    const result = await createCreditAllocation({ workspaceId: "w1", creditNoteId: "cn1", invoiceId: "inv1", amount: 100, actorId: "u1" })
    expect(result).toEqual({ ok: false, reason: "credit_note_not_found" })
  })

  it("refuses when suppliers don't match", async () => {
    db.document.findFirst = vi.fn()
      .mockResolvedValueOnce(creditNoteDoc)
      .mockResolvedValueOnce({ ...invoiceDoc, reviewedData: { vendor: "Other Co", total: 500 } })
    const result = await createCreditAllocation({ workspaceId: "w1", creditNoteId: "cn1", invoiceId: "inv1", amount: 100, actorId: "u1" })
    expect(result).toEqual({ ok: false, reason: "supplier_mismatch" })
  })

  it("refuses when the invoice has an open payment line", async () => {
    db.document.findFirst = vi.fn().mockResolvedValueOnce(creditNoteDoc).mockResolvedValueOnce(invoiceDoc)
    db.paymentRunItem.findMany = vi.fn().mockResolvedValue([{ id: "item1" }])
    const result = await createCreditAllocation({ workspaceId: "w1", creditNoteId: "cn1", invoiceId: "inv1", amount: 100, actorId: "u1" })
    expect(result).toEqual({ ok: false, reason: "open_payment_line" })
  })

  it("creates the allocation capped to the smaller of due and remaining, and audits both documents", async () => {
    db.document.findFirst = vi.fn().mockResolvedValueOnce(creditNoteDoc).mockResolvedValueOnce(invoiceDoc)
    const result = await createCreditAllocation({ workspaceId: "w1", creditNoteId: "cn1", invoiceId: "inv1", amount: 1000, actorId: "u1" })
    expect(result).toEqual({ ok: true, id: "alloc1" })
    expect(db.creditAllocation.create).toHaveBeenCalledWith({ data: expect.objectContaining({ workspaceId: "w1", creditNoteId: "cn1", invoiceId: "inv1", amount: 300, createdById: "u1" }) })
    expect(db.documentAuditEvent.create).toHaveBeenCalledTimes(2)
  })

  it("refuses when there is nothing left to allocate", async () => {
    db.document.findFirst = vi.fn().mockResolvedValueOnce({ ...creditNoteDoc, reviewedData: { vendor: "Acme Supplies", total: 0 } }).mockResolvedValueOnce(invoiceDoc)
    const result = await createCreditAllocation({ workspaceId: "w1", creditNoteId: "cn1", invoiceId: "inv1", amount: 100, actorId: "u1" })
    expect(result).toEqual({ ok: false, reason: "nothing_to_allocate" })
  })
})

describe("voidCreditAllocation", () => {
  it("requires a reason", async () => {
    const result = await voidCreditAllocation({ workspaceId: "w1", allocationId: "a1", actorId: "u1", reason: "  " })
    expect(result).toEqual({ ok: false, reason: "reason_required" })
  })

  it("refuses when the allocation is not found", async () => {
    db.creditAllocation.findFirst = vi.fn().mockResolvedValue(null)
    const result = await voidCreditAllocation({ workspaceId: "w1", allocationId: "a1", actorId: "u1", reason: "Wrong invoice" })
    expect(result).toEqual({ ok: false, reason: "allocation_not_found" })
  })

  it("voids and audits both documents", async () => {
    db.creditAllocation.findFirst = vi.fn().mockResolvedValue({ id: "a1", creditNoteId: "cn1", invoiceId: "inv1", amount: 200 })
    const result = await voidCreditAllocation({ workspaceId: "w1", allocationId: "a1", actorId: "u1", reason: "Wrong invoice" })
    expect(result).toEqual({ ok: true })
    expect(db.creditAllocation.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "a1" } }))
    expect(db.documentAuditEvent.create).toHaveBeenCalledTimes(2)
  })
})

describe("changeCreditAllocation", () => {
  it("updates the amount and audits both documents", async () => {
    db.creditAllocation.findFirst = vi.fn().mockResolvedValue({ id: "a1", creditNoteId: "cn1", invoiceId: "inv1", amount: 200 })
    const result = await changeCreditAllocation({ workspaceId: "w1", allocationId: "a1", amount: 150, actorId: "u1", reason: "Corrected amount" })
    expect(result).toEqual({ ok: true })
    expect(db.creditAllocation.update).toHaveBeenCalledWith({ where: { id: "a1" }, data: { amount: 150 } })
  })
})

describe("voidCreditNote", () => {
  it("refuses if any allocated invoice has an open payment line", async () => {
    db.creditAllocation.findMany = vi.fn().mockResolvedValue([{ id: "a1", invoiceId: "inv1", amount: 100 }])
    db.paymentRunItem.findMany = vi.fn().mockResolvedValue([{ id: "item1" }])
    const result = await voidCreditNote({ workspaceId: "w1", documentId: "cn1", actorId: "u1", reason: "Superseded" })
    expect(result).toEqual({ ok: false, reason: "open_payment_line" })
  })

  it("voids every live allocation then cancels the credit note", async () => {
    db.creditAllocation.findMany = vi.fn().mockResolvedValue([{ id: "a1", invoiceId: "inv1", amount: 100 }])
    const result = await voidCreditNote({ workspaceId: "w1", documentId: "cn1", actorId: "u1", reason: "Superseded" })
    expect(result).toEqual({ ok: true })
    expect(db.creditAllocation.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "a1" } }))
    expect(db.document.update).toHaveBeenCalledWith({ where: { id: "cn1" }, data: expect.objectContaining({ cancelledReason: "Superseded" }) })
  })
})

describe("getSupplierCreditAvailable", () => {
  it("returns empty for no supplier keys", async () => {
    const result = await getSupplierCreditAvailable("w1", [])
    expect(result.size).toBe(0)
  })

  it("sums live credit notes' total minus their allocations, per normalized supplier", async () => {
    db.document.findMany = vi.fn().mockResolvedValue([
      { id: "cn1", reviewedData: { vendor: "Acme Supplies", total: 300 } },
      { id: "cn2", reviewedData: { vendor: "acme supplies", total: 200 } },
    ])
    db.creditAllocation.findMany = vi.fn().mockResolvedValue([{ creditNoteId: "cn1", amount: 100 }])
    const result = await getSupplierCreditAvailable("w1", ["Acme Supplies"])
    expect(result.get("acme supplies")).toBe(400)
  })
})
