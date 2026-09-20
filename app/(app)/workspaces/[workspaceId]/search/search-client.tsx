"use client"

import { searchListAction } from "@/app/(app)/workspaces/[workspaceId]/search-actions"
import { getQueueDetailAction } from "@/app/(app)/workspaces/[workspaceId]/queue-actions"
import type { SearchRow } from "@/models/search"
import { QueueScreen, type QueueColumn, type PaneHelpers } from "@/components/queue/queue-screen"
import { PaneMenuItem } from "@/components/queue/detail-pane"
import type { Facet } from "@/components/queue/facet-filters"
import { statusFacet } from "@/lib/queue/filters"
import { DOC_TYPES, DOC_TYPE_SPECS } from "@/lib/doc-types"
import { TYPED_DESTINATIONS } from "@/lib/typed-destinations"
import { documentDestinationPath, withOrigin } from "@/lib/navigation/origin"
import { formatDate, formatMoney, StatePills, ArchivedMark } from "@/components/queue/row-cells"
import { clearFilterParams } from "@/lib/queue/filters"
import { Badge } from "@/components/ui/badge"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Check, CircleHelp, Search } from "lucide-react"
import { useEffect, useRef, useState, useTransition } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

const SYNTAX_EXAMPLES = ["vendor:acme", "amount>1000", "date:2026-01..2026-02", "type:receipt", "status:closed"]

/** Every typed doc type's queue segment, keyed for the row/pane "Open on ‹Queue›" link — the
 * five secondary types (contract, delivery note, payslip, tax form, other) have no other list,
 * so they get no entry here and no link (spec §1). */
