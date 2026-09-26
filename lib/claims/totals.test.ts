import { describe, expect, it } from "vitest"
import { sumReceiptTotals } from "@/lib/claims/totals"

describe("sumReceiptTotals", () => {
  it("counts a receipt with no currency in the Company currency, never USD", () => {
    const totals = sumReceiptTotals([{ amount: 10.1, currencyCode: null }, { amount: 5.2, currencyCode: "LSL" }], "LSL")
    expect(totals).toMatchObject({ total: 15.3, currencyCode: "LSL", mixed: false, missing: 0 })
  })

  it("lists each currency and gives no total when receipts are mixed", () => {
    const totals = sumReceiptTotals([{ amount: 1, currencyCode: null }, { amount: 2, currencyCode: "USD" }, { amount: null, currencyCode: "ZAR" }], "ZAR")
    expect(totals).toEqual({ total: 0, currencyCode: null, missing: 1, mixed: true, byCurrency: [{ currencyCode: "ZAR", total: 1 }, { currencyCode: "USD", total: 2 }] })
  })
})
