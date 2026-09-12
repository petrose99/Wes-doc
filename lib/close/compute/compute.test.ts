/** Compute-layer tests for #96. Split into two halves:
 *
 *   1. Pure computers — bank-recon, ap-aging, unposted-accruals, cross-border-review, and
 *      vat-workpaper — exercised against hand-built `CloseCandidateBill` fixtures.
 *   2. Dispatcher (`computeCloseItems`) exercised against a mocked prisma client, verifying
 *      auto-compute wiring, per-item error isolation, and payload-hash idempotency of the
 *      `close.item.computed` audit event.
 */

import { describe, expect, it, vi, beforeEach } from "vitest"
import type { WorkpaperBill } from "@/lib/jurisdictions/_shared"

vi.mock("next/headers", () => ({ headers: vi.fn(() => { throw new Error("no request") }) }))

const closeFindUnique = vi.fn()
const closeItemUpdate = vi.fn()
const workspaceFindUnique = vi.fn()
const gateFindMany = vi.fn()
const documentFindMany = vi.fn()
const categoryNatureFindMany = vi.fn()
const auditCreate = vi.fn()

vi.mock("@/lib/db", () => ({
  prisma: {
    close: { findUnique: closeFindUnique },
    closeItem: { update: closeItemUpdate },
    workspace: { findUnique: workspaceFindUnique },
    gate: { findMany: gateFindMany },
    document: { findMany: documentFindMany },
    categoryNature: { findMany: categoryNatureFindMany },
    auditEvent: { create: auditCreate },
  },
}))

const {
  computeBankRecon,
  computeApAging,
  computeUnpostedAccruals,
  computeVatWorkpaper,
  computeCrossBorderReview,
  computeCloseItems,
  BANK_RECON_DEFAULT_TOLERANCE,
} = await import("./index")

function makeBill(over: Partial<WorkpaperBill> = {}): WorkpaperBill {
  return {
    id: "b1",
    invoiceDate: new Date("2026-08-10"),
    receivedAt: new Date("2026-08-11"),
    currency: "ZAR",
    net: 1000,
    vat: 150,
    gross: 1150,
    taxRate: 15,
    category: "expense",
    supplier: { id: "s1", country: "ZA", vatNumber: null, name: "Acme" },
    isImport: false,
    isCapital: false,
    isService: null,
    isDeferred: null,
    fieldConfidence: null,
    codingConfidence: null,
    ...over,
  }
}

describe("computeBankRecon", () => {
  it("emits awaiting-assertion when nothing is asserted yet", () => {
    const v = computeBankRecon()
    expect(v.status).toBe("awaiting-assertion")
    expect(v.assertedBalance).toBeNull()
    expect(v.deltaAmount).toBeNull()
    expect(v.tolerance).toBe(BANK_RECON_DEFAULT_TOLERANCE)
  })
  it("flags a delta over tolerance", () => {
    const v = computeBankRecon({ priorAssertion: 1000, computedBalance: 995, tolerance: 1 })
    expect(v.status).toBe("delta-flagged")
    expect(v.deltaAmount).toBe(5)
  })
  it("clears within tolerance", () => {
    const v = computeBankRecon({ priorAssertion: 1000, computedBalance: 1000.5, tolerance: 1 })
    expect(v.status).toBe("within-tolerance")
    expect(v.deltaAmount).toBe(-0.5)
  })
})

