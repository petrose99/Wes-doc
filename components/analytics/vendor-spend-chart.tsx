import type { VendorSpendRow } from "@/lib/analytics/workspace-analytics"

const TOP_N = 10

export function VendorSpendChart({ rows, formatMoney }: {
  rows: VendorSpendRow[]
  formatMoney: (value: number) => string
}) {
  if (!rows.length) {
    return <section className="space-y-2">
      <h2 className="text-lg font-semibold text-slate-900">Spend by vendor</h2>
      <p className="rounded border border-dashed p-6 text-center text-sm text-slate-500">
        No vendor spend data yet. Upload invoices or receipts to see spend by vendor.
      </p>
    </section>
  }

  const top = rows.slice(0, TOP_N)
  const rest = rows.slice(TOP_N)
  const otherTotal = rest.reduce((sum, row) => sum + row.totalSpend, 0)
  const otherCount = rest.reduce((sum, row) => sum + row.documentCount, 0)
  const bars = otherTotal > 0 ? [...top, { vendor: "Other", totalSpend: otherTotal, documentCount: otherCount, lastDocumentDate: null }] : top
  const max = Math.max(...bars.map((bar) => bar.totalSpend), 1)

  return <section className="space-y-3">
    <div>
      <h2 className="text-lg font-semibold text-slate-900">Spend by vendor</h2>
      <p className="text-xs text-slate-500">Top vendors by total spend across invoices and receipts.</p>
    </div>
    <div className="space-y-2">
      {bars.map((row) => {
        const percent = Math.max(Math.round((row.totalSpend / max) * 100), 2)
        return <div key={row.vendor} className="space-y-1">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="truncate font-medium text-slate-700">{row.vendor}</span>
            <span className="shrink-0 text-slate-500">{formatMoney(row.totalSpend)} · {row.documentCount} doc{row.documentCount === 1 ? "" : "s"}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-blue-600" style={{ width: `${percent}%` }} />
          </div>
        </div>
      })}
    </div>
  </section>
}
