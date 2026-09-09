import { describe, expect, it } from "vitest"
import { confidentAssignments, getVendorCodingPrior, type CodedDocumentSlice } from "./vendor-history"

const row = (over: Partial<CodedDocumentSlice> = {}): CodedDocumentSlice => ({
  documentId: "d",
  supplier: "Acme Ltd",
  templateCode: "invoice",
  codingData: { account: "6000", taxCode: "T1" },
  codingSource: "manual",
  ...over,
})

describe("getVendorCodingPrior", () => {
  it("returns empty when no history exists", () => {
    expect(getVendorCodingPrior([], "Acme", "invoice")).toEqual({ byKey: {}, support: 0 })
  })

  it("normalizes supplier casing and whitespace", () => {
    const history = [row({ supplier: "ACME  Ltd" }), row({ supplier: "acme ltd" })]
    const prior = getVendorCodingPrior(history, "Acme Ltd", "invoice")
    expect(prior.support).toBe(2)
    expect(prior.byKey.account.agreement).toBe(1)
  })

  it("scopes to matching templateCode", () => {
    const history = [row({ templateCode: "receipt" })]
    const prior = getVendorCodingPrior(history, "Acme Ltd", "invoice")
    expect(prior.support).toBe(0)
  })

  it("reports the modal value and its agreement", () => {
    const history = [
      row({ codingData: { account: "6000" } }),
      row({ codingData: { account: "6000" } }),
      row({ codingData: { account: "6000" } }),
      row({ codingData: { account: "7000" } }),
    ]
    const prior = getVendorCodingPrior(history, "Acme Ltd", "invoice")
    expect(prior.byKey.account.modalValue).toBe("6000")
    expect(prior.byKey.account.support).toBe(4)
    expect(prior.byKey.account.agreement).toBeCloseTo(0.75)
  })
})

describe("confidentAssignments", () => {
  it("returns keys that clear the 90% / 3-row bar", () => {
    const history = [
      row({ codingData: { account: "6000" } }),
      row({ codingData: { account: "6000" } }),
      row({ codingData: { account: "6000" } }),
    ]
    const prior = getVendorCodingPrior(history, "Acme Ltd", "invoice")
    expect(confidentAssignments(prior, ["account"])).toEqual({ account: "6000" })
  })

  it("skips a key with < 3 rows even at 100% agreement", () => {
    const history = [row({ codingData: { account: "6000" } })]
    const prior = getVendorCodingPrior(history, "Acme Ltd", "invoice")
    expect(confidentAssignments(prior, ["account"])).toEqual({})
  })

  it("skips a key that's below the agreement threshold", () => {
    const history = [
      row({ codingData: { account: "6000" } }),
      row({ codingData: { account: "6000" } }),
      row({ codingData: { account: "7000" } }),
      row({ codingData: { account: "8000" } }),
    ]
    const prior = getVendorCodingPrior(history, "Acme Ltd", "invoice")
    expect(confidentAssignments(prior, ["account"])).toEqual({})
  })
})
