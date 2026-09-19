import { describe, expect, it } from "vitest"
import { filterOverridesToEligible, resolveSelectionEligibility } from "./integration-push-selection"

const baseDoc = {
  status: "reviewed",
  docType: "invoice",
  codingData: { categoryConfirmed: true },
  baseCurrencyTotal: 100,
  cancelledAt: null,
}
const opts = { alreadyPosted: false, workspaceBase: "USD", docCurrency: "USD" }

describe("resolveSelectionEligibility", () => {
  it("is eligible when every criterion holds", () => {
    expect(resolveSelectionEligibility(baseDoc, opts)).toEqual({ eligible: true })
  })

  it("returns a named reason — never a silent drop — for each ineligible criterion", () => {
    expect(resolveSelectionEligibility({ ...baseDoc, cancelledAt: new Date() }, opts)).toEqual({ eligible: false, reason: "Cancelled" })
    expect(resolveSelectionEligibility(baseDoc, { ...opts, alreadyPosted: true })).toEqual({ eligible: false, reason: "Already posted" })
    expect(resolveSelectionEligibility({ ...baseDoc, status: "pending" }, opts)).toEqual({ eligible: false, reason: "Not yet approved" })
    expect(resolveSelectionEligibility({ ...baseDoc, docType: "contract" }, opts)).toEqual({ eligible: false, reason: "Document type not supported" })
    expect(resolveSelectionEligibility({ ...baseDoc, baseCurrencyTotal: null }, { ...opts, docCurrency: "EUR" })).toEqual({ eligible: false, reason: "Currency conversion pending" })
    expect(resolveSelectionEligibility({ ...baseDoc, codingData: {} }, opts)).toEqual({ eligible: false, reason: "Category not confirmed" })
  })

  it("does not gate on currency when the doc is already in the workspace base currency", () => {
    expect(resolveSelectionEligibility({ ...baseDoc, baseCurrencyTotal: null }, opts)).toEqual({ eligible: true })
  })
})

describe("filterOverridesToEligible", () => {
  it("keeps only overrides for server-confirmed eligible ids — an override for a rejected id is never read", () => {
    const eligibleIds = new Set(["a", "b"])
    const overrides = { a: "acct_1", c: "acct_3" }
    expect(filterOverridesToEligible(eligibleIds, overrides)).toEqual({ a: "acct_1" })
  })

  it("returns an empty map when no overrides were supplied", () => {
    expect(filterOverridesToEligible(new Set(["a"]), undefined)).toEqual({})
  })
})
