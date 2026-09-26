import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { attachFile, createBill, findBillByDocNumber, getCompanyInfo, getPreferences, listAccounts, listAttachments, listClasses, listCustomers, listDepartments, listItems, listTaxCodes, voidBill } from "@/lib/integrations/quickbooks/client"

const jsonReply = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } })

describe("ledger capability reads", () => {
  const originalFetch = global.fetch
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn()) })
  afterEach(() => { global.fetch = originalFetch })

  it("getCompanyInfo returns the CompanyInfo row for the realm", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonReply({ CompanyInfo: { NameValue: [{ Name: "OfferingSku", Value: "QuickBooks Online Plus" }] } }))
    await expect(getCompanyInfo("realm1", "token1")).resolves.toEqual({ NameValue: [{ Name: "OfferingSku", Value: "QuickBooks Online Plus" }] })
    expect(decodeURIComponent(vi.mocked(fetch).mock.calls[0][0] as string)).toContain("/companyinfo/realm1")
  })

  it("getPreferences returns the Preferences row, empty when the provider sends none", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonReply({ Preferences: { TaxPrefs: { UsingSalesTax: true } } }))
    await expect(getPreferences("realm1", "token1")).resolves.toEqual({ TaxPrefs: { UsingSalesTax: true } })
    vi.mocked(fetch).mockResolvedValueOnce(jsonReply({}))
    await expect(getPreferences("realm1", "token1")).resolves.toEqual({})
  })
})

const jsonResponse = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } })

describe("listAccounts pagination", () => {
  const originalFetch = global.fetch

  beforeEach(() => { vi.stubGlobal("fetch", vi.fn()) })
  afterEach(() => { global.fetch = originalFetch })

  it("stops after a page shorter than the page size", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ QueryResponse: { Account: [{ Id: "1", Name: "A", Active: true }] } }))
    const accounts = await listAccounts("realm1", "token1")
    expect(accounts).toEqual([{ id: "1", name: "A", active: true, taxCodeId: null }])
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it("pages through startposition until a short page ends it", async () => {
    const fullPage = Array.from({ length: 200 }, (_, i) => ({ Id: String(i), Name: `Account ${i}`, Active: true }))
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ QueryResponse: { Account: fullPage } }))
      .mockResolvedValueOnce(jsonResponse({ QueryResponse: { Account: [{ Id: "200", Name: "Last", Active: true }] } }))

    const accounts = await listAccounts("realm1", "token1")

    expect(accounts).toHaveLength(201)
    expect(fetch).toHaveBeenCalledTimes(2)
    const secondCallUrl = vi.mocked(fetch).mock.calls[1][0] as string
    expect(decodeURIComponent(secondCallUrl)).toContain("startposition 201")
  })
})

describe("findBillByDocNumber", () => {
  const originalFetch = global.fetch
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn()) })
  afterEach(() => { global.fetch = originalFetch })

  it("returns true when a bill with that DocNumber exists", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ QueryResponse: { Bill: [{ Id: "1" }] } }))
    expect(await findBillByDocNumber("realm1", "token1", "INV-1")).toBe(true)
  })

  it("returns false when nothing matches", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ QueryResponse: {} }))
    expect(await findBillByDocNumber("realm1", "token1", "INV-1")).toBe(false)
  })

  it("escapes single quotes in the doc number before building the query", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ QueryResponse: {} }))
    await findBillByDocNumber("realm1", "token1", "INV-O'Brien")
    const url = vi.mocked(fetch).mock.calls[0][0] as string
    expect(decodeURIComponent(url)).toContain("DocNumber = 'INV-O\\'Brien'")
  })
})

