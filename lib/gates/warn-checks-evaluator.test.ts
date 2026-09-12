import { describe, expect, it } from "vitest"

import {
  evaluateWarnCheck,
  parseWarnCheck,
  WarnCheckEvalError,
  WarnCheckParseError,
  type WarnCheckContext,
} from "./warn-checks-evaluator"

/** Minimal context factory — every test starts from a "fully-filled bill" and overrides just
 * the fields it cares about. This isolates each test to one property of the language. */
function ctx(overrides: Partial<WarnCheckContext> = {}): WarnCheckContext {
  return {
    total: 100,
    currency: "USD",
    supplierKnown: true,
    category: "software",
    description: "Adobe Creative Cloud subscription",
    vatRate: 0.15,
    daysToDue: 14,
    ...overrides,
  }
}

function run(expr: string, over: Partial<WarnCheckContext> = {}): boolean {
  return evaluateWarnCheck(parseWarnCheck(expr), ctx(over))
}

describe("parseWarnCheck", () => {
  it("accepts simple numeric comparisons", () => {
    expect(run("total > 50")).toBe(true)
    expect(run("total < 50")).toBe(false)
  })

  it("accepts string equality with either quote style", () => {
    expect(run('currency == "USD"')).toBe(true)
    expect(run("currency == 'EUR'")).toBe(false)
  })

  it("accepts boolean literals and negation", () => {
    expect(run("supplierKnown")).toBe(true)
    expect(run("not supplierKnown")).toBe(false)
    expect(run("supplierKnown == true")).toBe(true)
    expect(run("supplierKnown == false")).toBe(false)
  })

  it("respects and/or precedence — and binds tighter than or", () => {
    // total>50 AND currency==EUR is false; the OR keeps the whole rule true only if the second
    // clause holds. If precedence were flipped, the answer would differ.
    expect(run('total > 50 and currency == "EUR" or supplierKnown')).toBe(true)
    expect(run('total > 50 and currency == "USD" or supplierKnown')).toBe(true)
    expect(run('total > 5000 and currency == "USD" or not supplierKnown')).toBe(false)
  })

  it("parenthesises to override precedence", () => {
    expect(run("(total > 50 or total < 10) and supplierKnown")).toBe(true)
    expect(run("(total > 500 or total < 10) and supplierKnown")).toBe(false)
  })

  it("substring is case-insensitive via contains", () => {
    expect(run('description contains "adobe"')).toBe(true)
    expect(run('description contains "ADOBE"')).toBe(true)
    expect(run('description contains "figma"')).toBe(false)
  })

  it("rejects an unknown variable at parse time with the allowed set in the message", () => {
    let err: unknown
    try {
      parseWarnCheck("mystery > 0")
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(WarnCheckParseError)
    expect((err as Error).message).toContain("Unknown variable")
    expect((err as Error).message).toContain("total")
  })

  it("rejects unterminated strings", () => {
    expect(() => parseWarnCheck('currency == "USD')).toThrow(WarnCheckParseError)
  })

  it("rejects trailing garbage", () => {
    expect(() => parseWarnCheck("total > 5 xyz")).toThrow(WarnCheckParseError)
  })

  it("rejects chained comparisons — author must write it out", () => {
    expect(() => parseWarnCheck("1 < total < 5")).toThrow(WarnCheckParseError)
  })

  it("rejects reserved words used as variables", () => {
    expect(() => parseWarnCheck("and")).toThrow(WarnCheckParseError)
  })

  it("rejects empty and whitespace-only expressions", () => {
    expect(() => parseWarnCheck("")).toThrow(WarnCheckParseError)
    expect(() => parseWarnCheck("   ")).toThrow(WarnCheckParseError)
  })

  it("does not accept assignment or arithmetic — those aren't in the language", () => {
    expect(() => parseWarnCheck("total = 5")).toThrow(WarnCheckParseError)
    expect(() => parseWarnCheck("total + 1 > 5")).toThrow(WarnCheckParseError)
  })

  it("escapes work for quote and backslash inside strings", () => {
    expect(run('description contains "creative"')).toBe(true)
    // A literal backslash + quote: the string is "he said \"hi\""
    expect(evaluateWarnCheck(parseWarnCheck('description == "he said \\"hi\\""'), ctx({ description: 'he said "hi"' }))).toBe(true)
  })
})

describe("evaluateWarnCheck — null handling", () => {
  it("returns false when a compared variable is null, on both sides", () => {
    // A missing total must not accidentally fire a "big bill" rule.
    expect(run("total > 5000", { total: null })).toBe(false)
    // Nor a "cheap bill" rule.
    expect(run("total < 5", { total: null })).toBe(false)
    // == and != also fall through when either side is null.
    expect(run('currency == "USD"', { currency: null })).toBe(false)
    expect(run('currency != "USD"', { currency: null })).toBe(false)
  })

  it("compares null against null literal as false too (unknown never equals unknown)", () => {
    expect(run("total == null", { total: null })).toBe(false)
    expect(run("total != null", { total: null })).toBe(false)
  })
})

describe("evaluateWarnCheck — type safety", () => {
  it("refuses to order-compare strings (no JS string-sort footgun)", () => {
    expect(() => evaluateWarnCheck(parseWarnCheck('currency < "USD"'), ctx())).toThrow(WarnCheckEvalError)
  })

  it("refuses non-boolean operands to and/or/not", () => {
    expect(() => evaluateWarnCheck(parseWarnCheck("total and supplierKnown"), ctx())).toThrow(WarnCheckEvalError)
    expect(() => evaluateWarnCheck(parseWarnCheck("not total"), ctx())).toThrow(WarnCheckEvalError)
  })

  it("refuses contains on non-strings", () => {
    expect(() => evaluateWarnCheck(parseWarnCheck("total contains 5"), ctx())).toThrow(WarnCheckEvalError)
  })

  it("refuses a top-level expression that is not boolean", () => {
    expect(() => evaluateWarnCheck(parseWarnCheck("total"), ctx())).toThrow(WarnCheckEvalError)
    expect(() => evaluateWarnCheck(parseWarnCheck("currency"), ctx())).toThrow(WarnCheckEvalError)
  })

  it("returns false rather than throwing on == across type mismatch", () => {
    // A rule comparing a number to a string is unlikely but not a security concern — a
    // silent false lets a workspace with mixed data keep running rather than erroring on it.
    expect(run('total == "100"')).toBe(false)
    expect(run('total != "100"')).toBe(true)
  })
})

describe("evaluateWarnCheck — realistic rules", () => {
  it("blocks unverified suppliers on large bills", () => {
    const rule = "total > 1000 and not supplierKnown"
    expect(evaluateWarnCheck(parseWarnCheck(rule), ctx({ total: 5000, supplierKnown: false }))).toBe(true)
    expect(evaluateWarnCheck(parseWarnCheck(rule), ctx({ total: 5000, supplierKnown: true }))).toBe(false)
    expect(evaluateWarnCheck(parseWarnCheck(rule), ctx({ total: 500, supplierKnown: false }))).toBe(false)
  })

  it("flags overdue bills in a specific category", () => {
    const rule = 'daysToDue < 0 and category == "rent"'
    expect(evaluateWarnCheck(parseWarnCheck(rule), ctx({ daysToDue: -3, category: "rent" }))).toBe(true)
    expect(evaluateWarnCheck(parseWarnCheck(rule), ctx({ daysToDue: 5, category: "rent" }))).toBe(false)
    expect(evaluateWarnCheck(parseWarnCheck(rule), ctx({ daysToDue: -3, category: "software" }))).toBe(false)
  })

  it("flags zero-rated VAT lines that shouldn't be zero-rated", () => {
    const rule = 'vatRate == 0 and description contains "consulting"'
    expect(evaluateWarnCheck(parseWarnCheck(rule), ctx({ vatRate: 0, description: "Ongoing consulting fees" }))).toBe(true)
    expect(evaluateWarnCheck(parseWarnCheck(rule), ctx({ vatRate: 0.15, description: "Ongoing consulting fees" }))).toBe(false)
    // Missing vatRate — silent pass.
    expect(evaluateWarnCheck(parseWarnCheck(rule), ctx({ vatRate: null, description: "Ongoing consulting fees" }))).toBe(false)
  })
})
