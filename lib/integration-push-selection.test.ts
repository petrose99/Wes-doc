import { describe, expect, it } from "vitest"
import { resolveSelectionEligibility } from "./integration-push-selection"

const baseDoc = {
  status: "reviewed",
  docType: "invoice",
  codingData: { categoryConfirmed: true, items: [{ account_external_id: "acct_1", account_source: "default_guessed" }] },
  baseCurrencyTotal: 100,
  cancelledAt: null,
}
const opts = { alreadyPosted: false, workspaceBase: "USD", docCurrency: "USD", lineCodingFail: null }

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
    expect(resolveSelectionEligibility({ ...baseDoc, codingData: { items: baseDoc.codingData.items } }, opts)).toEqual({ eligible: false, reason: "Category not confirmed" })
  })

  it("does not gate on currency when the doc is already in the workspace base currency", () => {
    expect(resolveSelectionEligibility({ ...baseDoc, baseCurrencyTotal: null }, opts)).toEqual({ eligible: true })
  })

  it("#429: is ineligible — 'needs an Account' — when a line has no resolved account", () => {
    expect(resolveSelectionEligibility({ ...baseDoc, codingData: { categoryConfirmed: true, items: [{ account_external_id: null, account_source: null }] } }, opts))
      .toEqual({ eligible: false, reason: "needs an Account" })
    expect(resolveSelectionEligibility({ ...baseDoc, codingData: { categoryConfirmed: true } }, opts))
      .toEqual({ eligible: false, reason: "needs an Account" })
  })

  it("ADR 0014: is ineligible with the first line-coding fail's title as the reason", () => {
    expect(resolveSelectionEligibility(baseDoc, { ...opts, lineCodingFail: "Tax code missing" })).toEqual({ eligible: false, reason: "Tax code missing" })
    // An Account comes first: a line with no Account can't be judged for its Tax code yet.
    expect(resolveSelectionEligibility({ ...baseDoc, codingData: { categoryConfirmed: true } }, { ...opts, lineCodingFail: "Tax code missing" }))
      .toEqual({ eligible: false, reason: "needs an Account" })
  })
})
