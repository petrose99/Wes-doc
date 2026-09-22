import { Minus, TrendingDown, TrendingUp } from "lucide-react"

/** The one inline figure at the right end of a Queue screen's header row (#225 decision 3:
 * #186's metric survives, #205's band does not). Label, number, and a tooltip carrying the
 * denominator so the number reads as evidence. When there is no number yet the stat says why in
 * the same slot rather than fabricating one. */
export function QueueStat({ label, value, detail, trend, unavailable }: {
  label: string
  value: string
  /** "142 of 210, last 30 days" — shown as a title and to screen readers. */
  detail: string
  trend?: "up" | "down" | "flat" | null
  unavailable?: string
}) {
  if (unavailable) {
    return <span className="hidden items-baseline gap-1.5 text-xs text-slate-600 md:inline-flex" title={unavailable}>
      <span className="font-medium">{label}</span>
      <span aria-hidden>·</span>
      <span>not available yet</span>
    </span>
  }
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus
  const trendClass = trend === "up" ? "text-emerald-700" : trend === "down" ? "text-amber-700" : "text-slate-500"
  return <span className="hidden items-baseline gap-1.5 text-xs text-slate-600 md:inline-flex" title={detail}>
    <span className="font-medium">{label}</span>
    <span className="text-sm font-semibold tabular-nums text-slate-900">{value}</span>
    {trend && <TrendIcon className={`h-3.5 w-3.5 self-center ${trendClass}`} aria-hidden />}
    <span className="sr-only">{detail}</span>
  </span>
}
