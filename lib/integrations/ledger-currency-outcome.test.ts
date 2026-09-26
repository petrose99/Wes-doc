import { describe, expect, it } from "vitest"
import { ledgerCurrencyOutcome } from "./ledger-currency-outcome"

const base = { provider: "xero", ledgerCurrency: "ZAR", companyCurrency: "LSL", country: "LS", locked: false, isOwner: true }

describe("ledgerCurrencyOutcome (#457 spec §5.4, §9.6)", () => {
  it("says nothing when the ledger keeps its books in the company currency", () => {
    expect(ledgerCurrencyOutcome({ ...base, ledgerCurrency: "LSL" })).toBe("none")
  })

  it("says nothing for a provider whose currency is not read (Sage)", () => {
    expect(ledgerCurrencyOutcome({ ...base, provider: "sage", ledgerCurrency: null })).toBe("none")
  })

  it("reports an unread ledger currency", () => {
    expect(ledgerCurrencyOutcome({ ...base, ledgerCurrency: null })).toBe("unread")
    expect(ledgerCurrencyOutcome({ ...base, provider: "quickbooks", ledgerCurrency: null })).toBe("unread")
  })

  it("offers an unlocked Owner the switch when the ledger currency is allowed for the country", () => {
    expect(ledgerCurrencyOutcome(base)).toBe("switch")
  })

  it("sends a non-Owner to an Owner when the switch is possible", () => {
    expect(ledgerCurrencyOutcome({ ...base, isOwner: false })).toBe("ask_owner")
  })

  it("blocks when the company is locked", () => {
    expect(ledgerCurrencyOutcome({ ...base, locked: true })).toBe("blocked")
    expect(ledgerCurrencyOutcome({ ...base, locked: true, isOwner: false })).toBe("blocked")
  })

  it("blocks when the ledger currency is not allowed for the country", () => {
    expect(ledgerCurrencyOutcome({ ...base, ledgerCurrency: "USD" })).toBe("blocked")
    expect(ledgerCurrencyOutcome({ ...base, country: "ZA", companyCurrency: "ZAR", ledgerCurrency: "LSL" })).toBe("blocked")
  })

  it("blocks a support-list company (country US, currency USD) without throwing", () => {
    expect(ledgerCurrencyOutcome({ ...base, country: "US", companyCurrency: "USD", ledgerCurrency: "ZAR" })).toBe("blocked")
  })
})
