import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { checkQuickBooksBillCorrectable, getBookCloseDate, updateBillAccounts } from "@/lib/integrations/quickbooks/client"

const jsonResponse = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } })

describe("getBookCloseDate", () => {
  const originalFetch = global.fetch
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn()) })
  afterEach(() => { global.fetch = originalFetch })

  it("returns the close date when the company has set one", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ Preferences: { AccountingInfoPrefs: { BookCloseDate: "2026-06-30" } } }))
    expect(await getBookCloseDate("realm1", "token1")).toBe("2026-06-30")
  })

  it("returns null when no close date is set", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ Preferences: {} }))
    expect(await getBookCloseDate("realm1", "token1")).toBeNull()
  })
})

describe("checkQuickBooksBillCorrectable", () => {
  const originalFetch = global.fetch
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn()) })
  afterEach(() => { global.fetch = originalFetch })

  const billRow = (overrides: Partial<{ Balance: number; TotalAmt: number }> = {}) => ({
    QueryResponse: { Bill: [{ Id: "1", SyncToken: "0", Balance: 100, TotalAmt: 100, Line: [], ...overrides }] },
  })

  it("offers a bill with no close date and an outstanding balance", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ Preferences: {} }))
      .mockResolvedValueOnce(jsonResponse(billRow()))
    expect(await checkQuickBooksBillCorrectable("realm1", "token1", "1", "2026-09-01")).toEqual({ offered: true })
  })

  it("refuses a bill dated on/before the books-closed date", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ Preferences: { AccountingInfoPrefs: { BookCloseDate: "2026-06-30" } } }))
      .mockResolvedValueOnce(jsonResponse(billRow()))
    expect(await checkQuickBooksBillCorrectable("realm1", "token1", "1", "2026-06-01")).toEqual({ offered: false, reason: "book_closed" })
  })

  it("refuses a paid bill (zero balance) by default, conservatively", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ Preferences: {} }))
      .mockResolvedValueOnce(jsonResponse(billRow({ Balance: 0 })))
    expect(await checkQuickBooksBillCorrectable("realm1", "token1", "1", "2026-09-01")).toEqual({ offered: false, reason: "paid" })
  })
})

describe("updateBillAccounts", () => {
  const originalFetch = global.fetch
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn()) })
  afterEach(() => { global.fetch = originalFetch })

  const readResponse = () => jsonResponse({
    QueryResponse: {
      Bill: [{
        Id: "1", SyncToken: "3", Balance: 100, TotalAmt: 100,
        Line: [{ AccountBasedExpenseLineDetail: { AccountRef: { value: "OLD" } } }],
      }],
    },
  })

  it("reads the bill fresh, resends every line with only the targeted account swapped", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(readResponse())
      .mockResolvedValueOnce(jsonResponse({ Bill: { Id: "1" } }))

    await updateBillAccounts("realm1", "token1", "1", new Map([[0, "NEW"]]))

    expect(fetch).toHaveBeenCalledTimes(2)
    const [, writeInit] = vi.mocked(fetch).mock.calls[1]
    const body = JSON.parse((writeInit as RequestInit).body as string)
    expect(body).toEqual({
      Id: "1", SyncToken: "3", sparse: false,
      Line: [{ AccountBasedExpenseLineDetail: { AccountRef: { value: "NEW" } } }],
    })
  })

  it("retries once, re-reading the bill, on a permanent (stale-shaped) write failure", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(readResponse())
      .mockResolvedValueOnce(new Response("", { status: 400 }))
      .mockResolvedValueOnce(readResponse())
      .mockResolvedValueOnce(jsonResponse({ Bill: { Id: "1" } }))

    await updateBillAccounts("realm1", "token1", "1", new Map([[0, "NEW"]]))

    expect(fetch).toHaveBeenCalledTimes(4)
  })

  it("does not retry an auth failure", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(readResponse())
      .mockResolvedValueOnce(new Response("", { status: 401 }))

    await expect(updateBillAccounts("realm1", "token1", "1", new Map([[0, "NEW"]]))).rejects.toThrow()
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
