"use client"

import { searchListAction } from "@/app/(app)/workspaces/[workspaceId]/search-actions"
import { getQueueDetailAction } from "@/app/(app)/workspaces/[workspaceId]/queue-actions"
import type { SearchRow } from "@/models/search"
import { QueueScreen, type QueueColumn } from "@/components/queue/queue-screen"
import type { Facet } from "@/components/queue/facet-filters"
import { statusFacet } from "@/lib/queue/filters"
import { DOC_TYPES, DOC_TYPE_SPECS } from "@/lib/doc-types"
import { formatDate, formatMoney, StatePills } from "@/components/queue/row-cells"
import { Badge } from "@/components/ui/badge"
import { Check, Search } from "lucide-react"
import { useEffect, useRef, useState, useTransition } from "react"
import { useSearchParams } from "next/navigation"

const TYPE_FACET: Facet = {
  param: "type",
  label: "Type",
  kind: "multi",
  options: DOC_TYPES.map((type) => ({ value: type, label: DOC_TYPE_SPECS[type].label })),
}

const STATUS_FACET: Facet = { ...statusFacet(), kind: "multi" }

const FACETS: Facet[] = [TYPE_FACET, STATUS_FACET]

/** #270: Search rebuilt on the Queue-screen shell (#225), replacing the standalone box+list page
 * built for #262's `/` key. Predicate is `searchWorkspaceDocuments` (models/search.ts) — every
 * document, every processing state, `archivedAt` included, never `LIBRARY_WHERE` (spec §1). Ask
 * AI/Sparkles/AssistantPanel are retired from this page per #245 decision 7 ("One box, one mode").
 * Supplier is the shell's built-in `search` slot (own URL param, own header box) rather than a new
 * facet kind — the shared `Facet` type has no free-text option (spec §1 "else a supplier
 * extraParam"). Date range is out of this step — no `dateFrom`/`dateTo` UI yet, kept server-ready. */
export function SearchPageClient({ workspaceId, initialQuery }: {
  workspaceId: string
  initialQuery: string
}) {
  const [query, setQuery] = useState(initialQuery)
  const [rows, setRows] = useState<SearchRow[]>([])
  const [searching, startSearch] = useTransition()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchParams = useSearchParams()

  // #262: arrival from the `/` shortcut — the input already autofocuses on mount, this only
  // matters when the operator was already on this page and pressed `/` again.
  useEffect(() => {
    if (typeof window === "undefined") return
    if (window.sessionStorage.getItem("docubite.pendingFocus") !== "search") return
    window.sessionStorage.removeItem("docubite.pendingFocus")
    document.getElementById("search-input")?.focus()
  }, [])

  useEffect(() => {
    const type = searchParams.get("type") ?? undefined
    const status = searchParams.get("status") ?? undefined
    const supplier = searchParams.get("supplier") ?? undefined
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      startSearch(async () => {
        const r = await searchListAction(workspaceId, { q: query, type, status, supplier })
        setRows(r.rows)
      })
    }, 300)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, query, searchParams.get("type"), searchParams.get("status"), searchParams.get("supplier")])

  const basePath = `/workspaces/${workspaceId}/search`

  const columns: QueueColumn<SearchRow>[] = [
    { key: "state", label: "State", phone: "pill", render: (row) => <StatePills state={row.processingState} /> },
    { key: "type", label: "Type", phone: "pill", render: (row) => <Badge variant="outline">{row.typeLabel}</Badge> },
    { key: "supplier", label: "Supplier", narrow: true, className: "min-w-[12rem]", phone: "subtitle", render: (row) => row.supplier ?? "—" },
    { key: "number", label: "Number", className: "whitespace-nowrap text-slate-700", phone: "subtitle", render: (row) => row.number ?? "—" },
    { key: "date", label: "Date", narrow: true, className: "whitespace-nowrap tabular-nums text-slate-700", phone: "subtitle", render: (row) => formatDate(row.date) },
    { key: "amount", label: "Amount", narrow: true, className: "whitespace-nowrap text-right tabular-nums text-slate-900", phone: "trailing", render: (row) => row.amount !== null ? formatMoney(row.amount, row.currencyCode) : "—" },
    {
      key: "ledger", label: "Ledger", phone: "pill",
      render: (row) => row.ledgerMark ? <Check className="h-4 w-4 text-emerald-600" aria-label={row.ledgerMark === "paid" ? "Paid" : "Posted"} /> : null,
    },
  ]

  return (
    <QueueScreen<SearchRow>
      title="Search"
      basePath={basePath}
      rows={rows}
      rowId={(row) => row.id}
      detailIdFor={(row) => row.documentId}
      rowName={(row) => ({ title: row.filename, suffix: [row.supplier, row.number, row.amount !== null ? formatMoney(row.amount, row.currencyCode) : null].filter(Boolean).join(" · ") || undefined })}
      columns={columns}
      facets={FACETS}
      search={{ param: "supplier", label: "Supplier" }}
      views={
        <span className="inline-flex h-9 w-full max-w-xl flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 shadow-sm focus-within:border-emerald-300 focus-within:ring-2 focus-within:ring-emerald-100">
          <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
          <label htmlFor="search-input" className="sr-only">Search documents</label>
          <input
            id="search-input"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by supplier, number, amount or any words on the page"
            className="flex-1 bg-transparent text-sm outline-none"
            autoFocus
          />
          {searching && <span className="sr-only" role="status">Searching…</span>}
        </span>
      }
      empty={{ firstUse: { title: "Search your documents.", body: "Search by supplier, number, amount or any words on the page." } }}
      loadDetail={(documentId) => getQueueDetailAction(workspaceId, documentId)}
    />
  )
}
