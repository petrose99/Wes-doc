import { beforeEach, describe, expect, it, vi } from "vitest"

const getHistoricalRate = vi.fn()
vi.mock("@/lib/fx/rates", () => ({ getHistoricalRate: (...args: unknown[]) => getHistoricalRate(...args) }))

const documentFindUnique = vi.fn()
const documentUpdate = vi.fn().mockResolvedValue(undefined)
vi.mock("@/lib/db", () => ({ prisma: { document: { findUnique: (arg: unknown) => documentFindUnique(arg), update: (arg: unknown) => documentUpdate(arg) } } }))

vi.mock("@/prisma/client", () => ({
  Prisma: class {
    static Decimal = class {
      value: number
      constructor(v: number | string) { this.value = typeof v === "number" ? v : Number(v) }
      toString() { return String(this.value) }
    }
  },
}))

const { applyFxToDocument, extractDocumentTotalAndCurrency, fxRateDateFor } = await import("./apply-to-document")

beforeEach(() => {
  vi.clearAllMocks()
})

describe("extractDocumentTotalAndCurrency", () => {
  it("reads total + currency_code off reviewedData first", () => {
    expect(extractDocumentTotalAndCurrency({ reviewedData: { total: 100, currency_code: "EUR" }, rawExtraction: null })).toEqual({ total: 100, currency: "EUR" })
  })

  it("falls back to rawExtraction when reviewedData isn't there yet (post-extraction, pre-review)", () => {
    expect(extractDocumentTotalAndCurrency({ reviewedData: null, rawExtraction: { total: "1,234.56", currency_code: "usd" } })).toEqual({ total: 1234.56, currency: "USD" })
  })

  it("returns null when either half is missing — a total without a currency is undecidable", () => {
    expect(extractDocumentTotalAndCurrency({ reviewedData: { total: 100 }, rawExtraction: null })).toBeNull()
    expect(extractDocumentTotalAndCurrency({ reviewedData: { currency_code: "EUR" }, rawExtraction: null })).toBeNull()
    expect(extractDocumentTotalAndCurrency({ reviewedData: null, rawExtraction: null })).toBeNull()
  })
})

describe("fxRateDateFor", () => {
  it("prefers the invoice's own issue date so a 2024 invoice books at 2024's rate no matter when processed", () => {
    const date = fxRateDateFor({ reviewedData: { issue_date: "2024-03-15" }, rawExtraction: null, receivedAt: new Date("2026-09-01") })
    expect(date.toISOString().slice(0, 10)).toBe("2024-03-15")
  })

  it("falls back to receivedAt when no invoice date was extracted", () => {
    const receivedAt = new Date("2026-09-01T12:00:00Z")
    const date = fxRateDateFor({ reviewedData: {}, rawExtraction: null, receivedAt })
    expect(date).toBe(receivedAt)
  })
})

describe("applyFxToDocument", () => {
  const document = {
    id: "doc-1",
    workspaceId: "w-1",
    reviewedData: { total: 100, currency_code: "EUR", issue_date: "2024-03-15" },
    rawExtraction: null,
    receivedAt: new Date("2026-09-01"),
    workspace: { baseCurrency: "USD" },
  }

  it("converts, rounds to the base currency's minor unit, and persists all four fx_* columns", async () => {
    documentFindUnique.mockResolvedValue(document)
    getHistoricalRate.mockResolvedValue({ base: "EUR", quote: "USD", effectiveDate: "2024-03-15", rate: 1.0891, source: "frankfurter" })

    const outcome = await applyFxToDocument("doc-1")
    expect(outcome).toMatchObject({ status: "converted", baseCurrencyTotal: 108.91, fxRate: 1.0891, fxRateSource: "frankfurter" })

    const call = documentUpdate.mock.calls[0][0] as { data: { baseCurrencyTotal: { value: number }; fxRate: { value: number }; fxRateSource: string } }
    expect(call.data.baseCurrencyTotal.value).toBeCloseTo(108.91, 2)
    expect(call.data.fxRate.value).toBe(1.0891)
    expect(call.data.fxRateSource).toBe("frankfurter")
  })

  it("re-converts after a Company currency change at the document's own rate date, not today's (#457)", async () => {
    const usd = { ...document, reviewedData: { total: 100, currency_code: "USD", issue_date: "2026-08-03" } }
    getHistoricalRate.mockResolvedValue({ base: "USD", quote: "ZAR", effectiveDate: "2026-08-03", rate: 18.2, source: "frankfurter+pegged_via_ZAR" })

    documentFindUnique.mockResolvedValue({ ...usd, workspace: { baseCurrency: "LSL" } })
    await applyFxToDocument("doc-1")
    documentFindUnique.mockResolvedValue({ ...usd, workspace: { baseCurrency: "ZAR" } })
    await applyFxToDocument("doc-1")

    expect(getHistoricalRate.mock.calls.map((c) => [c[1], (c[2] as Date).toISOString().slice(0, 10)])).toEqual([["LSL", "2026-08-03"], ["ZAR", "2026-08-03"]])
    const totals = documentUpdate.mock.calls.map((c) => (c[0] as { data: { baseCurrencyTotal: { value: number } } }).data.baseCurrencyTotal.value)
    expect(totals[0]).toBe(totals[1])
  })

  it("rounds JPY to whole units (zero-decimal currency)", async () => {
    documentFindUnique.mockResolvedValue({ ...document, workspace: { baseCurrency: "JPY" } })
    getHistoricalRate.mockResolvedValue({ base: "EUR", quote: "JPY", effectiveDate: "2024-03-15", rate: 162.34, source: "frankfurter" })

    const outcome = await applyFxToDocument("doc-1")
    expect(outcome).toMatchObject({ status: "converted", baseCurrencyTotal: 16234 })
  })

  it("marks conversion pending and wipes stale fx columns when the fetch fails", async () => {
    documentFindUnique.mockResolvedValue(document)
    getHistoricalRate.mockResolvedValue(null)

    const outcome = await applyFxToDocument("doc-1")
    expect(outcome).toEqual({ status: "pending", reason: "fetch_failed" })
    expect(documentUpdate).toHaveBeenCalledWith({
      where: { id: "doc-1" },
      data: { baseCurrencyTotal: null, fxRate: null, fxRateAt: null, fxRateSource: null },
    })
  })

  it("still runs on a same-currency document — records rate=1 with source=identity so callers can distinguish 'converted' from 'pending'", async () => {
    documentFindUnique.mockResolvedValue({ ...document, reviewedData: { total: 100, currency_code: "USD", issue_date: "2024-03-15" } })
    getHistoricalRate.mockResolvedValue({ base: "USD", quote: "USD", effectiveDate: "2024-03-15", rate: 1, source: "identity" })

    const outcome = await applyFxToDocument("doc-1")
    expect(outcome).toMatchObject({ status: "converted", baseCurrencyTotal: 100, fxRate: 1, fxRateSource: "identity" })
  })

  it("is a no-op when the document has no extracted total or currency yet", async () => {
    documentFindUnique.mockResolvedValue({ ...document, reviewedData: null, rawExtraction: null })

    const outcome = await applyFxToDocument("doc-1")
    expect(outcome).toEqual({ status: "not_applicable", reason: "no_total_or_currency" })
    expect(getHistoricalRate).not.toHaveBeenCalled()
    expect(documentUpdate).not.toHaveBeenCalled()
  })
})
