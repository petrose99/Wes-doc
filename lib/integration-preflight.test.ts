import { describe, expect, it } from "vitest"
import { preflightPush, type PreflightEntity } from "@/lib/integration-preflight"

const account = (overrides: Partial<PreflightEntity> = {}): PreflightEntity => ({
  entityType: "account", externalId: "42", code: "6000", name: "Office Expenses", active: true, ...overrides,
})
const vendor = (overrides: Partial<PreflightEntity> = {}): PreflightEntity => ({
  entityType: "vendor", externalId: "v1", code: null, name: "Acme Ltd", active: true, ...overrides,
})

describe("preflightPush", () => {
  it("passes with an empty cache (sync never ran) — nothing to validate against", () => {
    expect(preflightPush({ expenseAccountId: "42", vendorName: "Acme Ltd", entities: [] })).toEqual({ ok: true })
  })

  it("passes when the account matches by externalId or by code", () => {
    expect(preflightPush({ expenseAccountId: "42", vendorName: null, entities: [account()] }).ok).toBe(true)
    expect(preflightPush({ expenseAccountId: "6000", vendorName: null, entities: [account()] }).ok).toBe(true)
  })

  it("fails closed when the configured account is not in a non-empty account cache", () => {
    const result = preflightPush({ expenseAccountId: "99", vendorName: null, entities: [account()] })
    expect(result).toMatchObject({ ok: false, errorCode: "preflight_account_missing" })
  })

  it("fails closed when the configured account is archived", () => {
    const result = preflightPush({ expenseAccountId: "42", vendorName: null, entities: [account({ active: false })] })
    expect(result).toMatchObject({ ok: false, errorCode: "preflight_account_inactive" })
  })

  it("fails closed when every cached vendor row for the name is inactive", () => {
    const result = preflightPush({ expenseAccountId: "42", vendorName: "acme ltd", entities: [account(), vendor({ active: false })] })
    expect(result).toMatchObject({ ok: false, errorCode: "preflight_vendor_inactive" })
  })

  it("passes when an active vendor row exists alongside an inactive duplicate", () => {
    const entities = [account(), vendor({ active: false }), vendor({ externalId: "v2" })]
    expect(preflightPush({ expenseAccountId: "42", vendorName: "Acme Ltd", entities }).ok).toBe(true)
  })

  it("passes for a vendor with no cached row at all (push-time find-or-create handles it)", () => {
    expect(preflightPush({ expenseAccountId: "42", vendorName: "Brand New Vendor", entities: [account(), vendor()] }).ok).toBe(true)
  })
})