describe("computeApAging", () => {
  const periodEnd = new Date(Date.UTC(2026, 7, 31, 23, 59, 59))
  it("buckets by daysOverdue against periodEnd", () => {
    const b0 = { documentId: "d0", bill: makeBill({ gross: 100 }), dueDate: new Date(Date.UTC(2026, 8, 5)), gateStatus: "clear" as const }
    const b1 = { documentId: "d1", bill: makeBill({ gross: 200 }), dueDate: new Date(Date.UTC(2026, 7, 15)), gateStatus: "clear" as const }
    const b2 = { documentId: "d2", bill: makeBill({ gross: 300 }), dueDate: new Date(Date.UTC(2026, 6, 20)), gateStatus: "clear" as const }
    const b3 = { documentId: "d3", bill: makeBill({ gross: 400 }), dueDate: new Date(Date.UTC(2026, 5, 20)), gateStatus: "clear" as const }
    const b4 = { documentId: "d4", bill: makeBill({ gross: 500 }), dueDate: new Date(Date.UTC(2026, 3, 1)), gateStatus: "clear" as const }
    const v = computeApAging({ periodEnd, bills: [b0, b1, b2, b3, b4], openGates: [] })
    expect(v.aging.currentAmount).toBe(100)
    expect(v.aging.days_1_30_amount).toBe(200)
    expect(v.aging.days_31_60_amount).toBe(300)
    expect(v.aging.days_61_90_amount).toBe(400)
    expect(v.aging.days_90_plus_amount).toBe(500)
    expect(v.totalOpenAmount).toBe(1500)
    expect(v.totalOpenCount).toBe(5)
  })
  it("treats a bill without a due date as current", () => {
    const b = { documentId: "d1", bill: makeBill({ gross: 42 }), dueDate: null, gateStatus: "clear" as const }
    const v = computeApAging({ periodEnd, bills: [b], openGates: [] })
    expect(v.aging.currentAmount).toBe(42)
  })
  it("counts open gates by severity and surfaces ids", () => {
    const v = computeApAging({
      periodEnd,
      bills: [],
      openGates: [
        { id: "g1", severity: "hard" },
        { id: "g2", severity: "hard" },
        { id: "g3", severity: "soft" },
      ],
    })
    expect(v.openExceptions.hardBlockingCount).toBe(2)
    expect(v.openExceptions.softCount).toBe(1)
    expect(v.openExceptions.gateIds).toEqual(["g1", "g2", "g3"])
  })
})

describe("computeUnpostedAccruals", () => {
  const periodEnd = new Date(Date.UTC(2026, 7, 31))
  it("emits VAT suspense line for ZA/LS/GB (#46)", () => {
    const c = { documentId: "d1", bill: makeBill({ net: 1000, vat: 150 }), dueDate: null, gateStatus: "clear" as const }
    const v = computeUnpostedAccruals({ periodEnd, bills: [c], jurisdictionCode: "ZA" })
    expect(v.vatSuspense).toBe(true)
    expect(v.proposals[0].debitVatSuspense).toBe(150)
    expect(v.proposals[0].creditAccruals).toBe(1150)
    expect(v.totalVatSuspense).toBe(150)
    // Reversal is periodEnd + 1 day
    expect(v.reversalDate).toBe("2026-09-01")
  })
  it("skips VAT suspense for jurisdictions without an invoice-held rule", () => {
    const c = { documentId: "d1", bill: makeBill({ net: 1000, vat: 150 }), dueDate: null, gateStatus: "clear" as const }
    const v = computeUnpostedAccruals({ periodEnd, bills: [c], jurisdictionCode: "US-CA" })
    expect(v.vatSuspense).toBe(false)
    expect(v.proposals[0].debitVatSuspense).toBeNull()
    expect(v.proposals[0].creditAccruals).toBe(1000)
  })
  it("passes gateStatus through per row (#46: regardless of gate state)", () => {
    const c = { documentId: "d1", bill: makeBill(), dueDate: null, gateStatus: "hard-blocking" as const }
    const v = computeUnpostedAccruals({ periodEnd, bills: [c], jurisdictionCode: "ZA" })
    expect(v.proposals[0].gateStatus).toBe("hard-blocking")
  })
})

describe("computeCrossBorderReview", () => {
  const period = {
    id: "LS-2026-M08",
    startDate: new Date("2026-08-01"),
    endDate: new Date("2026-08-31"),
    workspaceBaseCurrency: "LSL",
  }
  it("lists bills matching the SARS/RSL arrangement", () => {
    const rsa = {
      documentId: "d1",
      bill: makeBill({
        invoiceDate: new Date("2026-08-15"),
        gross: 5000,
        supplier: { id: null, country: "ZA", vatNumber: "4123456789", name: "RSA Vendor" },
      }),
      dueDate: null,
      gateStatus: "clear" as const,
    }
    const nonRsa = { documentId: "d2", bill: makeBill({ supplier: { id: null, country: "US", vatNumber: null, name: "Other" } }), dueDate: null, gateStatus: "clear" as const }
    const v = computeCrossBorderReview({ bills: [rsa, nonRsa], period })
    expect(v.bills).toHaveLength(1)
    expect(v.bills[0].billId).toBe("d1")
    expect(v.totalGross).toBe(5000)
    expect(v.windowDays).toBe(90)
  })
})

