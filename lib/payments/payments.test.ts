import { describe, expect, it } from "vitest"
import { discountDeadline, formatTerms, openDiscountWindow } from "@/lib/payments/terms"
import { derivePaidState, remainingDue } from "@/lib/payments/paid-state"
import { splitIntoBatches, suggestBatchName } from "@/lib/payments/batch-split"
import { batchEligibility, isOnBillPay, validateAmountToPay } from "@/lib/payments/eligibility"

describe("payment terms (#229 Q5)", () => {
  it("renders 2/10 net 30 and the no-discount cases", () => {
    expect(formatTerms({ netDays: 30, discountPercent: 2, discountDays: 10 })).toBe("2/10 net 30")
    expect(formatTerms({ netDays: 30, discountPercent: 2.5, discountDays: 10 })).toBe("2.5/10 net 30")
    expect(formatTerms({ netDays: 30, discountPercent: null, discountDays: null })).toBe("Net 30")
    expect(formatTerms({ netDays: 0, discountPercent: null, discountDays: null })).toBe("Due on receipt")
    expect(formatTerms({ netDays: null, discountPercent: null, discountDays: null })).toBe("—")
  })

  it("opens a discount window only inside the discount days and never claims one otherwise", () => {
    const terms = { netDays: 30, discountPercent: 2, discountDays: 10 }
    const invoiceDate = new Date(2026, 8, 10)
    expect(discountDeadline(invoiceDate, terms)?.getDate()).toBe(20)
    const inside = openDiscountWindow({ total: 1000, invoiceDate, terms, asOf: new Date(2026, 8, 16) })
    expect(inside).toMatchObject({ daysLeft: 4, discountAmount: 20, discountedTotal: 980 })
    const onDeadline = openDiscountWindow({ total: 1000, invoiceDate, terms, asOf: new Date(2026, 8, 20, 17) })
    expect(onDeadline?.daysLeft).toBe(0)
    expect(openDiscountWindow({ total: 1000, invoiceDate, terms, asOf: new Date(2026, 8, 21) })).toBeNull()
    expect(openDiscountWindow({ total: 1000, invoiceDate: null, terms, asOf: new Date() })).toBeNull()
    expect(openDiscountWindow({ total: 1000, invoiceDate, terms: { netDays: 30, discountPercent: null, discountDays: null }, asOf: new Date(2026, 8, 12) })).toBeNull()
  })

  it("rounds the discount in cents", () => {
    const window = openDiscountWindow({ total: 33.33, invoiceDate: new Date(2026, 8, 10), terms: { netDays: 30, discountPercent: 2, discountDays: 10 }, asOf: new Date(2026, 8, 11) })
    expect(window?.discountAmount).toBe(0.67)
    expect(window?.discountedTotal).toBe(32.66)
  })
})

describe("derived paid state (ADR 0001)", () => {
  const base = { ledgerStatus: null, ledgerPaidAmount: null, total: 500, records: [], allocations: [], batchStatus: null as null }
  it("ledger wins when it confirms", () => {
    expect(derivePaidState({ ...base, ledgerStatus: "paid", ledgerPaidAmount: 500, records: [{ amount: 10 }] })).toMatchObject({ state: "paid", source: "ledger", label: "Paid" })
    expect(derivePaidState({ ...base, ledgerStatus: "reconciled" }).state).toBe("paid")
  })
  it("records decide when the ledger has not", () => {
    expect(derivePaidState({ ...base, ledgerStatus: "synced", records: [{ amount: 500 }] })).toMatchObject({ state: "paid", source: "recorded", label: "Paid (recorded)" })
    expect(derivePaidState({ ...base, records: [{ amount: 200 }, { amount: 100 }] })).toMatchObject({ state: "partially_paid", paidAmount: 300 })
    expect(derivePaidState({ ...base, records: [{ amount: 0.1 }, { amount: 0.2 }], total: 0.3 }).state).toBe("paid")
  })
  it("a live batch reads as Scheduled, a rejected one does not", () => {
    expect(derivePaidState({ ...base, batchStatus: "pending_approval" }).state).toBe("scheduled")
    expect(derivePaidState({ ...base, batchStatus: "approved" }).state).toBe("scheduled")
    expect(derivePaidState({ ...base, batchStatus: "rejected" }).state).toBe("unpaid")
    expect(derivePaidState({ ...base, batchStatus: "paid" }).state).toBe("unpaid")
  })
  it("credit alone reads as Credited, never Paid (#463 Q7/ADR 0017)", () => {
    expect(derivePaidState({ ...base, allocations: [{ amount: 500 }] })).toMatchObject({ state: "credited", label: "Credited", allocatedAmount: 500, recordedAmount: 0 })
    expect(derivePaidState({ ...base, records: [{ amount: 200 }], allocations: [{ amount: 100 }] })).toMatchObject({ state: "partially_paid", paidAmount: 300 })
    expect(derivePaidState({ ...base, records: [{ amount: 500 }], allocations: [{ amount: 100 }] })).toMatchObject({ state: "paid", source: "recorded", label: "Paid (recorded)" })
  })
  it("remaining due is in cents", () => {
    expect(remainingDue(100, 33.33)).toBe(66.67)
    expect(remainingDue(null, 1)).toBeNull()
  })
})

