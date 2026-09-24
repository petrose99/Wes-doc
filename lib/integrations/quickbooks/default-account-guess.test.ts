import { describe, expect, it } from "vitest"
import { guessQuickBooksDefaultAccount } from "@/lib/integrations/quickbooks/default-account-guess"

describe("guessQuickBooksDefaultAccount", () => {
  it("matches the catch-all Expense account by exact name", () => {
    const accounts = [
      { entityType: "account", active: true, name: "Office supplies", raw: { accountType: "Expense" } },
      { entityType: "account", active: true, name: "Uncategorized Expense", raw: { accountType: "Expense" } },
    ]
    expect(guessQuickBooksDefaultAccount(accounts)?.name).toBe("Uncategorized Expense")
  })

  it("ignores a same-named account of a different type", () => {
    const accounts = [{ entityType: "account", active: true, name: "Uncategorized Expense", raw: { accountType: "Income" } }]
    expect(guessQuickBooksDefaultAccount(accounts)).toBeNull()
  })

  it("ignores an inactive match", () => {
    const accounts = [{ entityType: "account", active: false, name: "Uncategorized Expense", raw: { accountType: "Expense" } }]
    expect(guessQuickBooksDefaultAccount(accounts)).toBeNull()
  })

  it("ignores non-account rows and returns null with no match", () => {
    const accounts = [{ entityType: "vendor", active: true, name: "Uncategorized Expense", raw: { accountType: "Expense" } }]
    expect(guessQuickBooksDefaultAccount(accounts)).toBeNull()
  })
})
