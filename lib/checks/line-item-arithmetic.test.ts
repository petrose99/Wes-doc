import { describe, expect, it } from "vitest"
import { checkLineItemArithmetic } from "@/lib/checks/line-item-arithmetic"

describe("checkLineItemArithmetic", () => {
  it("passes and anchors each compared cell", () => {
    const result = checkLineItemArithmetic({ currencyCode: "USD", lineItems: [{ quantity: 2, unitPrice: 10, amount: 20 }] })
    expect(result).toMatchObject({ status: "pass", fields: ["line_items[0].amount", "line_items[0].quantity", "line_items[0].unit_price"] })
  })

  it("fails with the arithmetic a reviewer needs to verify", () => {
    const result = checkLineItemArithmetic({ currencyCode: "USD", lineItems: [{ quantity: 2, unitPrice: 10, amount: 25 }] })
    expect(result?.status).toBe("fail")
    expect(result?.message).toContain("25")
    expect(result?.message).toContain("quantity (2) × unit price (10)")
  })

  it("skips incomplete rows instead of guessing", () => {
    expect(checkLineItemArithmetic({ currencyCode: "USD", lineItems: [{ quantity: 2, unitPrice: null, amount: 25 }] })).toBeNull()
  })

  it("honors zero-decimal currency tolerance", () => {
    expect(checkLineItemArithmetic({ currencyCode: "JPY", lineItems: [{ quantity: 2, unitPrice: 10, amount: 20.4 }] })?.status).toBe("pass")
    expect(checkLineItemArithmetic({ currencyCode: "JPY", lineItems: [{ quantity: 2, unitPrice: 10, amount: 21 }] })?.status).toBe("fail")
  })
})
