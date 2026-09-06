import { describe, expect, it } from "vitest"
import {
  normalizeIban,
  normalizeSupplierName,
  supplierTokens,
  SUPPLIER_MATCH_AUTO_THRESHOLD,
  SUPPLIER_MATCH_REVIEW_THRESHOLD,
  tokenSetRatio,
} from "@/lib/suppliers/normalize"

describe("normalizeSupplierName", () => {
  it("folds case, punctuation and whitespace", () => {
    expect(normalizeSupplierName("  ACME   Software! ")).toBe("acme software")
  })

  it("strips trailing legal-form suffixes, repeatedly", () => {
    expect(normalizeSupplierName("Acme Ltd")).toBe("acme")
    expect(normalizeSupplierName("Acme Limited")).toBe("acme")
    expect(normalizeSupplierName("ACME LTD.")).toBe("acme")
    expect(normalizeSupplierName("Acme Holdings B.V.")).toBe("acme")
    expect(normalizeSupplierName("Müller GmbH & Co. KG")).toBe("müller")
    expect(normalizeSupplierName("Widgets Pty Ltd")).toBe("widgets")
  })

  it("equates spelling variants of the same supplier", () => {
    expect(normalizeSupplierName("Acme Ltd.")).toBe(normalizeSupplierName("ACME Limited"))
    expect(normalizeSupplierName("Vodafone (Pty) Ltd")).toBe(normalizeSupplierName("VODAFONE"))
  })

  it("does not strip a suffix word mid-name or as the whole name", () => {
    expect(normalizeSupplierName("Ltd Software")).toBe("ltd software")
    expect(normalizeSupplierName("Ltd")).toBe("ltd")
  })

  it("normalizes unicode compatibility forms", () => {
    expect(normalizeSupplierName("Ａｃｍｅ")).toBe("acme")
  })

  it("returns empty string for unusable input", () => {
    expect(normalizeSupplierName(null)).toBe("")
    expect(normalizeSupplierName("  ...  ")).toBe("")
  })
})

describe("tokenSetRatio", () => {
  it("is 1 for identical normalized names regardless of order", () => {
    expect(tokenSetRatio("Acme Software Ltd", "Software Acme")).toBe(1)
  })

  it("scores containment high (auto band)", () => {
    expect(tokenSetRatio("Acme", "Acme Software Services")).toBeGreaterThanOrEqual(SUPPLIER_MATCH_REVIEW_THRESHOLD)
  })

  it("scores near-identical names in the auto band", () => {
    expect(tokenSetRatio("Acme Software Services", "Acme Software Service")).toBeGreaterThanOrEqual(SUPPLIER_MATCH_AUTO_THRESHOLD)
  })

  it("scores unrelated names below the review band", () => {
    expect(tokenSetRatio("Acme Software", "Globex Industrial")).toBeLessThan(SUPPLIER_MATCH_REVIEW_THRESHOLD)
  })

  it("is 0 when either side is unusable", () => {
    expect(tokenSetRatio("", "Acme")).toBe(0)
    expect(tokenSetRatio("Acme", null)).toBe(0)
  })
})

describe("supplierTokens", () => {
  it("returns sorted unique tokens without legal suffixes", () => {
    expect(supplierTokens("Widget Widget Ltd")).toEqual(["widget"])
    expect(supplierTokens("Beta Alpha GmbH")).toEqual(["alpha", "beta"])
  })
})

describe("normalizeIban", () => {
  it("compacts and uppercases a valid IBAN", () => {
    expect(normalizeIban("de89 3704 0044 0532 0130 00")).toBe("DE89370400440532013000")
  })
  it("rejects non-IBAN strings", () => {
    expect(normalizeIban("123456789")).toBe("")
    expect(normalizeIban("account: 456")).toBe("")
    expect(normalizeIban(null)).toBe("")
  })
})
