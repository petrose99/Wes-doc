import { getHistoricalRate } from "@/lib/fx/rates"
import { prisma } from "@/lib/db"
import { Prisma } from "@/prisma/client"

/** Currency codes that publish only whole-unit prices — a converted JPY total of 1234.56 has to
 * round to 1235 or the receiving ledger throws. This mirrors the same list already used by the
 * bill mapper for line-item rounding (lib/integration-bill-mapping.ts). */
const ZERO_DECIMAL = new Set(["JPY", "KRW", "VND", "CLP", "ISK", "UGX", "XOF", "XAF"])

function minorUnits(currency: string): number {
  return ZERO_DECIMAL.has(currency.toUpperCase()) ? 0 : 2
}

function roundToMinor(amount: number, currency: string): number {
  const digits = minorUnits(currency)
  const factor = 10 ** digits
  return Math.round(amount * factor) / factor
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[, ]/g, ""))
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

/** The document's own currency (as extracted, e.g. "EUR") and the total in that currency, read
 * off reviewedData with rawExtraction as a fallback so a document that hasn't been through the
 * review pane yet still converts. Both are needed — a total without a currency, or vice versa,
 * is undecidable. */
export function extractDocumentTotalAndCurrency(document: { reviewedData: unknown; rawExtraction: unknown }): { total: number; currency: string } | null {
  const source = (document.reviewedData as Record<string, unknown> | null) ?? (document.rawExtraction as Record<string, unknown> | null) ?? null
  if (!source) return null
  const total = asNumber(source.total)
  const currency = asString(source.currency_code)?.toUpperCase() ?? null
  if (total === null || !currency) return null
  return { total, currency }
}

/** The date this document's rate should be for: the invoice's own issue date if extracted,
 * otherwise the received date. Never today (unless received=today) — the whole point of storing
 * fxRateAt is that a 2024 invoice processed in 2026 gets 2024's rate. */
export function fxRateDateFor(document: { reviewedData: unknown; rawExtraction: unknown; receivedAt: Date }): Date {
  const source = (document.reviewedData as Record<string, unknown> | null) ?? (document.rawExtraction as Record<string, unknown> | null) ?? null
  const raw = source?.issue_date ?? source?.invoice_date ?? source?.date
  if (typeof raw === "string" && /^\d{4}-\d{2}-\d{2}/.test(raw)) return new Date(raw.slice(0, 10))
  return document.receivedAt
}

export type FxApplyOutcome =
  | { status: "not_applicable"; reason: "no_total_or_currency" }
  | { status: "converted"; baseCurrencyTotal: number; fxRate: number; fxRateAt: Date; fxRateSource: string }
  | { status: "pending"; reason: "fetch_failed" }

/** Given a document that has been reviewed (or has raw extraction), apply the FX conversion into
 * the workspace's base currency and persist the four fx_* columns. Idempotent and safe to call
 * again after a value edit — if the total, currency, or date changed, the rate is refetched and
 * the row rewritten.
 *
 * The conversion never blocks review: a fetch failure leaves fxRate null so the document keeps
 * moving through the pipeline; a retry drain (or the next review edit) will re-attempt. */
export async function applyFxToDocument(documentId: string): Promise<FxApplyOutcome> {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: {
      id: true, workspaceId: true, reviewedData: true, rawExtraction: true, receivedAt: true,
      workspace: { select: { baseCurrency: true } },
    },
  })
  if (!document) return { status: "not_applicable", reason: "no_total_or_currency" }

  const parsed = extractDocumentTotalAndCurrency(document)
  if (!parsed) return { status: "not_applicable", reason: "no_total_or_currency" }

  const baseCurrency = document.workspace.baseCurrency.toUpperCase()
  const rateDate = fxRateDateFor(document)
  const hit = await getHistoricalRate(parsed.currency, baseCurrency, rateDate)

  if (!hit) {
    // Wipe any previously-stored conversion so a downstream reader sees "pending" rather than a
    // stale converted amount left over from an earlier successful conversion whose inputs have
    // since been edited.
    await prisma.document.update({
      where: { id: documentId },
      data: { baseCurrencyTotal: null, fxRate: null, fxRateAt: null, fxRateSource: null },
    })
    return { status: "pending", reason: "fetch_failed" }
  }

  const baseCurrencyTotal = roundToMinor(parsed.total * hit.rate, baseCurrency)
  await prisma.document.update({
    where: { id: documentId },
    data: {
      baseCurrencyTotal: new Prisma.Decimal(baseCurrencyTotal),
      fxRate: new Prisma.Decimal(hit.rate),
      fxRateAt: new Date(hit.effectiveDate),
      fxRateSource: hit.source,
    },
  })
  return { status: "converted", baseCurrencyTotal, fxRate: hit.rate, fxRateAt: new Date(hit.effectiveDate), fxRateSource: hit.source }
}
