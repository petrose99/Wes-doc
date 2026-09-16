"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import type { AgingBucket } from "@/lib/bills/due-date"
import type { BillsSummary } from "@/models/bills"
import { formatPaymentMoney } from "@/components/payments/format"

/** #229 Q8 (#251): *Open invoices by age* as Bill Pay's one metric — a 56px band above the
 * header band, the proportional bar from `components/dashboard/aging-summary.tsx` laid
 * horizontally, each bucket a link into the queue with that Aging chip applied (and a second
 * click clearing it). Money in the workspace currency; the bar is never the only signal — the
 * count and total are text beside each swatch. */
const BUCKETS: (AgingBucket | "unknown")[] = ["current", "1-30", "31-60", "61-90", "90+", "unknown"]
const BUCKET: Record<AgingBucket | "unknown", { label: string; param: string; bar: string; dot: string }> = {
  current: { label: "Not yet due", param: "current", bar: "bg-emerald-500", dot: "bg-emerald-500" },
  "1-30": { label: "1–30 days overdue", param: "1-30", bar: "bg-amber-400", dot: "bg-amber-400" },
  "31-60": { label: "31–60 days overdue", param: "31-60", bar: "bg-amber-500", dot: "bg-amber-500" },
  "61-90": { label: "61–90 days overdue", param: "61-90", bar: "bg-orange-500", dot: "bg-orange-500" },
  "90+": { label: "90+ days overdue", param: "90+", bar: "bg-red-500", dot: "bg-red-500" },
  unknown: { label: "No due date", param: "none", bar: "bg-slate-300", dot: "bg-slate-300" },
}

export function AgingBand({ summary, currencyCode }: { summary: BillsSummary; currencyCode: string }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const active = searchParams.get("aging")
  const openCount = BUCKETS.reduce((sum, bucket) => sum + summary[bucket].count, 0)
  const outstanding = BUCKETS.reduce((sum, bucket) => sum + summary[bucket].total, 0)
  const overdue = (["1-30", "31-60", "61-90", "90+"] as const).reduce((sum, bucket) => sum + summary[bucket].total, 0)
  const href = (param: string) => {
    const next = new URLSearchParams(searchParams.toString())
    if (active === param) next.delete("aging"); else next.set("aging", param)
    const qs = next.toString()
    return qs ? `${pathname}?${qs}` : pathname
  }
  const money = (value: number) => formatPaymentMoney(value, currencyCode, currencyCode)

  return <section aria-label="Open invoices by age" className="flex min-h-14 flex-wrap items-center gap-x-5 gap-y-2 border-b border-slate-200 bg-slate-50 px-4 py-2 text-sm">
    <div className="flex items-baseline gap-2">
      <h2 className="text-xs font-medium uppercase tracking-wide text-slate-600">Open invoices by age</h2>
      {openCount === 0
        ? <span className="text-sm text-slate-600">Nothing outstanding.</span>
        : <span className="text-sm text-slate-700">
          <span className="font-semibold tabular-nums text-slate-900">{money(outstanding)}</span> across {openCount} invoice{openCount === 1 ? "" : "s"}
          {overdue > 0 && <> · <span className="font-semibold tabular-nums text-red-700">{money(overdue)}</span> overdue</>}
        </span>}
    </div>
    {outstanding > 0 && <div className="flex h-2 min-w-[160px] flex-1 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
      {BUCKETS.map((bucket) => {
        const share = summary[bucket].total / outstanding
        return share > 0 ? <div key={bucket} className={BUCKET[bucket].bar} style={{ width: `${share * 100}%` }} /> : null
      })}
    </div>}
    {openCount > 0 && <ul className="hidden flex-wrap items-center gap-1 md:flex" aria-label="Aging buckets">
      {BUCKETS.map((bucket) => {
        const data = summary[bucket]
        if (data.count === 0) return null
        const on = active === BUCKET[bucket].param
        return <li key={bucket}>
          <Link href={href(BUCKET[bucket].param)} aria-current={on ? "true" : undefined} aria-label={`${BUCKET[bucket].label}: ${data.count}, ${money(data.total)}${on ? " (filtering)" : ""}`}
            className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${on ? "bg-emerald-700 text-white" : "text-slate-700 hover:bg-slate-200/70"}`}>
            <span className={`h-2 w-2 shrink-0 rounded-full ${on ? "bg-white" : BUCKET[bucket].dot}`} aria-hidden />
            <span>{BUCKET[bucket].label}</span>
            <span className={on ? "text-emerald-100" : "text-slate-500"}>{data.count}</span>
            <span className={`hidden lg:inline ${on ? "text-white" : "text-slate-900"}`}>{money(data.total)}</span>
          </Link>
        </li>
      })}
    </ul>}
  </section>
}
