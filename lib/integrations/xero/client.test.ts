import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { findBillByInvoiceNumber, listAccounts, listTaxRates, listTrackingCategories, voidBill } from "@/lib/integrations/xero/client"

const jsonReply = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } })

describe("listTrackingCategories", () => {
  const originalFetch = global.fetch
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn()) })
  afterEach(() => { global.fetch = originalFetch })

  it("returns every category with its status and options, archived included, in Xero's order", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonReply({ TrackingCategories: [
      { TrackingCategoryID: "t1", Name: "Region", Status: "ACTIVE", Options: [{ TrackingOptionID: "o1", Name: "North", Status: "ACTIVE" }] },
      { TrackingCategoryID: "t2", Name: "Old", Status: "ARCHIVED" },
    ] }))
    await expect(listTrackingCategories("tenant1", "token1")).resolves.toEqual([
      { id: "t1", name: "Region", status: "ACTIVE", options: [{ id: "o1", name: "North", status: "ACTIVE" }] },
      { id: "t2", name: "Old", status: "ARCHIVED", options: [] },
    ])
    expect(decodeURIComponent(vi.mocked(fetch).mock.calls[0][0] as string)).toContain("/TrackingCategories?includeArchived=true")
  })
})

const jsonResponse = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } })

describe("findBillByInvoiceNumber", () => {
  const originalFetch = global.fetch
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn()) })
  afterEach(() => { global.fetch = originalFetch })

  it("returns true when the query finds an existing ACCPAY invoice", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ Invoices: [{ InvoiceID: "abc" }] }))
    expect(await findBillByInvoiceNumber("tenant1", "token1", "INV-1")).toBe(true)
  })

  it("returns false when nothing matches", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ Invoices: [] }))
    expect(await findBillByInvoiceNumber("tenant1", "token1", "INV-1")).toBe(false)
  })

  it("escapes double quotes in the invoice number before building the where clause", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ Invoices: [] }))
    await findBillByInvoiceNumber("tenant1", "token1", 'INV-"1"')
    const url = vi.mocked(fetch).mock.calls[0][0] as string
    expect(decodeURIComponent(url)).toContain('InvoiceNumber=="INV-\\"1\\""')
  })
})

describe("voidBill", () => {
  const originalFetch = global.fetch
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn()) })
  afterEach(() => { global.fetch = originalFetch })

  it("POSTs a Status: VOIDED body to /Invoices/{id}", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ Invoices: [{ InvoiceID: "abc", Status: "VOIDED" }] }))
    await voidBill("tenant1", "token1", "abc")
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toContain("/Invoices/abc")
    expect((init as RequestInit).method).toBe("POST")
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ Status: "VOIDED" })
  })

  it("throws on a non-2xx response, same as createBill", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("", { status: 500 }))
    await expect(voidBill("tenant1", "token1", "abc")).rejects.toThrow()
  })
})

describe("reference reads for line coding", () => {
  const originalFetch = global.fetch
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn()) })
  afterEach(() => { global.fetch = originalFetch })

  it("listTaxRates returns the TaxType, percent and whether the rate applies to expenses", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonReply({ TaxRates: [
      { Name: "15% GST on Expenses", TaxType: "INPUT2", Status: "ACTIVE", EffectiveRate: 15, CanApplyToExpenses: true },
      { Name: "Sales Tax", TaxType: "OUTPUT", Status: "DELETED", EffectiveRate: 10, CanApplyToExpenses: false },
    ] }))
    await expect(listTaxRates("tenant1", "token1")).resolves.toEqual([
      { taxType: "INPUT2", name: "15% GST on Expenses", percent: 15, canApplyToExpenses: true, active: true },
      { taxType: "OUTPUT", name: "Sales Tax", percent: 10, canApplyToExpenses: false, active: false },
    ])
  })

  it("listAccounts carries each account's default TaxType", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonReply({ Accounts: [{ Code: "400", Name: "Fuel", Status: "ACTIVE", Class: "EXPENSE", TaxType: "INPUT2" }, { Code: "401", Name: "Rent", Status: "ACTIVE", Class: "EXPENSE" }] }))
    await expect(listAccounts("tenant1", "token1")).resolves.toEqual([
      { code: "400", name: "Fuel", active: true, accountClass: "EXPENSE", taxType: "INPUT2" },
      { code: "401", name: "Rent", active: true, accountClass: "EXPENSE", taxType: null },
    ])
  })
})
