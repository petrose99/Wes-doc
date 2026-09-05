import { describe, expect, it } from "vitest"
import { checkBudget, checkDocumentAgainstBudgets, matchesBudget, type Budget, type BudgetDocument } from "./engine"

const budget = (overrides: Partial<Budget> = {}): Budget => ({
  id: "b-1",
  name: "Office Supplies",
  category: null,
  vendor: null,
  templateCode: null,
  amount: 1000,
  periodType: "monthly",
  warnAtPercent: 80,
  ...overrides,
})

const doc = (overrides: Partial<BudgetDocument> = {}): BudgetDocument => ({
  templateCode: "expense",
  vendor: "Acme Corp",
  category: "Office Supplies",
  amount: 100,
  ...overrides,
})

describe("matchesBudget", () => {
  it("matches a catch-all budget (no filters)", () => {
    expect(matchesBudget(budget(), doc())).toBe(true)
  })

  it("matches on templateCode", () => {
    expect(matchesBudget(budget({ templateCode: "expense" }), doc())).toBe(true)
  })

  it("rejects wrong templateCode", () => {
    expect(matchesBudget(budget({ templateCode: "invoice" }), doc())).toBe(false)
  })

  it("matches on vendor (case insensitive)", () => {
    expect(matchesBudget(budget({ vendor: "acme corp" }), doc())).toBe(true)
  })

  it("rejects wrong vendor", () => {
    expect(matchesBudget(budget({ vendor: "Globex" }), doc())).toBe(false)
  })

  it("rejects when budget has vendor filter but doc has no vendor", () => {
    expect(matchesBudget(budget({ vendor: "Acme" }), doc({ vendor: null }))).toBe(false)
  })

  it("matches on category (case insensitive)", () => {
    expect(matchesBudget(budget({ category: "office supplies" }), doc())).toBe(true)
  })

  it("rejects wrong category", () => {
    expect(matchesBudget(budget({ category: "Travel" }), doc())).toBe(false)
  })

  it("rejects when budget has category filter but doc has no category", () => {
    expect(matchesBudget(budget({ category: "Office" }), doc({ category: null }))).toBe(false)
  })
})

describe("checkBudget", () => {
  it("returns ok when under threshold", () => {
    const result = checkBudget(budget(), 500, 100)
    expect(result.status).toBe("ok")
    expect(result.percentUsed).toBe(60)
  })

  it("returns warning at threshold", () => {
    const result = checkBudget(budget(), 700, 100)
    expect(result.status).toBe("warning")
    expect(result.percentUsed).toBe(80)
  })

  it("returns exceeded at 100%", () => {
    const result = checkBudget(budget(), 900, 100)
    expect(result.status).toBe("exceeded")
    expect(result.percentUsed).toBe(100)
  })

  it("returns exceeded over 100%", () => {
    const result = checkBudget(budget(), 1000, 200)
    expect(result.status).toBe("exceeded")
    expect(result.percentUsed).toBe(120)
  })

  it("includes budget metadata", () => {
    const result = checkBudget(budget(), 500, 100)
    expect(result.budgetId).toBe("b-1")
    expect(result.budgetName).toBe("Office Supplies")
    expect(result.budgetAmount).toBe(1000)
    expect(result.currentSpend).toBe(500)
    expect(result.projectedSpend).toBe(600)
  })
})

describe("checkDocumentAgainstBudgets", () => {
  it("returns empty for null amount", () => {
    expect(checkDocumentAgainstBudgets([budget()], doc({ amount: null }), {})).toEqual([])
  })

  it("returns empty for zero amount", () => {
    expect(checkDocumentAgainstBudgets([budget()], doc({ amount: 0 }), {})).toEqual([])
  })

  it("returns only warning/exceeded results", () => {
    const results = checkDocumentAgainstBudgets(
      [budget({ id: "low", amount: 1000 }), budget({ id: "high", amount: 10000 })],
      doc({ amount: 200 }),
      { low: 850, high: 100 },
    )
    expect(results).toHaveLength(1)
    expect(results[0].budgetId).toBe("low")
    expect(results[0].status).toBe("exceeded")
  })

  it("sorts by percentUsed descending", () => {
    const results = checkDocumentAgainstBudgets(
      [budget({ id: "a", amount: 1000, warnAtPercent: 50 }), budget({ id: "b", amount: 500, warnAtPercent: 50 })],
      doc({ amount: 100 }),
      { a: 600, b: 400 },
    )
    expect(results.length).toBeGreaterThanOrEqual(2)
    expect(results[0].percentUsed).toBeGreaterThanOrEqual(results[1].percentUsed)
  })

  it("skips budgets that don't match the document", () => {
    const results = checkDocumentAgainstBudgets(
      [budget({ vendor: "Globex", amount: 100 })],
      doc({ vendor: "Acme", amount: 200 }),
      {},
    )
    expect(results).toHaveLength(0)
  })
})
