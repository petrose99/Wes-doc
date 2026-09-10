import type { AgingBucket } from "@/lib/bills/due-date"
import type { BillsSummary } from "@/models/bills"
import Link from "next/link"

/** Aging summary strip that lives above the Synced-stage document list. Six buckets, each showing
 * how many bills fall in it plus the total outstanding — the same summary the standalone Bills
 * page renders, moved here so the Synced tab is more than an empty pass-through to /bills.
 *
 * Rendered by pipeline/page.tsx only when `stage === "synced"` or `"paid"` (bills aging only
 * makes sense once the document has left Review). */
const BUCKETS: (AgingBucket | "unknown")[] = ["current", "1-30", "31-60", "61-90", "90+", "unknown"]

const BUCKET_LABEL: Record<AgingBucket | "unknown", string> = {
  current: "Current",
  "1-30": "1–30d",
  "31-60": "31–60d",
  "61-90": "61–90d",
  "90+": "90+d",
  unknown: "No due date",
}

export function SyncedStageHeader({ workspaceId, summary, currency }: {
  workspaceId: string
  summary: BillsSummary
  currency: string
}) {
  const formatMoney = (value: number) => {
    try {
      return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 0 }).format(value)
    } catch {
      return `${value.toFixed(0)} ${currency}`.trim()
    }
  }
  const anyBills = BUCKETS.some((bucket) => summary[bucket].count > 0)
  if (!anyBills) return null

  return <div className="border-b border-slate-200 bg-slate-50 px-6 py-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
        {BUCKETS.map((bucket) => {
          const data = summary[bucket]
          return <div key={bucket} className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs">
            <div className="font-medium text-slate-500">{BUCKET_LABEL[bucket]}</div>
            <div className="mt-0.5 text-sm font-bold tabular-nums text-slate-900">{data.count}</div>
            <div className="text-[10px] text-slate-400 tabular-nums">{data.total ? formatMoney(data.total) : "—"}</div>
          </div>
        })}
      </div>
      <Link href={`/workspaces/${workspaceId}/bills`} className="shrink-0 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900">
        Open bills cockpit →
      </Link>
    </div>
  </div>
}