const TYPED_DOCTYPE_LABELS = new Map(TYPED_DESTINATIONS.map((d) => [d.docType as string, d.label]))

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
export function SearchPageClient({ workspaceId, initialQuery, initialGone = false }: {
  workspaceId: string
  initialQuery: string
  /** #270 close: set when the page arrived via `?gone=<id>` (the standalone document route's
   * redirect for a row deleted/moved between list render and click) — spec §3 "Result gone since
   * listing" wants the same missing-row notice typed queues show for #268, not a reset to the
   * empty-query state. */
  initialGone?: boolean
}) {
  const [query, setQuery] = useState(initialQuery)
  const [rows, setRows] = useState<SearchRow[]>([])
  const [searching, startSearch] = useTransition()
  // #270 spec §3 "Slow": the skeleton only shows once a request has been open ≥ 300ms, not on
  // every keystroke's debounce — a fast reply never flashes it.
  const [slow, setSlow] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  // #270 spec §1: the full current URL (q, active facets, page, selected `doc=`) so "Open on
  // ‹Queue›" round-trips back to the same scroll position (#244's contract) via `withOrigin`.
  const hereQuery = searchParams.toString()
  const here = hereQuery ? `${pathname}?${hereQuery}` : pathname
  // #270: Search has no per-document route (see queue-screen.tsx's `selectedIdParam`) — the
  // opened row lives in `?doc=<id>` alongside `q`/facets instead of a path segment.
  const initialSelectedId = searchParams.get("doc")

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
      // #270: `q` is bookmarkable/shareable like every other facet, and its presence has to reach
      // `extraFilterParams` below so a text-only zero-result gets the "filtered" copy, not "done".
      const next = new URLSearchParams(window.location.search)
      if (query.trim() === "") next.delete("q"); else next.set("q", query)
      const qs = next.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current)
      slowTimerRef.current = setTimeout(() => setSlow(true), 300)
      startSearch(async () => {
        const r = await searchListAction(workspaceId, { q: query, type, status, supplier })
        setRows(r.rows)
        if (slowTimerRef.current) clearTimeout(slowTimerRef.current)
        setSlow(false)
      })
    }, 300)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, query, searchParams.get("type"), searchParams.get("status"), searchParams.get("supplier")])

  const basePath = `/workspaces/${workspaceId}/search`

  const columns: QueueColumn<SearchRow>[] = [
    { key: "state", label: "State", phone: "pill", render: (row) => <StatePills state={row.processingState} trailing={row.archived ? <ArchivedMark /> : null} /> },
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

  // #270 spec §1: secondary-type documents (contract, delivery note, payslip, tax form, other)
  // have no other list — the pane is their only viewer, so no menu item renders for them.
  const paneMenu = (row: SearchRow, _helpers: PaneHelpers) => {
    const label = TYPED_DOCTYPE_LABELS.get(row.docType)
    if (!label) return null
    const target = documentDestinationPath(`/workspaces/${workspaceId}`, { id: row.documentId, docType: row.docType })
    return <PaneMenuItem href={withOrigin(target, here)}>Open on {label}</PaneMenuItem>
  }

  // #270 spec §3 "Zero results": two distinct clears — Clear search only empties `q`, Clear
  // filters only drops the facets (+ Supplier) via the shared `clearFilterParams` (B4), matching
  // the copy table's split action pair rather than one bespoke button.
  const clearSearch = () => {
    setQuery("")
    const next = new URLSearchParams(window.location.search)
    next.delete("q")
    const qs = next.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }
  const clearFacetFilters = () => {
    const next = clearFilterParams(searchParams, FACETS, "sort", ["supplier"])
    const qs = next.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }
  const CLEAR_BUTTON = "inline-flex h-8 items-center rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"

  return (
    <QueueScreen<SearchRow>
      title="Search"
      basePath={basePath}
      selectedIdParam="doc"
      initialSelectedId={initialSelectedId}
      rows={rows}
      rowId={(row) => row.id}
      detailIdFor={(row) => row.documentId}
      rowName={(row) => ({ title: row.filename, suffix: [row.supplier, row.number, row.amount !== null ? formatMoney(row.amount, row.currencyCode) : null].filter(Boolean).join(" · ") || undefined })}
      columns={columns}
      facets={FACETS}
      search={{ param: "supplier", label: "Supplier" }}
      extraFilterParams={["q"]}
      loadingRows={searching && slow}
      initialMissing={initialGone ? { text: "This document is no longer available." } : undefined}
      views={
        <div className="flex w-full max-w-xl flex-1 items-center gap-1.5">
          <span className="inline-flex h-9 min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 shadow-sm focus-within:border-emerald-300 focus-within:ring-2 focus-within:ring-emerald-100">
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
          {/* #270 spec §2a (critic H6/H10): the chip-syntax hint is recallable, not a one-shot
             toast — the inline under-box hint on the empty state shows once, this popover reopens
             the same four examples every time. */}
          <Popover>
            <PopoverTrigger asChild>
              <button type="button" aria-label="Search syntax" title="Search syntax"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600">
                <CircleHelp className="h-4 w-4" aria-hidden />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 text-sm">
              <p className="mb-2 font-medium text-slate-900">Search syntax</p>
              <ul className="space-y-1 text-slate-600">
                {SYNTAX_EXAMPLES.map((example) => <li key={example}><code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs">{example}</code></li>)}
              </ul>
            </PopoverContent>
          </Popover>
        </div>
      }
      empty={{
        // #270 spec §3 "Empty query, no facets": renders whenever `filtered` is false (no `q`, no
        // facet, no Supplier) — the chip-syntax hint under the box, shown every time this state is
        // reached (not a one-shot dismiss), distinct from the persistent popover above.
        done: {
          title: "Search by supplier, number, amount or any words on the page.",
          body: "",
          action: <p className="text-xs text-slate-600">
            Try {SYNTAX_EXAMPLES.map((example, i) => <span key={example}>{i > 0 && " "}<code className="whitespace-nowrap rounded bg-slate-100 px-1 py-0.5 font-mono">{example}</code></span>)}
          </p>,
        },
        filteredTitle: query.trim() ? `Nothing matches "${query.trim()}".` : undefined,
        // #270 close spec §4: zero-results copy is the title + the two clear buttons, nothing
        // else — `queue-empty.tsx`'s default `filteredBody` ("Clear a filter to widen the
        // queue.") is a queue-shaped sentence Search never asked for and isn't in the copy table.
        filteredBody: "",
        filteredAction: <div className="flex items-center justify-center gap-2">
          <button type="button" onClick={clearSearch} className={CLEAR_BUTTON}>Clear search</button>
          <button type="button" onClick={clearFacetFilters} className={CLEAR_BUTTON}>Clear filters</button>
        </div>,
      }}
      loadDetail={(documentId) => getQueueDetailAction(workspaceId, documentId)}
      paneMenu={paneMenu}
    />
  )
}
