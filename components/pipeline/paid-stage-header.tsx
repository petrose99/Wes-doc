import type { PaidSummary } from "@/models/bills"
import { Banknote, CalendarClock } from "lucide-react"
import Link from "next/link"

/** The Paid-stage twin of SyncedStageHeader. Synced's aging strip ("Current / 1-30 / 90+") asks
 * "what's still owed" — meaningless on a tab that's exclusively money already settled, so Paid
 * gets its own header rather than inheriting a strip full of zeroes. This one answers "how much
 * moved, and how recently" instead. */
export function PaidStageHeader({ workspaceId, summary, currency }: {
  workspaceId: string
  summary: PaidSummary
  currency: string
}) {
  const formatMoney = (value: number) => {
    try {
      return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 0 }).format(value)
    } catch {
      return `${value.toFixed(0)} ${currency}`.trim()
    }
  }
  if (summary.total.count === 0) return null

  return <div className="border-b border-slate-200 bg-slate-50 px-6 py-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap gap-2">
        <div className="flex items-center gap-2.5 rounded-md border border-slate-200 bg-white px-3 py-1.5">
          <Banknote className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
          <div>
            <div className="text-sm font-bold tabular-nums text-slate-900">{formatMoney(summary.total.amount)}</div>
            <div className="text-[11px] text-slate-500">paid all-time · {summary.total.count} bill{summary.total.count === 1 ? "" : "s"}</div>
          </div>
        </div>
        <div className="flex items-center gap-2.5 rounded-md border border-slate-200 bg-white px-3 py-1.5">
          <CalendarClock className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
          <div>
            <div className="text-sm font-bold tabular-nums text-slate-900">{formatMoney(summary.last30d.amount)}</div>
            <div className="text-[11px] text-slate-500">last 30 days · {summary.last30d.count} bill{summary.last30d.count === 1 ? "" : "s"}</div>
          </div>
        </div>
      </div>
      <Link href={`/workspaces/${workspaceId}/bills`} className="shrink-0 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900">
        Open bills cockpit →
      </Link>
    </div>
  </div>
}
