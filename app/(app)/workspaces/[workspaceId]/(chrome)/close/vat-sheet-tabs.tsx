"use client"

import { useState } from "react"

export type VatSheetView = {
  workpaperId: string
  label: string
  totals: Record<string, number>
  boxes: Record<string, number>
  billCount: number
}

function fmt(n: number): string {
  return n.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function SheetTable({ sheet }: { sheet: VatSheetView }) {
  const rows: { section: string; key: string; value: number }[] = [
    ...Object.entries(sheet.totals).map(([key, value]) => ({ section: "Total", key, value })),
    ...Object.entries(sheet.boxes).map(([key, value]) => ({ section: "Box", key, value })),
  ]
  return (
    <div>
      <p className="mb-2 text-xs text-slate-500">{sheet.billCount} bill{sheet.billCount === 1 ? "" : "s"} behind this sheet.</p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">The sheet computed no figures for this period.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[320px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-2 py-1.5 font-medium">Line</th>
                <th className="px-2 py-1.5 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.section}-${row.key}`} className="border-b border-slate-100">
                  <td className="px-2 py-1.5 text-slate-700">{row.section} {row.key}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-slate-800">{fmt(row.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/** #97: per-sheet tabs for the VAT workpaper item. A single sheet (ZA VAT201) renders with
 * no tab strip; the LS group's two-tab bundle gets one tab per sheet. */
export function VatSheetTabs({ sheets }: { sheets: VatSheetView[] }) {
  const [active, setActive] = useState(0)
  if (sheets.length === 0) return <p className="text-sm text-muted-foreground">No sheets computed.</p>
  if (sheets.length === 1) return <SheetTable sheet={sheets[0]} />
  const current = sheets[Math.min(active, sheets.length - 1)]
  return (
    <div className="space-y-3">
      <div className="flex gap-1 border-b border-slate-200" role="tablist">
        {sheets.map((sheet, index) => (
          <button
            key={sheet.workpaperId}
            type="button"
            role="tab"
            aria-selected={index === active}
            className={`-mb-px border-b-2 px-3 py-1.5 text-sm font-medium transition-colors ${index === active ? "border-emerald-600 text-emerald-800" : "border-transparent text-slate-500 hover:text-slate-800"}`}
            onClick={() => setActive(index)}>
            {sheet.label}
          </button>
        ))}
      </div>
      <SheetTable sheet={current} />
    </div>
  )
}
