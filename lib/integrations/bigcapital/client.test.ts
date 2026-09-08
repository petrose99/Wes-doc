import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fetchReportTable, signIn, voidBill } from "@/lib/integrations/bigcapital/client"

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

describe("voidBill", () => {
  const originalFetch = global.fetch
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn()) })
  afterEach(() => { global.fetch = originalFetch })

  it("DELETEs /api/bills/{id} with the api-key auth headers", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }))
    await voidBill("api-key-1", "org1", "42")

    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toContain("/api/bills/42")
    expect((init as RequestInit).method).toBe("DELETE")
    const headers = (init as RequestInit).headers as Record<string, string>
    expect(headers.authorization).toBe("Bearer api-key-1")
    expect(headers["organization-id"]).toBe("org1")
  })

  it("throws on a non-2xx response, same as createBill", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({}, 500))
    await expect(voidBill("api-key-1", "org1", "42")).rejects.toThrow()
  })

  it("throws an auth error on a 401", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({}, 401))
    await expect(voidBill("api-key-1", "org1", "42")).rejects.toThrow()
  })
})

describe("fetchReportTable", () => {
  const originalFetch = global.fetch
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn()) })
  afterEach(() => { global.fetch = originalFetch })

  const validTable = { columns: [{ key: "a", label: "A" }], rows: [{ cells: [{ key: "a", value: "1" }] }] }

  it("sends accept header, Bearer auth, and organization-id", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ table: validTable }))
    await fetchReportTable("key-1", "org-1", "/api/reports/trial-balance-sheet")

    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toContain("/api/reports/trial-balance-sheet")
    const headers = (init as RequestInit).headers as Record<string, string>
    expect(headers.accept).toBe("application/json+table")
    expect(headers.authorization).toBe("Bearer key-1")
    expect(headers["organization-id"]).toBe("org-1")
  })

  it("includes query params only when provided", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ table: validTable }))
    await fetchReportTable("k", "o", "/api/reports/profit-loss-sheet", { fromDate: "2025-01-01", toDate: "2025-12-31" })

    const url = vi.mocked(fetch).mock.calls[0][0] as string
    expect(url).toContain("fromDate=2025-01-01")
    expect(url).toContain("toDate=2025-12-31")
  })

  it("sends no query string when params are empty", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ table: validTable }))
    await fetchReportTable("k", "o", "/api/reports/balance-sheet")

    const url = vi.mocked(fetch).mock.calls[0][0] as string
    expect(url).not.toContain("?")
  })

  it("unwraps {table: ...} envelope", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ table: validTable }))
    const result = await fetchReportTable("k", "o", "/api/reports/trial-balance-sheet")
    expect(result.columns).toEqual(validTable.columns)
    expect(result.rows).toEqual(validTable.rows)
  })

  it("unwraps bare shape (columns/rows at top level)", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(validTable))
    const result = await fetchReportTable("k", "o", "/api/reports/trial-balance-sheet")
    expect(result.columns).toEqual(validTable.columns)
  })

  it("throws on bad response shape", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ unexpected: true }))
    await expect(fetchReportTable("k", "o", "/api/reports/trial-balance-sheet")).rejects.toThrow("columns/rows")
  })

  it("throws on 401", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({}, 401))
    await expect(fetchReportTable("k", "o", "/api/reports/trial-balance-sheet")).rejects.toThrow()
  })

  it("throws on 500", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({}, 500))
    await expect(fetchReportTable("k", "o", "/api/reports/trial-balance-sheet")).rejects.toThrow()
  })
})

describe("signIn", () => {
  const originalFetch = global.fetch
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn()) })
  afterEach(() => { global.fetch = originalFetch })

  it("returns the ids the SPA's own login writes as cookies", async () => {
    // Shape of a real POST /api/auth/signin body: camelCase in the controller, snake_case on the
    // wire. authenticated_user_id and tenant_id are stringified because the SPA stores them as
    // cookie text, and the server sends them as numbers.
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ access_token: "jwt-1", organization_id: "org-1", user_id: 7, tenant_id: 3 })
    )
    await expect(signIn("a@b.test", "pw")).resolves.toEqual({
      token: "jwt-1",
      organizationId: "org-1",
      userId: "7",
      tenantId: "3",
    })
  })

  it("nulls the optional ids when the instance omits them", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ access_token: "jwt-1", organization_id: "org-1" }))
    await expect(signIn("a@b.test", "pw")).resolves.toEqual({
      token: "jwt-1",
      organizationId: "org-1",
      userId: null,
      tenantId: null,
    })
  })

  it("sends no auth headers — the caller has no session yet", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ access_token: "jwt-1", organization_id: "org-1" }))
    await signIn("a@b.test", "pw")

    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toContain("/api/auth/signin")
    const headers = (init as RequestInit).headers as Record<string, string>
    expect(headers.authorization).toBeUndefined()
  })
})