describe("voidBill", () => {
  const originalFetch = global.fetch
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn()) })
  afterEach(() => { global.fetch = originalFetch })

  it("reads the bill's current SyncToken, then POSTs the void operation with it", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ QueryResponse: { Bill: [{ Id: "42", SyncToken: "3" }] } }))
      .mockResolvedValueOnce(jsonResponse({ Bill: { Id: "42" } }))

    await voidBill("realm1", "token1", "42")

    expect(fetch).toHaveBeenCalledTimes(2)
    const [voidUrl, voidInit] = vi.mocked(fetch).mock.calls[1]
    expect(voidUrl).toContain("/bill?operation=void")
    expect(JSON.parse((voidInit as RequestInit).body as string)).toEqual({ Id: "42", SyncToken: "3" })
  })

  it("throws when the bill isn't found", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ QueryResponse: {} }))
    await expect(voidBill("realm1", "token1", "42")).rejects.toThrow()
  })

  it("throws on a non-2xx void response, same as createBill", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ QueryResponse: { Bill: [{ Id: "42", SyncToken: "3" }] } }))
      .mockResolvedValueOnce(new Response("", { status: 500 }))
    await expect(voidBill("realm1", "token1", "42")).rejects.toThrow()
  })

  it("reads QuickBooks' 5030 Fault off the proxy's error body", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ Fault: { Error: [{ code: "5030" }] } }), { status: 400 }))
    await expect(createBill("realm1", "conn1", {}, null)).rejects.toMatchObject({ code: "quickbooks_feature_not_supported" })
  })
})

describe("createBill read-back", () => {
  const originalFetch = global.fetch
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn()) })
  afterEach(() => { global.fetch = originalFetch })

  it("returns the VAT and total QuickBooks computed", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ Bill: { Id: "42", TotalAmt: 120, TxnTaxDetail: { TotalTax: 20 } } }))
    await expect(createBill("realm1", "conn1", {}, "r1")).resolves.toEqual({ id: "42", totalTax: 20, total: 120, warnings: [] })
  })

  it("reads missing totals as null", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ Bill: { Id: "42" } }))
    await expect(createBill("realm1", "conn1", {}, null)).resolves.toEqual({ id: "42", totalTax: null, total: null, warnings: [] })
  })
})

describe("listAttachments", () => {
  const originalFetch = global.fetch
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn()) })
  afterEach(() => { global.fetch = originalFetch })

  it("maps Attachable rows to attachmentId/fileName and queries by AttachableRef.EntityRef.value", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ QueryResponse: { Attachable: [{ Id: "a1", FileName: "invoice.pdf" }] } }))
    await expect(listAttachments("realm1", "token1", "42")).resolves.toEqual([{ attachmentId: "a1", fileName: "invoice.pdf" }])
    const url = decodeURIComponent(vi.mocked(fetch).mock.calls[0][0] as string)
    expect(url).toContain("AttachableRef.EntityRef.value = '42'")
  })

  it("returns an empty array when the bill has no attachments", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ QueryResponse: {} }))
    await expect(listAttachments("realm1", "token1", "42")).resolves.toEqual([])
  })
})

describe("attachFile", () => {
  const originalFetch = global.fetch
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn()) })
  afterEach(() => { global.fetch = originalFetch })

  it("POSTs a multipart body with the file metadata linking to the Bill and the file bytes, and returns the attachment id", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ AttachableResponse: [{ Attachable: { Id: "a1", FileName: "invoice.pdf" } }] }))
    const result = await attachFile("realm1", "conn1", "42", { buffer: Buffer.from("file-bytes"), contentType: "application/pdf", fileName: "invoice.pdf" })
    expect(result).toEqual({ attachmentId: "a1", fileName: "invoice.pdf" })

    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toContain("/upload")
    const headers = (init as RequestInit).headers as Record<string, string>
    expect(headers["content-type"]).toMatch(/^multipart\/form-data; boundary=/)
    const bodyText = Buffer.from((init as RequestInit).body as Uint8Array).toString("utf8")
    expect(bodyText).toContain('"EntityRef":{"type":"Bill","value":"42"}')
    expect(bodyText).toContain("file-bytes")
    expect(bodyText).toContain('filename="invoice.pdf"')
  })

  it("throws on a non-2xx upload response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("", { status: 500 }))
    await expect(attachFile("realm1", "conn1", "42", { buffer: Buffer.from("x"), contentType: "application/pdf", fileName: "x.pdf" })).rejects.toThrow()
  })
})

