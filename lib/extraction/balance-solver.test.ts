import { describe, expect, it } from "vitest"
import { isOcrConfusable, solveRunningBalance, walkBalanceChain, groupTransactionsByAccount, type BalanceRow } from "./balance-solver"

describe("isOcrConfusable", () => {
  it("same values are confusable", () => {
    expect(isOcrConfusable(100, 100, null)).toBe(true)
  })

  it("0 ↔ 8 single-digit substitution", () => {
    expect(isOcrConfusable(100.00, 180.00, null)).toBe(true)
    expect(isOcrConfusable(180.00, 100.00, null)).toBe(true)
  })

  it("0 ↔ 6 substitution", () => {
    expect(isOcrConfusable(300.00, 360.00, null)).toBe(true)
  })

  it("1 ↔ 7 substitution", () => {
    expect(isOcrConfusable(100.00, 700.00, null)).toBe(true)
  })

  it("adjacent transposition", () => {
    expect(isOcrConfusable(1234.00, 1243.00, null)).toBe(true)
  })

  it("decimal shift ×100", () => {
    expect(isOcrConfusable(12.34, 1234, null)).toBe(true)
  })

  it("decimal shift ÷100", () => {
    expect(isOcrConfusable(1234, 12.34, null)).toBe(true)
  })

  it("thousands-group drop", () => {
    expect(isOcrConfusable(1000, 1, null)).toBe(false)
    expect(isOcrConfusable(1234.56, 1234.56, null)).toBe(true)
  })

  it("rejects non-confusable values", () => {
    expect(isOcrConfusable(100, 250, null)).toBe(false)
    expect(isOcrConfusable(100, 999, null)).toBe(false)
  })

  it("respects zero-decimal currencies", () => {
    expect(isOcrConfusable(100, 180, "JPY")).toBe(true)
  })
})

describe("walkBalanceChain", () => {
  it("reports no breaks for a consistent chain", () => {
    const rows: BalanceRow[] = [
      { debit: null, credit: 100, running_balance: 1100 },
      { debit: 50, credit: null, running_balance: 1050 },
    ]
    const { breaks, lastBalance } = walkBalanceChain(rows, 1000, null)
    expect(breaks).toHaveLength(0)
    expect(lastBalance).toBe(1050)
  })

  it("reports a break for an inconsistent amount", () => {
    const rows: BalanceRow[] = [
      { debit: null, credit: 100, running_balance: 1100 },
      { debit: 80, credit: null, running_balance: 1050 },
    ]
    const { breaks } = walkBalanceChain(rows, 1000, null)
    expect(breaks).toHaveLength(1)
    expect(breaks[0].rowIndex).toBe(1)
  })

  it("handles null opening balance", () => {
    const rows: BalanceRow[] = [
      { debit: null, credit: 100, running_balance: 1100 },
    ]
    const { breaks, lastBalance } = walkBalanceChain(rows, null, null)
    expect(breaks).toHaveLength(0)
    expect(lastBalance).toBe(1100)
  })

  it("handles sparse balances", () => {
    const rows: BalanceRow[] = [
      { debit: null, credit: 100, running_balance: null },
      { debit: null, credit: 50, running_balance: 1150 },
    ]
    const { breaks } = walkBalanceChain(rows, 1000, null)
    expect(breaks).toHaveLength(0)
  })
})

