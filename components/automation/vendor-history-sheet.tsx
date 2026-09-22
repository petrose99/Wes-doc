"use client"

import { useMemo, useState } from "react"
import { Search } from "lucide-react"

import { Pill, Sheet, Th } from "@/components/automation/automation-ui"
import { PinVendorHistoryButton } from "@/components/automation/pin-vendor-history-button"
import type { VendorHistoryRow } from "@/models/vendor-history"

/** "expense_receipt" → "Expense receipt", "category" → "Category" — the table shows the person's
 * words for these, not the template registry's snake_case codes. Purely presentational: search
 * still matches the raw code too, and the pin action keeps sending the raw keys. */
const humanize = (code: string) => {
  const spaced = code.replace(/_/g, " ")
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/** The Vendors tab's history table, split into its own client component for one reason: search.
 * A workspace with 200 vendors turned this into a Ctrl+F exercise — every row was rendered with
 * no way to narrow it down. Filtering happens over the page's already-fetched rows (the same
 * HISTORY_CAP-bounded set the server sent down), not a fresh query per keystroke. */
export function VendorHistorySheet({ workspaceId, rows, pinnedRuleIds, isOwner }: {
  workspaceId: string
  rows: VendorHistoryRow[]
  pinnedRuleIds: Record<string, string>
  isOwner: boolean
}) {
  const [query, setQuery] = useState("")

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter((row) => row.supplier.toLowerCase().includes(needle) || row.templateCode.toLowerCase().includes(needle))
  }, [rows, query])

  return <div>
    <div className="relative mb-3 max-w-xs">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search supplier or document type"
        aria-label="Search suppliers"
        className="w-full rounded-md border border-hairline py-1.5 pl-8 pr-3 text-[13px] text-slate-800 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
      />
    </div>

    {filtered.length === 0
      ? <p className="rounded-md border border-dashed border-hairline-dashed px-4 py-6 text-center text-sm text-slate-500">No supplier or document type matches &ldquo;{query}&rdquo;.</p>
      : <Sheet minWidth={720} head={<>
          <Th>Supplier</Th>
          <Th>Document type</Th>
          <Th align="right">Reviewed so far</Th>
          <Th>What gets filled in</Th>
          <Th>On the next document</Th>
          {isOwner && <Th>{""}</Th>}
        </>}>
          {filtered.map((row) => {
            const modalCoding = Object.fromEntries(
              Object.entries(row.prior.byKey).map(([key, stat]) => [key, stat.modalValue] as const),
            )
            return (
              <tr key={`${row.supplier}::${row.templateCode}`} className="align-top">
                <td className="py-3 pr-4 font-medium text-slate-900">{row.supplier}</td>
                <td className="py-3 pr-4 text-slate-500">{humanize(row.templateCode)}</td>
                <td className="py-3 pr-4 text-right tabular-nums text-slate-700">{row.totalConfirmed}</td>
                <td className="py-3 pr-4">
                  <ul className="space-y-1">
                    {Object.entries(row.prior.byKey).map(([key, stat]) => (
                      <li key={key} className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
                        <span className="text-slate-500">{humanize(key)}</span>
                        <span className="font-medium text-slate-900">{stat.modalValue}</span>
                        <span className="tabular-nums text-slate-400" title={`${stat.support} reviewed documents agreed ${Math.round(stat.agreement * 100)}% of the time`}>
                          {Math.round(stat.agreement * 100)}% of {stat.support}
                        </span>
                      </li>
                    ))}
                  </ul>
                </td>
                <td className="py-3 pr-4">
                  {row.willAutoApply
                    ? <Pill state="auto">Fills itself in</Pill>
                    : <Pill state="idle">Asks the AI</Pill>}
                </td>
                {isOwner && <td className="py-3">
                  <PinVendorHistoryButton
                    workspaceId={workspaceId}
                    supplier={row.supplier}
                    templateCode={row.templateCode}
                    coding={modalCoding}
                    initialRuleId={pinnedRuleIds[row.supplier] ?? null}
                  />
                </td>}
              </tr>
            )
          })}
        </Sheet>}
  </div>
}
