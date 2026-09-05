import { describe, expect, it } from "vitest"
import { findMatchingRule, matchesRule, type RoutingDocument, type RoutingRule } from "./engine"

function rule(overrides: Partial<RoutingRule> & { id?: string }): RoutingRule {
  return {
    id: "rule-1",
    name: "Test rule",
    priority: 0,
    matcher: {},
    assigneeId: "user-1",
    ...overrides,
  }
}

const doc: RoutingDocument = {
  templateCode: "expense",
  vendor: "Acme Corp",
  amount: 500,
}

describe("matchesRule", () => {
  it("matches an empty matcher (catch-all)", () => {
    expect(matchesRule({}, doc)).toBe(true)
  })

  it("matches on templateCode", () => {
    expect(matchesRule({ templateCode: "expense" }, doc)).toBe(true)
  })

  it("rejects on wrong templateCode", () => {
    expect(matchesRule({ templateCode: "sale" }, doc)).toBe(false)
  })

  it("matches on vendorPattern (substring)", () => {
    expect(matchesRule({ vendorPattern: "acme" }, doc)).toBe(true)
  })

  it("matches on vendorPattern (regex)", () => {
    expect(matchesRule({ vendorPattern: "^Acme" }, doc)).toBe(true)
  })

  it("rejects on vendorPattern mismatch", () => {
    expect(matchesRule({ vendorPattern: "^XYZ" }, doc)).toBe(false)
  })

  it("rejects vendorPattern when vendor is null", () => {
    expect(matchesRule({ vendorPattern: "acme" }, { ...doc, vendor: null })).toBe(false)
  })

  it("matches on minAmount", () => {
    expect(matchesRule({ minAmount: 100 }, doc)).toBe(true)
  })

  it("matches on exact minAmount", () => {
    expect(matchesRule({ minAmount: 500 }, doc)).toBe(true)
  })

  it("rejects below minAmount", () => {
    expect(matchesRule({ minAmount: 600 }, doc)).toBe(false)
  })

  it("rejects minAmount when amount is null", () => {
    expect(matchesRule({ minAmount: 100 }, { ...doc, amount: null })).toBe(false)
  })

  it("matches on maxAmount", () => {
    expect(matchesRule({ maxAmount: 1000 }, doc)).toBe(true)
  })

  it("matches on exact maxAmount", () => {
    expect(matchesRule({ maxAmount: 500 }, doc)).toBe(true)
  })

  it("rejects above maxAmount", () => {
    expect(matchesRule({ maxAmount: 400 }, doc)).toBe(false)
  })

  it("matches combined criteria", () => {
    expect(matchesRule({ templateCode: "expense", vendorPattern: "acme", minAmount: 100, maxAmount: 1000 }, doc)).toBe(true)
  })

  it("rejects when one combined criterion fails", () => {
    expect(matchesRule({ templateCode: "expense", vendorPattern: "acme", minAmount: 600 }, doc)).toBe(false)
  })

  it("handles invalid regex by falling back to substring match", () => {
    expect(matchesRule({ vendorPattern: "[invalid" }, { ...doc, vendor: "test [invalid value" })).toBe(true)
  })
})

describe("findMatchingRule", () => {
  it("returns null for empty rules", () => {
    expect(findMatchingRule([], doc)).toBeNull()
  })

  it("returns the matching rule", () => {
    const rules = [rule({ matcher: { templateCode: "expense" } })]
    expect(findMatchingRule(rules, doc)).toBe(rules[0])
  })

  it("returns the highest priority match", () => {
    const low = rule({ id: "low", priority: 1, matcher: { templateCode: "expense" }, assigneeId: "user-low" })
    const high = rule({ id: "high", priority: 10, matcher: { templateCode: "expense" }, assigneeId: "user-high" })
    const result = findMatchingRule([low, high], doc)
    expect(result?.assigneeId).toBe("user-high")
  })

  it("skips non-matching rules", () => {
    const sale = rule({ id: "sale", priority: 10, matcher: { templateCode: "sale" }, assigneeId: "user-sale" })
    const expense = rule({ id: "expense", priority: 1, matcher: { templateCode: "expense" }, assigneeId: "user-expense" })
    const result = findMatchingRule([sale, expense], doc)
    expect(result?.assigneeId).toBe("user-expense")
  })

  it("returns null when no rule matches", () => {
    const rules = [rule({ matcher: { templateCode: "sale" } })]
    expect(findMatchingRule(rules, doc)).toBeNull()
  })

  it("returns the first match at equal priority", () => {
    const a = rule({ id: "a", priority: 5, matcher: { templateCode: "expense", vendorPattern: "acme" }, assigneeId: "user-a" })
    const b = rule({ id: "b", priority: 5, matcher: { templateCode: "expense" }, assigneeId: "user-b" })
    const result = findMatchingRule([a, b], doc)
    expect(result?.id).toBe("a")
  })
})
