import { describe, expect, it } from "vitest"
import { formatUnresolvedAccountId, resolveDocumentLineAccounts, resolveLineAccount, usesLegacyAccountChain } from "./line-account-resolution"

describe("resolveLineAccount", () => {
  it("prefers the supplier rule over the Default", () => {
    expect(resolveLineAccount({ supplierRuleAccountId: "acc-supplier", defaultAccountId: "acc-default", defaultAccountGuessed: false }))
      .toEqual({ accountExternalId: "acc-supplier", accountSource: "supplier" })
  })

  it("falls back to the Default, guessed", () => {
    expect(resolveLineAccount({ supplierRuleAccountId: null, defaultAccountId: "acc-default", defaultAccountGuessed: true }))
      .toEqual({ accountExternalId: "acc-default", accountSource: "default_guessed" })
  })

  it("falls back to the Default, confirmed", () => {
    expect(resolveLineAccount({ supplierRuleAccountId: null, defaultAccountId: "acc-default", defaultAccountGuessed: false }))
      .toEqual({ accountExternalId: "acc-default", accountSource: "default_confirmed" })
  })

  it("resolves to nothing when there is no supplier rule and no Default", () => {
    expect(resolveLineAccount({ supplierRuleAccountId: null, defaultAccountId: null, defaultAccountGuessed: true }))
      .toEqual({ accountExternalId: null, accountSource: null })
  })
})

describe("usesLegacyAccountChain", () => {
  const connectionCreatedAt = new Date("2026-06-01T00:00:00Z")

  it("is true for a document coded before the connection existed", () => {
    expect(usesLegacyAccountChain("ai", new Date("2026-05-01T00:00:00Z"), connectionCreatedAt)).toBe(true)
  })

  it("is false for a document coded after the connection existed", () => {
    expect(usesLegacyAccountChain("ai", new Date("2026-07-01T00:00:00Z"), connectionCreatedAt)).toBe(false)
  })

  it("is false when the document has never been coded", () => {
    expect(usesLegacyAccountChain(null, new Date("2026-01-01T00:00:00Z"), connectionCreatedAt)).toBe(false)
  })

  it("is false when there is no coded-at timestamp to compare", () => {
    expect(usesLegacyAccountChain("manual", null, connectionCreatedAt)).toBe(false)
  })
})

describe("resolveDocumentLineAccounts", () => {
  it("stamps the same resolution onto every line, as independent rows", () => {
    const rows = resolveDocumentLineAccounts(3, { accountExternalId: "acc-1", accountSource: "supplier" })
    expect(rows).toEqual([
      { account_external_id: "acc-1", account_source: "supplier" },
      { account_external_id: "acc-1", account_source: "supplier" },
      { account_external_id: "acc-1", account_source: "supplier" },
    ])
    rows[0].account_external_id = "mutated"
    expect(rows[1].account_external_id).toBe("acc-1")
  })

  it("returns an empty array for zero or negative line counts", () => {
    expect(resolveDocumentLineAccounts(0, { accountExternalId: "acc-1", accountSource: "supplier" })).toEqual([])
    expect(resolveDocumentLineAccounts(-1, { accountExternalId: "acc-1", accountSource: "supplier" })).toEqual([])
  })
})

describe("formatUnresolvedAccountId", () => {
  it("title-cases a hyphenated or underscored id and marks it explicitly unsynced", () => {
    expect(formatUnresolvedAccountId("sundry-expenses")).toBe("Sundry Expenses (not synced)")
    expect(formatUnresolvedAccountId("office_supplies")).toBe("Office Supplies (not synced)")
  })

  it("leaves a single-word id capitalized with no double-spacing", () => {
    expect(formatUnresolvedAccountId("fuel")).toBe("Fuel (not synced)")
  })
})