describe("reference reads for line coding", () => {
  const originalFetch = global.fetch
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn()) })
  afterEach(() => { global.fetch = originalFetch })
  const queryOf = (call: number) => decodeURIComponent(vi.mocked(fetch).mock.calls[call][0] as string)

  it("listAccounts carries each account's default Tax code", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonReply({ QueryResponse: { Account: [{ Id: "7", Name: "Fuel", Active: true, AccountType: "Expense", TaxCodeRef: { value: "3" } }] } }))
    await expect(listAccounts("realm1", "token1")).resolves.toEqual([{ id: "7", name: "Fuel", active: true, accountType: "Expense", taxCodeId: "3" }])
    expect(queryOf(0)).toContain("TaxCodeRef")
  })

  it("listTaxCodes marks purchase codes and sums their purchase rates' percent", async () => {
    vi.mocked(fetch).mockImplementation(async (url) => {
      const q = decodeURIComponent(url as string)
      if (q.includes("from TaxRate")) return jsonReply({ QueryResponse: { TaxRate: [{ Id: "r1", RateValue: 15 }, { Id: "r2", RateValue: 0 }] } })
      return jsonReply({ QueryResponse: { TaxCode: [
        { Id: "3", Name: "Standard", Active: true, PurchaseTaxRateList: { TaxRateDetail: [{ TaxRateRef: { value: "r1" } }] } },
        { Id: "4", Name: "Zero", Active: true, PurchaseTaxRateList: { TaxRateDetail: [{ TaxRateRef: { value: "r2" } }] } },
        { Id: "5", Name: "Sales only", Active: true, PurchaseTaxRateList: { TaxRateDetail: [] } },
      ] } })
    })
    await expect(listTaxCodes("realm1", "token1")).resolves.toEqual([
      { id: "3", name: "Standard", active: true, forPurchases: true, percent: 15 },
      { id: "4", name: "Zero", active: true, forPurchases: true, percent: 0 },
      { id: "5", name: "Sales only", active: true, forPurchases: false, percent: null },
    ])
  })

  it("listClasses, listDepartments and listCustomers page through their entity", async () => {
    const fullPage = Array.from({ length: 200 }, (_, i) => ({ Id: String(i), Name: `C${i}`, FullyQualifiedName: `C${i}`, DisplayName: `C${i}`, Active: true }))
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonReply({ QueryResponse: { Customer: fullPage } }))
      .mockResolvedValueOnce(jsonReply({ QueryResponse: { Customer: [{ Id: "200", DisplayName: "Last", Active: true }] } }))
    const customers = await listCustomers("realm1", "token1")
    expect(customers).toHaveLength(201)
    expect(customers[200]).toEqual({ id: "200", name: "Last", active: true })
    expect(queryOf(1)).toContain("startposition 201")

    vi.mocked(fetch).mockReset()
    vi.mocked(fetch).mockResolvedValueOnce(jsonReply({ QueryResponse: { Class: [{ Id: "c1", FullyQualifiedName: "Retail:North", Active: true }] } }))
    await expect(listClasses("realm1", "token1")).resolves.toEqual([{ id: "c1", name: "Retail:North", active: true }])
    expect(queryOf(0)).toContain("from Class")

    vi.mocked(fetch).mockReset()
    vi.mocked(fetch).mockResolvedValueOnce(jsonReply({ QueryResponse: { Department: [{ Id: "d1", FullyQualifiedName: "Cape Town", Active: true }] } }))
    await expect(listDepartments("realm1", "token1")).resolves.toEqual([{ id: "d1", name: "Cape Town", active: true }])
    expect(queryOf(0)).toContain("from Department")
  })

  it("listItems drops a service item with no purchase account and maps the tracked-inventory flag", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonReply({ QueryResponse: { Item: [
      { Id: "1", Sku: "SKU1", Name: "Widget", Type: "Inventory", Active: true, AssetAccountRef: { value: "a1" }, PurchaseTaxCodeRef: { value: "t1" } },
      { Id: "2", Name: "Consulting", Type: "Service", Active: true, ExpenseAccountRef: { value: "a2" } },
      { Id: "3", Name: "Sales only", Type: "Service", Active: true },
    ] } }))
    await expect(listItems("realm1", "token1")).resolves.toEqual([
      { id: "1", code: "SKU1", name: "Widget", itemType: "Inventory", trackedInventory: true, active: true, accountExternalId: "a1", taxCodeExternalId: "t1" },
      { id: "2", code: null, name: "Consulting", itemType: "Service", trackedInventory: false, active: true, accountExternalId: "a2", taxCodeExternalId: null },
    ])
    expect(queryOf(0)).toContain("from Item")
  })
})
