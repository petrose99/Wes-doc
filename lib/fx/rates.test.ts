import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/config", () => ({
  default: {
    fx: {
      frankfurterBase: "https://api.frankfurter.app",
      fastratesKey: "",
      fastratesUrlTemplate: "",
      timeoutMs: 8000,
    },
  },
}))

const findUnique = vi.fn()
const upsert = vi.fn().mockResolvedValue(undefined)
vi.mock("@/lib/db", () => ({ prisma: { fxRate: { findUnique: (arg: unknown) => findUnique(arg), upsert: (arg: unknown) => upsert(arg) } } }))

vi.mock("@/prisma/client", () => ({
  Prisma: class {
    static Decimal = class {
      value: number
      constructor(v: number) { this.value = v }
    }
  },
}))

const { getHistoricalRate } = await import("./rates")

const fetchMock = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  findUnique.mockResolvedValue(null)
  fetchMock.mockReset()
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const jsonResponse = (payload: unknown, ok = true) => ({ ok, json: async () => payload })

describe("getHistoricalRate", () => {
  it("short-circuits same-currency pairs to rate 1 without touching the network", async () => {
    const hit = await getHistoricalRate("USD", "USD", "2024-03-15")
    expect(hit).toEqual({ base: "USD", quote: "USD", effectiveDate: "2024-03-15", rate: 1, source: "identity" })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(findUnique).not.toHaveBeenCalled()
  })

  it("rejects malformed currency codes rather than passing them to the API", async () => {
    // normalizeCode uppercases first, then enforces the ISO 4217 shape ^[A-Z]{3}$: a two-letter
    // input like "us" is still rejected because it's not the right length.
    expect(await getHistoricalRate("us", "USD", "2024-03-15")).toBeNull()
    expect(await getHistoricalRate("EURO", "USD", "2024-03-15")).toBeNull()
    expect(await getHistoricalRate("EUR", "USD", "not-a-date")).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("returns the cached rate without hitting Frankfurter when it already exists", async () => {
    findUnique.mockResolvedValue({ base: "EUR", quote: "USD", effectiveDate: new Date("2024-03-15"), rate: "1.0891", source: "frankfurter" })
    const hit = await getHistoricalRate("EUR", "USD", "2024-03-15")
    expect(hit).toEqual({ base: "EUR", quote: "USD", effectiveDate: "2024-03-15", rate: 1.0891, source: "frankfurter" })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("fetches from Frankfurter on a cache miss and caches the result under the response's own date", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ base: "EUR", date: "2024-03-15", rates: { USD: 1.0891 } }))
    const hit = await getHistoricalRate("EUR", "USD", "2024-03-15")
    expect(hit).toEqual({ base: "EUR", quote: "USD", effectiveDate: "2024-03-15", rate: 1.0891, source: "frankfurter" })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toContain("/2024-03-15?from=EUR&to=USD")
    // A weekend request snapping to Friday would insert TWO rows, one for each date. This isn't
    // a weekend so only the one date is cached.
    expect(upsert).toHaveBeenCalledTimes(1)
  })

  it("caches BOTH the requested date and the response date when Frankfurter snapped to a business day", async () => {
    // Requested Saturday, Frankfurter returned Friday's rate — cache both so a re-query for Sat.
    // finds it too.
    fetchMock.mockResolvedValue(jsonResponse({ base: "EUR", date: "2024-03-15", rates: { USD: 1.0891 } }))
    await getHistoricalRate("EUR", "USD", "2024-03-16")
    expect(upsert).toHaveBeenCalledTimes(2)
    const dates = upsert.mock.calls.map((call) => (call[0] as { create: { effectiveDate: Date } }).create.effectiveDate.toISOString().slice(0, 10))
    expect(new Set(dates)).toEqual(new Set(["2024-03-15", "2024-03-16"]))
  })

  it("triangulates a non-EUR ↔ non-EUR pair through EUR when the direct pair is unavailable", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}, false))                                              // direct ZAR/JPY fails
      .mockResolvedValueOnce(jsonResponse({ base: "ZAR", date: "2024-03-15", rates: { EUR: 0.05 } }))  // ZAR → EUR
      .mockResolvedValueOnce(jsonResponse({ base: "EUR", date: "2024-03-15", rates: { JPY: 160 } }))   // EUR → JPY
    const hit = await getHistoricalRate("ZAR", "JPY", "2024-03-15")
    expect(hit).toEqual({ base: "ZAR", quote: "JPY", effectiveDate: "2024-03-15", rate: 8, source: "frankfurter+triangulated" })
    // Three cache writes: the triangulated pair + both legs. So a same-day EUR→JPY or ZAR→EUR
    // will now hit the cache.
    expect(upsert).toHaveBeenCalledTimes(3)
  })

  it("returns null when Frankfurter fails and there is no triangulation possible (either side is EUR)", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, false))
    expect(await getHistoricalRate("EUR", "USD", "2024-03-15")).toBeNull()
    expect(upsert).not.toHaveBeenCalled()
  })

  it("never throws when the network throws — returns null so the caller can defer conversion", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNRESET"))
    expect(await getHistoricalRate("EUR", "USD", "2024-03-15")).toBeNull()
  })

  it("substitutes LSL with ZAR under the Common Monetary Area peg (Lesotho Loti tracks the Rand 1:1)", async () => {
    // Frankfurter has never published an LSL rate — an LSL/USD query has to be answered via ZAR.
    fetchMock.mockResolvedValue(jsonResponse({ base: "ZAR", date: "2024-03-15", rates: { USD: 0.055 } }))
    const hit = await getHistoricalRate("LSL", "USD", "2024-03-15")
    expect(hit).toEqual({ base: "LSL", quote: "USD", effectiveDate: "2024-03-15", rate: 0.055, source: "frankfurter+pegged_via_ZAR" })
    // The wire call used ZAR, not LSL — that's the whole point.
    expect(fetchMock.mock.calls[0][0]).toContain("from=ZAR&to=USD")
  })

  it("returns 1.0 for LSL → ZAR (both sides peg to the same anchor) without any fetch", async () => {
    const hit = await getHistoricalRate("LSL", "ZAR", "2024-03-15")
    expect(hit).toEqual({ base: "LSL", quote: "ZAR", effectiveDate: "2024-03-15", rate: 1, source: "pegged_via_ZAR" })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("returns 1.0 for LSL → NAD (both peg to ZAR)", async () => {
    const hit = await getHistoricalRate("LSL", "NAD", "2024-03-15")
    expect(hit?.rate).toBe(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("prefers fastratesapi over Frankfurter for today's rate when the template is configured", async () => {
    const config = (await import("@/lib/config")).default as { fx: { fastratesKey: string; fastratesUrlTemplate: string } }
    config.fx.fastratesKey = "test_key"
    config.fx.fastratesUrlTemplate = "https://api.fastratesapi.com/v1/latest?from={from}&to={to}&api_key={key}"

    fetchMock.mockResolvedValueOnce(jsonResponse({ rate: 1.09 }))
    const today = new Date().toISOString().slice(0, 10)
    const hit = await getHistoricalRate("EUR", "USD", today)
    expect(hit).toMatchObject({ rate: 1.09, source: "fastratesapi" })
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.fastratesapi.com/v1/latest?from=EUR&to=USD&api_key=test_key")

    config.fx.fastratesKey = ""
    config.fx.fastratesUrlTemplate = ""
  })
})
