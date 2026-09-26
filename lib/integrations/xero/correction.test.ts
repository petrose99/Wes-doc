import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { checkXeroBillCorrectable, getOrganisationLockDates, updateBillAccounts } from "@/lib/integrations/xero/client"

const jsonResponse = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } })

describe("getOrganisationLockDates", () => {
  const originalFetch = global.fetch
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn()) })
  afterEach(() => { global.fetch = originalFetch })

  it("returns both lock dates when set", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ Organisations: [{ PeriodLockDate: "2026-06-30", EndOfYearLockDate: "2025-12-31" }] }))
    expect(await getOrganisationLockDates("tenant1", "token1")).toEqual({ periodLockDate: "2026-06-30", endOfYearLockDate: "2025-12-31" })
  })

  it("returns nulls when neither is set", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ Organisations: [{}] }))
    expect(await getOrganisationLockDates("tenant1", "token1")).toEqual({ periodLockDate: null, endOfYearLockDate: null })
  })
})

describe("checkXeroBillCorrectable", () => {
  const originalFetch = global.fetch
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn()) })
  afterEach(() => { global.fetch = originalFetch })

  const invoiceResponse = (status = "AUTHORISED") => jsonResponse({ Invoices: [{ InvoiceID: "abc", Status: status, AmountPaid: 100, Total: 100, LineItems: [] }] })

  it("offers a paid, unlocked bill (AccountCode is editable-on-paid for Xero)", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ Organisations: [{}] }))
      .mockResolvedValueOnce(invoiceResponse())
    expect(await checkXeroBillCorrectable("tenant1", "token1", "abc", "2026-09-01")).toEqual({ offered: true })
  })

  it("refuses a bill dated on/before the later lock date", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ Organisations: [{ PeriodLockDate: "2026-06-30" }] }))
      .mockResolvedValueOnce(invoiceResponse())
    expect(await checkXeroBillCorrectable("tenant1", "token1", "abc", "2026-06-01")).toEqual({ offered: false, reason: "period_locked" })
  })

  it("refuses an already-voided invoice", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ Organisations: [{}] }))
      .mockResolvedValueOnce(invoiceResponse("VOIDED"))
    expect(await checkXeroBillCorrectable("tenant1", "token1", "abc", "2026-09-01")).toEqual({ offered: false, reason: "voided" })
  })
})

describe("updateBillAccounts", () => {
  const originalFetch = global.fetch
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn()) })
  afterEach(() => { global.fetch = originalFetch })

  const readResponse = () => jsonResponse({
    Invoices: [{ InvoiceID: "abc", Status: "AUTHORISED", AmountPaid: 0, Total: 100, LineItems: [{ Description: "Fuel", AccountCode: "OLD" }] }],
  })

  it("reads the invoice fresh, resends every line with only the targeted account swapped", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(readResponse())
      .mockResolvedValueOnce(jsonResponse({ Invoices: [{ InvoiceID: "abc" }] }))

    await updateBillAccounts("tenant1", "token1", "abc", new Map([[0, "NEW"]]))

    expect(fetch).toHaveBeenCalledTimes(2)
    const [, writeInit] = vi.mocked(fetch).mock.calls[1]
    const body = JSON.parse((writeInit as RequestInit).body as string)
    expect(body).toEqual({ LineItems: [{ Description: "Fuel", AccountCode: "NEW" }] })
  })

  it("resends each line's TaxType and Tracking untouched when only the account changes (ADR 0014)", async () => {
    const line = { Description: "Fuel", AccountCode: "OLD", TaxType: "INPUT2", Tracking: [{ Name: "Region", Option: "North" }] }
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ Invoices: [{ InvoiceID: "abc", Status: "AUTHORISED", AmountPaid: 0, Total: 100, LineItems: [line] }] }))
      .mockResolvedValueOnce(jsonResponse({ Invoices: [{ InvoiceID: "abc" }] }))

    await updateBillAccounts("tenant1", "token1", "abc", new Map([[0, "NEW"]]))

    const body = JSON.parse((vi.mocked(fetch).mock.calls[1][1] as RequestInit).body as string)
    expect(body).toEqual({ LineItems: [{ ...line, AccountCode: "NEW" }] })
  })

  it("#459: never touches an item line's ItemCode — only AccountCode is swapped", async () => {
    const itemLine = { Description: "Widget", ItemCode: "i1", AccountCode: "OLD", Quantity: 3, UnitAmount: 10 }
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ Invoices: [{ InvoiceID: "abc", Status: "AUTHORISED", AmountPaid: 0, Total: 100, LineItems: [itemLine] }] }))
      .mockResolvedValueOnce(jsonResponse({ Invoices: [{ InvoiceID: "abc" }] }))

    await updateBillAccounts("tenant1", "token1", "abc", new Map([[0, "NEW"]]))

    const body = JSON.parse((vi.mocked(fetch).mock.calls[1][1] as RequestInit).body as string)
    expect(body).toEqual({ LineItems: [{ ...itemLine, AccountCode: "NEW" }] })
    expect(body.LineItems[0].ItemCode).toBe("i1")
  })

  it("retries once, re-reading the invoice, on a permanent write failure", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(readResponse())
      .mockResolvedValueOnce(new Response("", { status: 400 }))
      .mockResolvedValueOnce(readResponse())
      .mockResolvedValueOnce(jsonResponse({ Invoices: [{ InvoiceID: "abc" }] }))

    await updateBillAccounts("tenant1", "token1", "abc", new Map([[0, "NEW"]]))

    expect(fetch).toHaveBeenCalledTimes(4)
  })

  it("does not retry an auth failure", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(readResponse())
      .mockResolvedValueOnce(new Response("", { status: 401 }))

    await expect(updateBillAccounts("tenant1", "token1", "abc", new Map([[0, "NEW"]]))).rejects.toThrow()
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
