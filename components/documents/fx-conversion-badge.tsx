import { InlineAdjustmentCard, InlineAdjustmentChip } from "@/components/documents/inline-adjustment"

/** Compact panel shown on any foreign-currency document — inline in the review pane and, in
 * summary form, in the doc-library table. Always renders SOMETHING when the document's currency
 * differs from the workspace's base, so a reviewer never sees a naked foreign-currency total with
 * no indication that the pipeline uses a converted number elsewhere.
 *
 * Three states:
 *   1. Converted (fxRate + baseCurrencyTotal both present) — the corrected (base-currency) total,
 *      with the original foreign-currency total struck through beneath it, plus the rate, the
 *      date the rate applies to, and which provider supplied it.
 *   2. Pending (rate is null on a foreign-currency doc) — an amber "waiting on rate" chip,
 *      with the reason the fetch might have failed. Analytics and ledger push both fall back
 *      to the original amount / refuse the push until this resolves.
 *   3. Same currency (docCurrency === baseCurrency, or docCurrency null) — renders nothing;
 *      there is no conversion to show.
 *
 * #208 moved the rendering onto the shared `InlineAdjustmentChip`/`InlineAdjustmentCard` (the
 * struck-through-original-beneath-corrected-value pattern) — this component's own props and the
 * three states above are unchanged; only the internals changed. */
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
    if (pending) return <InlineAdjustmentChip state="pending" pendingLabel="FX pending" />
    return <InlineAdjustmentChip
      state="adjusted"
      correctedValue={formatMoney(baseCurrencyTotal!, baseCurrency)}
      originalValue={docTotal !== null ? formatMoney(docTotal, docCurrency) : docCurrency}
    />
  }

  if (pending) {
    return <InlineAdjustmentCard
      state="pending"
      pendingTitle="Conversion pending"
      pendingDetail={<>This document is in {docCurrency}, but the exchange rate hasn&apos;t been fetched yet. Analytics fall back to the extracted amount and a ledger push is blocked until this resolves.</>}
    />
  }

  return <InlineAdjustmentCard
    state="adjusted"
    title="Converted total"
    correctedValue={formatMoney(baseCurrencyTotal!, baseCurrency)}
    originalValue={docTotal !== null ? formatMoney(docTotal, docCurrency) : docCurrency}
    detail={<>
      Converted at {fxRate!.toFixed(4)} {docCurrency}/{baseCurrency}
      {fxRateAt ? ` on ${fxRateAt}` : ""}
      {fxRateSource ? ` · ${fxRateSource.replace("+triangulated", " (via EUR)").replace("+pegged_via_ZAR", " (via ZAR peg)").replace("+pegged_via_", " (via ")}` : ""}.
      Pipeline totals and any ledger push use the converted amount; the document library shows both.
    </>}
  />
}