describe("computeVatWorkpaper", () => {
  it("no pack → no sheets, both codes null", () => {
    const v = computeVatWorkpaper({
      pack: null,
      bills: [],
      period: { id: "X", startDate: new Date(), endDate: new Date(), workspaceBaseCurrency: "USD" },
    })
    expect(v.sheets).toEqual([])
    expect(v.packCode).toBeNull()
    expect(v.groupId).toBeNull()
  })
})

describe("computeCloseItems dispatcher", () => {
  beforeEach(() => {
    closeFindUnique.mockReset()
    closeItemUpdate.mockReset()
    workspaceFindUnique.mockReset()
    gateFindMany.mockReset()
    documentFindMany.mockReset()
    categoryNatureFindMany.mockReset()
    auditCreate.mockReset()
    documentFindMany.mockResolvedValue([])
    categoryNatureFindMany.mockResolvedValue([])
    gateFindMany.mockResolvedValue([])
  })

  const stdWorkspace = { country: "ZA", baseCurrency: "ZAR", jurisdictionCode: "ZA", deferredVatScheme: null }

  it("computes every open item and emits close.item.computed once per changed row", async () => {
    closeFindUnique.mockResolvedValue({
      id: "c1", workspaceId: "w1", periodYear: 2026, periodMonth: 8,
      items: [
        { id: "i-bank", kind: "bank-recon", computedValue: null },
        { id: "i-aging", kind: "ap-aging", computedValue: null },
        { id: "i-acc", kind: "unposted-bill-accruals", computedValue: null },
        { id: "i-vat", kind: "vat-workpaper", computedValue: null },
      ],
    })
    workspaceFindUnique.mockResolvedValue(stdWorkspace)
    closeItemUpdate.mockResolvedValue({})
    auditCreate.mockResolvedValue({})

    const result = await computeCloseItems({ closeId: "c1", actorId: "u1" })
    expect(result.items).toHaveLength(4)
    expect(result.items.every((r) => r.changed)).toBe(true)
    // One audit write per item
    expect(auditCreate).toHaveBeenCalledTimes(4)
    expect(closeItemUpdate).toHaveBeenCalledTimes(4)
    // Every audit event is a close.item.computed on the close_item subject
    for (const call of auditCreate.mock.calls) {
      expect(call[0].data.type).toBe("close.item.computed")
      expect(call[0].data.subjectType).toBe("close_item")
    }
  })

  it("no audit event when the payload is unchanged (idempotent recompute)", async () => {
    // Prior payload identical to what computeBankRecon() emits for a fresh item.
    const prior = { kind: "bank-recon", status: "awaiting-assertion", assertedBalance: null, computedBalance: null, deltaAmount: null, tolerance: 1 }
    closeFindUnique.mockResolvedValue({
      id: "c1", workspaceId: "w1", periodYear: 2026, periodMonth: 8,
      items: [{ id: "i-bank", kind: "bank-recon", computedValue: prior }],
    })
    workspaceFindUnique.mockResolvedValue(stdWorkspace)
    closeItemUpdate.mockResolvedValue({})

    const result = await computeCloseItems({ closeId: "c1" })
    expect(result.items[0].changed).toBe(false)
    expect(auditCreate).not.toHaveBeenCalled()
    // Still touches computedAt so a human can see "last computed" even on no-op runs.
    expect(closeItemUpdate).toHaveBeenCalledTimes(1)
  })

  it("one item's failure does not stall the rest", async () => {
    closeFindUnique.mockResolvedValue({
      id: "c1", workspaceId: "w1", periodYear: 2026, periodMonth: 8,
      items: [
        { id: "i-bank", kind: "bank-recon", computedValue: null },
        { id: "i-aging", kind: "ap-aging", computedValue: null },
      ],
    })
    workspaceFindUnique.mockResolvedValue(stdWorkspace)
    // Make the first update fail; the second must still run.
    closeItemUpdate
      .mockRejectedValueOnce(new Error("db exploded"))
      .mockResolvedValue({})

    const result = await computeCloseItems({ closeId: "c1" })
    expect(result.items).toHaveLength(2)
    expect(result.items[0].error).toContain("db exploded")
    expect(result.items[1].error).toBeUndefined()
    expect(closeItemUpdate).toHaveBeenCalledTimes(2)
  })

  it("throws for a missing close (openClose swallows this, recomputeClose surfaces it)", async () => {
    closeFindUnique.mockResolvedValue(null)
    await expect(computeCloseItems({ closeId: "missing" })).rejects.toThrow(/not found/)
  })
})
