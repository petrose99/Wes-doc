import { describe, expect, it } from "vitest"
import { descriptorSupplierOverlap, normalizeBankDescriptor } from "@/lib/bank-match/counterparty"

describe("normalizeBankDescriptor", () => {
  it("strips processor prefixes and transaction ids", () => {
    expect(normalizeBankDescriptor("PAYPAL *ACMELTD 4029357733 CA")).toBe("acmeltd")
    expect(normalizeBankDescriptor("SQ *ACME LTD")).toBe("acme ltd")
    expect(normalizeBankDescriptor("TFR TO ACME LTD REF 998 20260805")).toBe("acme ltd")
  })

  it("returns empty when nothing meaningful remains", () => {
    expect(normalizeBankDescriptor(" ")).toBe("")
    expect(normalizeBankDescriptor(null)).toBe("")
    expect(normalizeBankDescriptor("PAYPAL * 4029357733")).toBe("")
  })
})

describe("descriptorSupplierOverlap", () => {
  it("scores a full-match descriptor at 1", () => {
    expect(descriptorSupplierOverlap("PAYMENT TO ACME LTD REF 998", "Acme Ltd")).toBe(1)
  })
  it("scores 0 when nothing overlaps", () => {
    expect(descriptorSupplierOverlap("PAYMENT TO GLOBEX", "Acme Ltd")).toBe(0)
  })
})
