import { describe, expect, it } from "vitest"
import { checkLedgerCurrency } from "@/lib/checks/ledger-currency"

describe("checkLedgerCurrency", () => {
  it("passes when the ledger keeps its books in the Company currency", () => {
    expect(checkLedgerCurrency({ provider: "xero", ledgerCurrency: "LSL", companyCurrency: "LSL" }).status).toBe("pass")
  })

  it("fails with the provider, the ledger currency and the Company currency named", () => {
    expect(checkLedgerCurrency({ provider: "xero", ledgerCurrency: "ZAR", companyCurrency: "LSL" })).toEqual({
      checkCode: "ledger_currency_differs",
      status: "fail",
      message: "Ledger currency differs",
      detail: { provider: "xero", ledgerCurrency: "ZAR", companyCurrency: "LSL", text: "Xero keeps its books in ZAR; this company's currency is LSL." },
    })
  })

  it("names QuickBooks by its product name", () => {
    const result = checkLedgerCurrency({ provider: "quickbooks", ledgerCurrency: "USD", companyCurrency: "ZAR" })
    expect(result.detail?.text).toBe("QuickBooks keeps its books in USD; this company's currency is ZAR.")
  })

  it("compares codes case-insensitively, as providers return them", () => {
    expect(checkLedgerCurrency({ provider: "xero", ledgerCurrency: "zar", companyCurrency: "ZAR" }).status).toBe("pass")
  })
})
