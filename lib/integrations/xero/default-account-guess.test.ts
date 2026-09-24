import { describe, expect, it } from "vitest"
import { guessXeroDefaultAccount } from "@/lib/integrations/xero/default-account-guess"

describe("guessXeroDefaultAccount", () => {
  it("matches the catch-all EXPENSE-class account by exact name", () => {
    const accounts = [
      { entityType: "account", active: true, name: "Office supplies", raw: { accountClass: "EXPENSE" } },
      { entityType: "account", active: true, name: "General Expenses", raw: { accountClass: "EXPENSE" } },
    ]
    expect(guessXeroDefaultAccount(accounts)?.name).toBe("General Expenses")
  })

  it("ignores a same-named account of a different class", () => {
    const accounts = [{ entityType: "account", active: true, name: "General Expenses", raw: { accountClass: "REVENUE" } }]
    expect(guessXeroDefaultAccount(accounts)).toBeNull()
  })

  it("ignores an inactive match", () => {
    const accounts = [{ entityType: "account", active: false, name: "General Expenses", raw: { accountClass: "EXPENSE" } }]
    expect(guessXeroDefaultAccount(accounts)).toBeNull()
  })

  it("returns null with no match", () => {
    expect(guessXeroDefaultAccount([])).toBeNull()
  })
})
