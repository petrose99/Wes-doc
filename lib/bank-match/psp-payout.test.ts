import { describe, expect, it } from "vitest"
import { decomposePayout } from "@/lib/bank-match/psp-payout"

describe("decomposePayout", () => {
  it("balances when components sum to expected net", () => {
    const result = decomposePayout({
      payoutId: "po_1", currencyCode: "USD", expectedNet: 97,
      components: [
        { externalId: "ch_1", kind: "charge", gross: 100, fee: 3, net: 97, currencyCode: "USD", reference: null },
      ],
    })
    expect(result.balanced).toBe(true)
    expect(result.charges).toHaveLength(1)
  })

  it("marks a payout unbalanced when components don't sum to expected", () => {
    const result = decomposePayout({
      payoutId: "po_2", currencyCode: "USD", expectedNet: 200,
      components: [{ externalId: "ch_1", kind: "charge", gross: 100, fee: 3, net: 97, currencyCode: "USD", reference: null }],
    })
    expect(result.balanced).toBe(false)
  })
})