describe("batch splitting (#229 Q4)", () => {
  it("splits one batch per payer account × currency, in selection order", () => {
    const groups = splitIntoBatches([
      { documentId: "a", payFromAccountId: "acc1", currencyCode: "ZAR" },
      { documentId: "b", payFromAccountId: "acc1", currencyCode: "zar" },
      { documentId: "c", payFromAccountId: "acc2", currencyCode: "ZAR" },
      { documentId: "d", payFromAccountId: "acc1", currencyCode: "USD" },
      { documentId: "e", payFromAccountId: null, currencyCode: "ZAR" },
    ])
    expect(groups.map((g) => [g.payFromAccountId, g.currencyCode, g.lines.map((l) => l.documentId)])).toEqual([
      ["acc1", "ZAR", ["a", "b"]], ["acc2", "ZAR", ["c"]], ["acc1", "USD", ["d"]], [null, "ZAR", ["e"]],
    ])
  })
  it("suggests the next free YYYY-MM-DD-nnn name", () => {
    const now = new Date("2026-09-16T10:00:00Z")
    expect(suggestBatchName(now, [])).toBe("2026-09-16-001")
    expect(suggestBatchName(now, ["2026-09-16-001", "2026-09-16-002", "2026-09-15-001"])).toBe("2026-09-16-003")
  })
})

describe("Bill Pay eligibility (#229 Q7)", () => {
  it("only Approved, uncancelled, not-fully-paid rows are on Bill Pay", () => {
    expect(isOnBillPay({ processingState: "approved", paidState: "unpaid" })).toBe(true)
    expect(isOnBillPay({ processingState: "touchless", paidState: "partially_paid" })).toBe(true)
    expect(isOnBillPay({ processingState: "approved", paidState: "scheduled" })).toBe(true)
    expect(isOnBillPay({ processingState: "approved", paidState: "paid" })).toBe(false)
    expect(isOnBillPay({ processingState: "in_review", paidState: "unpaid" })).toBe(false)
    expect(isOnBillPay({ processingState: "cancelled", paidState: "unpaid" })).toBe(false)
    expect(isOnBillPay({ processingState: "needs_attention", paidState: "unpaid" })).toBe(false)
  })
  it("a bank-less row is visible but undecidable; a scheduled row cannot be batched twice", () => {
    expect(batchEligibility({ hasBankAccount: false, paidState: "unpaid", amountToPay: 10, hasSupplier: true, hasPayerAccount: true })).toEqual({ eligible: false, reason: "needs_bank_details" })
    expect(batchEligibility({ hasBankAccount: true, paidState: "scheduled", amountToPay: 10, hasSupplier: true, hasPayerAccount: true })).toEqual({ eligible: false, reason: "scheduled" })
    expect(batchEligibility({ hasBankAccount: true, paidState: "unpaid", amountToPay: 10, hasSupplier: true, hasPayerAccount: false })).toEqual({ eligible: false, reason: "no_payer_account" })
    expect(batchEligibility({ hasBankAccount: true, paidState: "unpaid", amountToPay: 10, hasSupplier: true, hasPayerAccount: true })).toEqual({ eligible: true })
  })
  it("amount to pay is 0 < amount ≤ due", () => {
    expect(validateAmountToPay(0, 100)).toMatch(/more than zero/)
    expect(validateAmountToPay(100.01, 100)).toMatch(/more than what/)
    expect(validateAmountToPay(100, 100)).toBeNull()
    expect(validateAmountToPay(NaN, 100)).toMatch(/Enter/)
  })
})
