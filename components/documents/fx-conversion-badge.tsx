import { AlertTriangle, ArrowRight } from "lucide-react"

/** Compact panel shown on any foreign-currency document — inline in the review pane and, in
 * summary form, in the doc-library table. Always renders SOMETHING when the document's currency
 * differs from the workspace's base, so a reviewer never sees a naked foreign-currency total with
 * no indication that the pipeline uses a converted number elsewhere.
 *
 * Three states:
 *   1. Converted (fxRate + baseCurrencyTotal both present) — shows both totals side by side
 *      plus the rate, the date the rate applies to, and which provider supplied it.
 *   2. Pending (rate is null on a foreign-currency doc) — an amber "waiting on rate" chip,
 *      with the reason the fetch might have failed. Analytics and ledger push both fall back
 *      to the original amount / refuse the push until this resolves.
 *   3. Same currency (docCurrency === baseCurrency, or docCurrency null) — renders nothing;
 *      there is no conversion to show. */
export function FxConversionBadge({ docCurrency, docTotal, baseCurrency, baseCurrencyTotal, fxRate, fxRateAt, fxRateSource, compact = false }: {
  docCurrency: string | null
  docTotal: number | null
  baseCurrency: string
  baseCurrencyTotal: number | null
  fxRate: number | null
  fxRateAt: string | null
  fxRateSource: string | null
  compact?: boolean
}) {
  if (!docCurrency || docCurrency === baseCurrency) return null

  const formatMoney = (amount: number, currency: string) => {
    try { return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount) }
    catch { return `${amount.toFixed(2)} ${currency}` }
  }

  const pending = baseCurrencyTotal === null || fxRate === null

  if (compact) {
    if (pending) return <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800"><AlertTriangle className="h-3 w-3" />FX pending</span>
    return <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">≈ {formatMoney(baseCurrencyTotal!, baseCurrency)}</span>
  }

  if (pending) {
    return <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
      <div className="flex items-center gap-1.5 font-semibold"><AlertTriangle className="h-3.5 w-3.5" />Conversion pending</div>
      <p className="mt-1">This document is in {docCurrency}, but the exchange rate hasn&apos;t been fetched yet. Analytics fall back to the extracted amount and a ledger push is blocked until this resolves.</p>
    </div>
  }

  return <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
    <div className="flex items-center gap-2 text-[13px] font-semibold text-slate-900">
      {docTotal !== null ? formatMoney(docTotal, docCurrency) : `${docCurrency}`}
      <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
      {formatMoney(baseCurrencyTotal!, baseCurrency)}
    </div>
    <p className="mt-1 text-slate-500">
      Converted at {fxRate!.toFixed(4)} {docCurrency}/{baseCurrency}
      {fxRateAt ? ` on ${fxRateAt}` : ""}
      {fxRateSource ? ` · ${fxRateSource.replace("+triangulated", " (via EUR)")}` : ""}.
      Pipeline totals and any ledger push use the converted amount; the document library shows both.
    </p>
  </div>
}
