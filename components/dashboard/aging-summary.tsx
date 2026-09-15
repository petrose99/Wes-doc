import type { AgingBucket } from "@/lib/bills/due-date"
import type { BillsSummary } from "@/models/bills"
import { Clock3 } from "lucide-react"
import Link from "next/link"

/** #225: the per-bucket aging totals that left the Invoices header. One panel, not six cards:
 * a proportional bar of outstanding money by bucket, then one row per bucket that links into the
 * Invoices queue with that bucket's Aging chip already applied, so every number here has
 * somewhere to go. Counts only unpaid bills — a paid invoice has no age worth reporting. */
const BUCKETS: (AgingBucket | "unknown")[] = ["current", "1-30", "31-60", "61-90", "90+", "unknown"]

const BUCKET: Record<AgingBucket | "unknown", { label: string; param: string; bar: string }> = {
  current: { label: "Not yet due", param: "current", bar: "bg-emerald-500" },
  "1-30": { label: "1–30 days overdue", param: "1-30", bar: "bg-amber-400" },
  "31-60": { label: "31–60 days overdue", param: "31-60", bar: "bg-amber-500" },
  "61-90": { label: "61–90 days overdue", param: "61-90", bar: "bg-orange-500" },
  "90+": { label: "90+ days overdue", param: "90+", bar: "bg-red-500" },
  unknown: { label: "No due date", param: "none", bar: "bg-slate-300" },
}

export function AgingSummary({ workspaceId, summary, formatMoney }: {
  workspaceId: string
  summary: BillsSummary
  formatMoney: (value: number) => string
}) {
  const openCount = BUCKETS.reduce((sum, bucket) => sum + summary[bucket].count, 0)
  const outstanding = BUCKETS.reduce((sum, bucket) => sum + summary[bucket].total, 0)
  const overdue = (["1-30", "31-60", "61-90", "90+"] as const).reduce((sum, bucket) => sum + summary[bucket].total, 0)
  const queueHref = (param?: string) => `/workspaces/${workspaceId}/invoices?unpaid=1${param ? `&aging=${param}` : ""}`

  return <section aria-labelledby="aging-heading" className="rounded-2xl border border-[#e6ebf1] bg-white p-[18px] shadow-panel lg:p-5">
    <div className="mb-3.5 flex flex-wrap items-center gap-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-700"><Clock3 className="h-[17px] w-[17px]" /></span>
      <h2 id="aging-heading" className="text-[15px] font-bold text-slate-900">Open invoices by age</h2>
      {openCount > 0 && <Link href={queueHref()} className="ml-auto text-[13px] font-semibold text-emerald-700 hover:text-emerald-800">Open Invoices</Link>}
    </div>

    {openCount === 0 ? <p className="py-6 text-center text-sm text-slate-500">No unpaid invoices right now.</p> : <>
      <p className="text-[13.5px] text-slate-600">
        <span className="font-bold tabular-nums text-slate-900">{formatMoney(outstanding)}</span> outstanding across {openCount} invoice{openCount === 1 ? "" : "s"}
        {overdue > 0 && <> · <span className="font-semibold tabular-nums text-red-700">{formatMoney(overdue)}</span> overdue</>}
      </p>

      {outstanding > 0 && <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
        {BUCKETS.map((bucket) => {
          const share = summary[bucket].total / outstanding
          return share > 0 ? <div key={bucket} className={BUCKET[bucket].bar} style={{ width: `${share * 100}%` }} /> : null
        })}
      </div>}

      <ul className="mt-3 divide-y divide-[#eef2f6]">
        {BUCKETS.map((bucket) => {
          const data = summary[bucket]
          if (data.count === 0) return null
          return <li key={bucket}>
            <Link href={queueHref(BUCKET[bucket].param)} className="flex items-center gap-2.5 py-2 text-[13.5px] hover:text-emerald-800">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${BUCKET[bucket].bar}`} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-slate-700">{BUCKET[bucket].label}</span>
              <span className="w-8 shrink-0 text-right tabular-nums text-slate-500">{data.count}</span>
              <span className="w-[92px] shrink-0 text-right font-semibold tabular-nums text-slate-900">{data.total ? formatMoney(data.total) : "—"}</span>
            </Link>
          </li>
        })}
      </ul>
    </>}
  </section>
}
