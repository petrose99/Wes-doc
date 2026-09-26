import { describe, expect, it } from "vitest"

import { batchEligibility, isOnBillPay, validateAmountToPay } from "@/lib/payments/eligibility"

describe("Bill Pay membership (#463: credited joins paid off the queue)", () => {
  it("a fully-credited invoice is off Bill Pay, same as a fully-paid one", () => {
    expect(isOnBillPay({ processingState: "approved", paidState: "credited" })).toBe(false)
    expect(isOnBillPay({ processingState: "approved", paidState: "paid" })).toBe(false)
    expect(isOnBillPay({ processingState: "approved", paidState: "partially_paid" })).toBe(true)
    expect(isOnBillPay({ processingState: "approved", paidState: "unpaid" })).toBe(true)
  })
  it("cancelled and not-yet-approved rows stay off regardless of paid state", () => {
    expect(isOnBillPay({ processingState: "cancelled", paidState: "unpaid" })).toBe(false)
    expect(isOnBillPay({ processingState: "in_review", paidState: "credited" })).toBe(false)
  })
})

describe("batch eligibility (#229 Q7)", () => {
  const base = { hasBankAccount: true, amountToPay: 100, hasSupplier: true, hasPayerAccount: true }
  it("a scheduled row cannot be re-batched", () => {
    expect(batchEligibility({ ...base, paidState: "scheduled" })).toEqual({ eligible: false, reason: "scheduled" })
  })
  it("an unpaid or partially paid row with everything on file is eligible", () => {
    expect(batchEligibility({ ...base, paidState: "unpaid" })).toEqual({ eligible: true })
    expect(batchEligibility({ ...base, paidState: "partially_paid" })).toEqual({ eligible: true })
  })
})

describe("amount to pay validation", () => {
  it("rejects zero, negative and over-due amounts", () => {
    expect(validateAmountToPay(0, 100)).toBeTruthy()
    expect(validateAmountToPay(-5, 100)).toBeTruthy()
    expect(validateAmountToPay(150, 100)).toBeTruthy()
    expect(validateAmountToPay(50, 100)).toBeNull()
  })
})
