import { describe, expect, it } from "vitest"
import {
  addCents,
  amountsEqualCents,
  decimalToNumber,
  decimalToNumberOrZero,
  formatCurrency,
  formatMoney,
  fromCents,
  toCents,
} from "./money"

describe("money", () => {
  describe("toCents / fromCents", () => {
    it("rounds to nearest cent (and defuses the 0.1+0.2 trap)", () => {
      // 1.004 clearly rounds down; 1.006 clearly rounds up. 1.005 is intentionally omitted —
      // it does not exist exactly as a float (it stores as 1.00499...), so rounding it is
      // hardware-level ambiguous and we don't rely on either outcome.
      expect(toCents(1.004)).toBe(100)
      expect(toCents(1.006)).toBe(101)
      expect(toCents(0.1 + 0.2)).toBe(30)
    })
    it("handles null and non-finite as 0", () => {
      expect(toCents(null)).toBe(0)
      expect(toCents(undefined)).toBe(0)
      expect(toCents(Number.NaN)).toBe(0)
      expect(toCents(Number.POSITIVE_INFINITY)).toBe(0)
    })
    it("round-trips through fromCents", () => {
      expect(fromCents(toCents(123.45))).toBe(123.45)
    })
  })

  describe("addCents", () => {
    it("avoids the 0.1 + 0.2 trap", () => {
      expect(fromCents(addCents([0.1, 0.2]))).toBe(0.3)
    })
    it("sums with mixed nulls", () => {
      expect(addCents([1.11, null, 2.22, undefined, 3.33])).toBe(666)
    })
  })

  describe("amountsEqualCents", () => {
    it("is exact by default", () => {
      expect(amountsEqualCents(1.00, 1.00)).toBe(true)
      expect(amountsEqualCents(1.00, 1.01)).toBe(false)
    })
    it("respects a 2% (200 bps) tolerance", () => {
      expect(amountsEqualCents(100, 102, 200)).toBe(true)
      // 105 vs 100 is 5% apart — outside the 2% band.
      expect(amountsEqualCents(100, 105, 200)).toBe(false)
    })
    it("handles null vs null and null vs zero", () => {
      expect(amountsEqualCents(null, null)).toBe(true)
      expect(amountsEqualCents(null, 0)).toBe(true)
      expect(amountsEqualCents(null, 0.01)).toBe(false)
    })
  })

  describe("decimalToNumber", () => {
    it("handles primitives", () => {
      expect(decimalToNumber(null)).toBeNull()
      expect(decimalToNumber(undefined)).toBeNull()
      expect(decimalToNumber(1.23)).toBe(1.23)
      expect(decimalToNumber("1.23")).toBe(1.23)
    })
    it("handles Prisma Decimal-like via toNumber()", () => {
      expect(decimalToNumber({ toNumber: () => 42.5, toString: () => "42.5" })).toBe(42.5)
    })
    it("falls back to toString() when toNumber missing", () => {
      expect(decimalToNumber({ toString: () => "99.9" })).toBe(99.9)
    })
    it("returns null for non-finite / bad strings", () => {
      expect(decimalToNumber("not-a-number")).toBeNull()
      expect(decimalToNumber(Number.NaN)).toBeNull()
    })
    it("decimalToNumberOrZero coerces null to 0", () => {
      expect(decimalToNumberOrZero(null)).toBe(0)
      expect(decimalToNumberOrZero("1.5")).toBe(1.5)
    })
  })

  describe("formatMoney", () => {
    it("formats with currency and 2 decimals", () => {
      expect(formatMoney(12.5, "USD")).toBe("12.50 USD")
      expect(formatMoney(0, "USD")).toBe("0.00 USD")
    })
    it("returns - for null / non-finite", () => {
      expect(formatMoney(null)).toBe("-")
      expect(formatMoney(Number.NaN)).toBe("-")
    })
  })
  describe("formatCurrency", () => {
    const nb = "\u00A0"
    it("prints the ISO code, a no-break space, en grouping and 2 decimals", () => {
      expect(formatCurrency(1234.5, "LSL")).toBe(`LSL${nb}1,234.50`)
      expect(formatCurrency(0, "zar")).toBe(`ZAR${nb}0.00`)
    })
    it("puts the minus after the code", () => {
      expect(formatCurrency(-1234.5, "LSL")).toBe(`LSL${nb}-1,234.50`)
    })
    it("takes 0 decimals for summaries", () => {
      expect(formatCurrency(1234.5, "USD", 0)).toBe(`USD${nb}1,235`)
    })
    it("prints the bare number when the currency is unknown", () => {
      expect(formatCurrency(1234.5, null)).toBe("1,234.50")
      expect(formatCurrency(1234.5, "dollars")).toBe("1,234.50")
    })
    it("returns an em dash for null / non-finite", () => {
      expect(formatCurrency(null, "USD")).toBe("—")
      expect(formatCurrency(Number.NaN, "USD")).toBe("—")
    })
  })
})