describe("solveRunningBalance", () => {
  it("returns empty on a consistent chain", () => {
    const rows: BalanceRow[] = [
      { debit: null, credit: 500, running_balance: 1500 },
      { debit: 200, credit: null, running_balance: 1300 },
    ]
    const result = solveRunningBalance({ rows, openingBalance: 1000, closingBalance: 1300, currencyCode: null })
    expect(result.corrections).toHaveLength(0)
    expect(result.chainConsistent).toBe(true)
    expect(result.suspectRowIndexes).toHaveLength(0)
  })

  it("corrects a single OCR-confusable misread (0↔8)", () => {
    const rows: BalanceRow[] = [
      { debit: null, credit: 500, running_balance: 1500 },
      { debit: 280, credit: null, running_balance: 1300 },
    ]
    const result = solveRunningBalance({ rows, openingBalance: 1000, closingBalance: 1300, currencyCode: null })
    expect(result.corrections).toHaveLength(1)
    expect(result.corrections[0].rowIndex).toBe(1)
    expect(result.corrections[0].corrected).toBe(200)
    expect(result.corrections[0].reason).toBe("ocr_confusable")
  })

  it("fills a missing amount when balance is present", () => {
    const rows: BalanceRow[] = [
      { debit: null, credit: null, running_balance: 1500 },
    ]
    const result = solveRunningBalance({ rows, openingBalance: 1000, closingBalance: 1500, currencyCode: null })
    expect(result.corrections).toHaveLength(1)
    expect(result.corrections[0].field).toBe("credit")
    expect(result.corrections[0].corrected).toBe(500)
    expect(result.corrections[0].reason).toBe("missing_amount")
  })

  it("flags non-confusable single break as suspect", () => {
    const rows: BalanceRow[] = [
      { debit: null, credit: 500, running_balance: 1500 },
      { debit: 999, credit: null, running_balance: 1300 },
    ]
    const result = solveRunningBalance({ rows, openingBalance: 1000, closingBalance: 1300, currencyCode: null })
    expect(result.corrections).toHaveLength(0)
    expect(result.suspectRowIndexes).toContain(1)
  })

  it("corrects adjacent-break wrong balance", () => {
    const rows: BalanceRow[] = [
      { debit: null, credit: 500, running_balance: 1580 },
      { debit: 200, credit: null, running_balance: 1300 },
    ]
    const result = solveRunningBalance({ rows, openingBalance: 1000, closingBalance: 1300, currencyCode: null })
    expect(result.corrections).toHaveLength(1)
    expect(result.corrections[0].field).toBe("running_balance")
    expect(result.corrections[0].corrected).toBe(1500)
    expect(result.corrections[0].reason).toBe("wrong_balance")
  })

  it("flags >1 non-adjacent breaks as suspect", () => {
    const rows: BalanceRow[] = [
      { debit: null, credit: 999, running_balance: 1500 },
      { debit: 200, credit: null, running_balance: 1300 },
      { debit: null, credit: 999, running_balance: 1500 },
    ]
    const result = solveRunningBalance({ rows, openingBalance: 1000, closingBalance: 1500, currencyCode: null })
    expect(result.suspectRowIndexes.length).toBeGreaterThanOrEqual(2)
  })

  it("detects summary conflict (closing differs from chain)", () => {
    const rows: BalanceRow[] = [
      { debit: null, credit: 500, running_balance: 1500 },
      { debit: 200, credit: null, running_balance: 1300 },
    ]
    const result = solveRunningBalance({ rows, openingBalance: 1000, closingBalance: 9999, currencyCode: null })
    expect(result.chainConsistent).toBe(false)
  })

  it("handles zero-decimal currencies", () => {
    const rows: BalanceRow[] = [
      { debit: null, credit: 500, running_balance: 1500 },
    ]
    const result = solveRunningBalance({ rows, openingBalance: 1000, closingBalance: 1500, currencyCode: "JPY" })
    expect(result.chainConsistent).toBe(true)
  })

  it("handles null opening — anchors on first printed balance", () => {
    const rows: BalanceRow[] = [
      { debit: null, credit: 100, running_balance: 1100 },
      { debit: 50, credit: null, running_balance: 1050 },
    ]
    const result = solveRunningBalance({ rows, openingBalance: null, closingBalance: 1050, currencyCode: null })
    expect(result.chainConsistent).toBe(true)
  })

  it("returns consistent for empty rows", () => {
    const result = solveRunningBalance({ rows: [], openingBalance: 1000, closingBalance: 1000, currencyCode: null })
    expect(result.chainConsistent).toBe(true)
    expect(result.corrections).toHaveLength(0)
  })
})

describe("groupTransactionsByAccount", () => {
  it("returns a single group when no accounts", () => {
    const txns = [{ debit: 100, credit: null, running_balance: 900 }]
    const groups = groupTransactionsByAccount(txns as Record<string, unknown>[], [], 1000, 900)
    expect(groups).toHaveLength(1)
    expect(groups[0].openingBalance).toBe(1000)
    expect(groups[0].closingBalance).toBe(900)
  })

  it("groups transactions by account_ref", () => {
    const txns = [
      { account_ref: "1234", debit: 100, credit: null },
      { account_ref: "5678", debit: null, credit: 200 },
      { account_ref: "1234", debit: null, credit: 50 },
    ]
    const accounts = [
      { account_number: "1234", opening_balance: 1000, closing_balance: 950 },
      { account_number: "5678", opening_balance: 2000, closing_balance: 2200 },
    ]
    const groups = groupTransactionsByAccount(txns as Record<string, unknown>[], accounts as Record<string, unknown>[], null, null)
    expect(groups).toHaveLength(2)
    expect(groups[0].rows).toHaveLength(2)
    expect(groups[1].rows).toHaveLength(1)
  })

  it("matches masked refs by trailing digits", () => {
    const txns = [
      { account_ref: "****5678", debit: 100, credit: null },
    ]
    const accounts = [
      { account_number: "1234-5678", opening_balance: 1000, closing_balance: 900 },
    ]
    const groups = groupTransactionsByAccount(txns as Record<string, unknown>[], accounts as Record<string, unknown>[], null, null)
    expect(groups).toHaveLength(1)
    expect(groups[0].rows).toHaveLength(1)
  })

  it("assigns ref-less rows by contiguity", () => {
    const txns = [
      { account_ref: "1234", debit: 100, credit: null },
      { debit: null, credit: 50 },
      { account_ref: "1234", debit: 200, credit: null },
    ]
    const accounts = [
      { account_number: "1234", opening_balance: 1000, closing_balance: 750 },
      { account_number: "5678", opening_balance: 2000, closing_balance: 2000 },
    ]
    const groups = groupTransactionsByAccount(txns as Record<string, unknown>[], accounts as Record<string, unknown>[], null, null)
    const acct1 = groups.find((g) => g.accountNumber === "1234")
    expect(acct1?.rows).toHaveLength(3)
  })

  it("bails out when all refs are missing with multi-account", () => {
    const txns = [
      { debit: 100, credit: null },
      { debit: null, credit: 50 },
    ]
    const accounts = [
      { account_number: "1234", opening_balance: 1000, closing_balance: 900 },
      { account_number: "5678", opening_balance: 2000, closing_balance: 2050 },
    ]
    const groups = groupTransactionsByAccount(txns as Record<string, unknown>[], accounts as Record<string, unknown>[], 1000, 900)
    expect(groups).toHaveLength(1)
    expect(groups[0].accountNumber).toBeNull()
  })
})
