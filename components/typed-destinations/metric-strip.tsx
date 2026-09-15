import { Minus, TrendingDown, TrendingUp } from "lucide-react"

export type MetricStripTrend = { direction: "up" | "down" | "flat"; deltaLabel: string }

/** #205: the one-metric header strip shared by every typed surface — Invoices' Touchless rate,
 * Purchase Orders' and Receipts' auto-match rate, Bank Statements' (currently unavailable)
 * reconciliation-match rate. Deliberately one text line, not the hero-metric card template
 * (big number, small label, accent): #187's density budget treats vertical space as a resource
 * this strip has to earn, so it reads as a fact inline with the surface's other status text
 * rather than a headline. Placed above the toolbar/filter row, never inside it. */
export function MetricStrip({ label, value, sampleLabel, trend, unavailableReason, variant = "shell" }: {
  label: string
  /** Formatted percentage or count, e.g. "68%". Ignored when `unavailableReason` is set. */
  value: string
  /** e.g. "142 of 210, last 30 days" — the denominator behind `value`, so the number reads as
   * evidence rather than an assertion. */
  sampleLabel: string
  trend?: MetricStripTrend | null
  /** When set, the strip explains why this surface has no number yet instead of rendering a
   * fabricated one — e.g. Bank Statements before a reconciliation matcher exists. */
  unavailableReason?: string | null
  /** "shell" (default): edge-to-edge, for ListScreenShell's `beforeToolbar` slot, matching the
   * toolbar/bulk-bar's own full-bleed border-b treatment. "inline": a self-contained bordered
   * strip for TypedDocumentListPage's padded content column, which has no full-bleed chrome to
   * match. */
  variant?: "shell" | "inline"
}) {
  const containerClass = variant === "shell"
    ? "border-b border-slate-200 bg-white px-6 py-2"
    : "rounded-md border border-slate-200 bg-slate-50/60 px-4 py-2"

  if (unavailableReason) {
    return (
      <div className={`flex items-center gap-2 text-xs text-slate-500 ${containerClass}`}>
        <span className="font-medium text-slate-600">{label}</span>
        <span aria-hidden>·</span>
        <span>{unavailableReason}</span>
      </div>
    )
  }

  const TrendIcon = trend?.direction === "up" ? TrendingUp : trend?.direction === "down" ? TrendingDown : Minus
  const trendClass = trend?.direction === "up" ? "text-emerald-700" : trend?.direction === "down" ? "text-amber-700" : "text-slate-500"

  return (
    <div className={`flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm ${containerClass}`}>
      <span className="font-medium text-slate-500">{label}</span>
      <span className="font-semibold tabular-nums text-slate-900">{value}</span>
      {trend && (
        <span className={`inline-flex items-center gap-0.5 text-xs font-medium tabular-nums ${trendClass}`}>
          <TrendIcon className="h-3.5 w-3.5" aria-hidden />
          {trend.deltaLabel}
        </span>
      )}
      <span className="text-xs text-slate-500">{sampleLabel}</span>
    </div>
  )
}

export function formatPercent(rate: number): string {
  return `${Math.round(rate * 100)}%`
}
