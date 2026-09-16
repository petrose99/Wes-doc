"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { ArrowUpDown, Download, MoreHorizontal, ShieldAlert, ShieldCheck } from "lucide-react"
import { toast } from "sonner"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { DetailPane, DETAIL_PANE_ID } from "@/components/queue/detail-pane"
import { FacetFilters, type Facet } from "@/components/queue/facet-filters"
import { OverrideModeProvider, useOverrideMode } from "@/components/queue/override-mode-context"
import { confirmLeave } from "@/lib/client/unsaved-changes"

export type QueueColumn<T> = {
  key: string
  label: string
  /** Kept in the narrowed list while the Detail pane is open (#225 §3). */
  narrow?: boolean
  /** Cell classes — alignment, tabular numerals, width hints. */
  className?: string
  render: (row: T) => ReactNode
}

export type SortOption<T> = { key: string; label: string; compare: (a: T, b: T) => number }

export type BulkContext = { selectedIds: string[]; clear: () => void }
export type PaneHelpers = { close: () => void; refresh: () => void }

/** The Queue screen (#225; CONTEXT.md "Queue screen"): the shared composition every typed
 * destination renders on. Two header layers — row 1 is title · Views · Sort · summary filter
 * chips · inline stat · overflow menu; row 2 is the table head — then the queue at full width
 * with its own horizontal scroller, and the one right-hand Detail pane beside it.
 *
 * Each surface (InvoiceQueue, ReceiptQueue, …) supplies its rows, columns, facets and actions;
 * this component owns selection, the pane's open/closed state, ↑/↓/Escape, deep links and the
 * checkbox set the bulk bar reads. The checkbox is bulk selection only — a row *opens* by click
 * or Enter on its title, never by checking it. */
export function QueueScreen<T>(props: QueueScreenProps<T>) {
  return <OverrideModeProvider><QueueScreenInner {...props} /></OverrideModeProvider>
}

export type QueueScreenProps<T> = {
  title: string
  /** The route this queue lives at; a selected row is reflected as `${basePath}/${id}`. */
  basePath: string
  rows: T[]
  rowId: (row: T) => string
  /** The document a row's Detail pane shows. Defaults to `rowId` — Exceptions differ, since a
   * row there is one escalated check, not one document. */
  detailIdFor?: (row: T) => string
  rowTitle: (row: T) => string
  rowSubtitle?: (row: T) => string | null
  /** The processing-state mark at the row's leading edge (CONTEXT.md "Processing state"). */
  leading?: (row: T) => ReactNode
  columns: QueueColumn<T>[]
  /** Renders the bulk-selection checkbox column. Off for surfaces with no bulk actions. */
  selectable?: boolean
  sortOptions?: SortOption<T>[]
  facets?: Facet[]
  views?: ReactNode
  /** One inline figure at the right end of row 1 (#186's metric; #205's band is gone). */
  stat?: ReactNode
  /** Additional overflow-menu items, rendered after Override Mode and Export. */
  menu?: ReactNode
  onExportAll?: () => Promise<void>
  /** The bulk action bar's contents — the surface's own buttons and dialogs. */
  bulkActions?: (context: BulkContext) => ReactNode
  empty: { title: string; body: string; filteredTitle?: string; filteredBody?: string }
  loadDetail: (documentId: string) => Promise<ReactNode | null>
  paneActions?: (row: T, helpers: PaneHelpers) => ReactNode
  paneMenu?: (row: T, helpers: PaneHelpers) => ReactNode
  /** A deep link (`/invoices/<id>`) opens the queue with that row selected and the pane open. */
  initialSelectedId?: string | null
  /** The URL search param the sort is read from and written to. Defaults to `sort`. */
  sortParam?: string
}

const INTERACTIVE = "a, button, input, select, textarea, label, [role=button], [contenteditable=true]"

function QueueScreenInner<T>({
  title, basePath, rows, rowId, detailIdFor, rowTitle, rowSubtitle, leading, columns, selectable = false, sortOptions = [], facets = [],
  views, stat, menu, onExportAll, bulkActions, empty, loadDetail, paneActions, paneMenu, initialSelectedId = null, sortParam = "sort",
}: QueueScreenProps<T>) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const overrideMode = useOverrideMode()
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [openId, setOpenId] = useState<string | null>(initialSelectedId)
  const [reloadKey, setReloadKey] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRefs = useRef<Map<string, HTMLButtonElement>>(new Map())

  const sortKey = searchParams.get(sortParam)
  const activeSort = sortOptions.find((option) => option.key === sortKey) ?? sortOptions[0] ?? null
  const sortedRows = useMemo(() => {
    if (!activeSort) return rows
    return [...rows].sort(activeSort.compare)
  }, [rows, activeSort])

  const ids = useMemo(() => sortedRows.map(rowId), [sortedRows, rowId])
  const openIndex = openId ? ids.indexOf(openId) : -1
  const openRow = openIndex >= 0 ? sortedRows[openIndex] : null
  const filtered = facets.some((facet) => searchParams.get(facet.param))

  // Reflect the open row in the URL so a refresh, a share, or Back lands on the same state — the
  // `${basePath}/${id}` route renders this same queue with `initialSelectedId` set. replaceState
  // rather than push: arrowing through fifty rows must not leave fifty history entries.
  const syncUrl = useCallback((id: string | null) => {
    if (typeof window === "undefined") return
    const qs = window.location.search
    window.history.replaceState(window.history.state, "", `${id ? `${basePath}/${id}` : basePath}${qs}`)
  }, [basePath])

  // Opening another row or closing the pane unmounts whatever is in it; unsaved work there
  // (Match manually's pending line matches, #250) gets one chance to say so.
  const open = useCallback((id: string) => { if (!confirmLeave()) return; setOpenId(id); syncUrl(id) }, [syncUrl])
  // Closing returns focus to the row that was open — recorded as state and applied in an effect
  // once the pane has unmounted, so `close` itself stays free of DOM refs.
  const [focusReturn, setFocusReturn] = useState<string | null>(null)
  const close = useCallback(() => {
    if (!confirmLeave()) return
    setFocusReturn(openId)
    setOpenId(null)
    syncUrl(null)
  }, [openId, syncUrl])
  useEffect(() => {
    if (openId === null && focusReturn) triggerRefs.current.get(focusReturn)?.focus()
  }, [openId, focusReturn])
  const step = useCallback((delta: 1 | -1) => {
    if (openIndex < 0) return
    const next = ids[openIndex + delta]
    if (next) open(next)
  }, [ids, openIndex, open])

  // The row a deep link asked for may have been filtered out or deleted; don't hold a pane open
  // on nothing. Derived, not synced: `openRow` is already null in that case, and the URL is
  // corrected the next time the operator opens or closes a row.

  // ↑/↓ move the selection and Escape closes, from anywhere on the screen except inside a field
  // the operator is typing in.
  useEffect(() => {
    if (!openId) return
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest("input, textarea, select, [contenteditable=true], [role=dialog], [role=listbox], [role=menu]")) return
      if (event.key === "ArrowDown") { event.preventDefault(); step(1) }
      else if (event.key === "ArrowUp") { event.preventDefault(); step(-1) }
      else if (event.key === "Escape") { event.preventDefault(); close() }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [openId, step, close])

  const checkedIds = [...checked].filter((id) => ids.includes(id))
  const allChecked = ids.length > 0 && checkedIds.length === ids.length
  const toggleChecked = (id: string) => setChecked((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })
  const toggleAll = () => setChecked(allChecked ? new Set() : new Set(ids))
  const clearChecked = () => setChecked(new Set())

  const visibleColumns = openId ? columns.filter((column) => column.narrow) : columns
  const refresh = useCallback(() => { setReloadKey((k) => k + 1); router.refresh() }, [router])
  const helpers = useMemo<PaneHelpers>(() => ({ close, refresh }), [close, refresh])

  const setSort = (key: string) => {
    const next = new URLSearchParams(searchParams.toString())
    if (key === sortOptions[0]?.key) next.delete(sortParam); else next.set(sortParam, key)
    const qs = next.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }

  const exportAll = async () => {
    if (!onExportAll) return
    setExporting(true)
    try { await onExportAll() } catch { toast.error("Could not reach the server") } finally { setExporting(false) }
  }

  // The screen is viewport-bound from `md` up so the queue and the pane scroll independently
  // under a sticky table head (the app shell's root is `min-h-screen`, which alone would let the
  // pane grow past the viewport and push its action bar out of reach). Below `md` the queue
  // flows with the page and the pane is a fixed sheet, so no bound is needed.
  return <div ref={rootRef} className="flex min-h-0 flex-1 flex-col md:h-dvh md:flex-none md:overflow-hidden">
    {/* Row 1: title · Views · Sort · filters · stat · menu */}
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-200 px-4 py-2">
      <h1 className="flex items-baseline gap-2 text-lg font-semibold tracking-tight text-slate-900">
        {title}
        <span className="text-sm font-normal tabular-nums text-slate-500" aria-label={`${rows.length} rows`}>{rows.length}</span>
      </h1>
      {views}
      {sortOptions.length > 1 && <label className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-300 bg-white pl-2 pr-1 text-xs font-medium text-slate-700 focus-within:ring-2 focus-within:ring-emerald-600 focus-within:ring-offset-1">
        <ArrowUpDown className="h-3.5 w-3.5 text-slate-500" aria-hidden />
        <span className="sr-only">Sort by</span>
        <select value={activeSort?.key} onChange={(event) => setSort(event.target.value)} className="h-full cursor-pointer appearance-none bg-transparent pr-1 text-xs font-medium text-slate-700 focus:outline-none">
          {sortOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
        </select>
      </label>}
      {facets.length > 0 && <FacetFilters facets={facets} />}
      <div className="ml-auto flex items-center gap-2">
        {stat}
        <Popover open={menuOpen} onOpenChange={setMenuOpen}>
          <PopoverTrigger asChild>
            <button type="button" aria-label="Queue options" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600">
              <MoreHorizontal className="h-4 w-4" aria-hidden />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 p-1" onClick={(event) => { if ((event.target as HTMLElement).closest("[data-menu-close]")) setMenuOpen(false) }}>
            <button type="button" role="switch" aria-checked={overrideMode.active} onClick={overrideMode.toggle} data-menu-close
              className="flex w-full items-start gap-2.5 rounded-sm px-2.5 py-2 text-left text-sm text-slate-700 hover:bg-slate-100">
              {overrideMode.active ? <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden /> : <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden />}
              <span>
                <span className="block font-medium">{overrideMode.active ? "Turn off Override Mode" : "Turn on Override Mode"}</span>
                <span className="block text-xs text-slate-500">Lets you override soft checks (match, confidence, trust, workspace) with a reason. Duplicate, jurisdiction and SMB-ceiling checks never can be.</span>
              </span>
            </button>
            {onExportAll && <button type="button" onClick={() => void exportAll()} disabled={exporting || rows.length === 0} data-menu-close
              className="flex w-full items-center gap-2.5 rounded-sm px-2.5 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50">
              <Download className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
              {exporting ? "Exporting…" : `Export ${rows.length === 1 ? "this row" : `all ${rows.length} rows`} as CSV`}
            </button>}
            {menu}
          </PopoverContent>
        </Popover>
      </div>
    </div>

    {/* Override Mode banner — only while the mode is on (#203's permanent strip is gone). */}
    {overrideMode.active && <div role="status" className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-xs font-medium text-amber-900">
      <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" aria-hidden />Override Mode is on. Open a row&apos;s Checks tab to override a soft check with a reason.</span>
      <button type="button" onClick={overrideMode.toggle} className="rounded-md border border-amber-300 bg-white px-2 py-0.5 text-xs font-medium text-amber-900 hover:bg-amber-100">Turn off</button>
    </div>}

    {/* Bulk action bar: its own row above the table head once anything is checked. */}
    {selectable && bulkActions && checkedIds.length > 0 && <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2 text-sm" role="region" aria-label="Bulk actions">
      <span className="mr-1 font-medium tabular-nums text-slate-800">{checkedIds.length} selected</span>
      {bulkActions({ selectedIds: checkedIds, clear: clearChecked })}
      <button type="button" onClick={clearChecked} className="ml-auto text-xs font-medium text-slate-600 hover:text-slate-900">Clear selection</button>
    </div>}

    <div className="flex min-h-0 flex-1 md:overflow-hidden">
      <div className={`min-w-0 flex-1 md:overflow-auto ${openId ? "lg:shadow-[inset_-1px_0_0_0_rgb(226_232_240)]" : ""}`}>
        {sortedRows.length === 0
          ? <div className="mx-auto max-w-md px-6 py-16 text-center">
            <p className="text-sm font-medium text-slate-800">{filtered ? empty.filteredTitle ?? "Nothing matches these filters." : empty.title}</p>
            <p className="mt-1 text-sm text-slate-600">{filtered ? empty.filteredBody ?? "Clear a filter to widen the queue." : empty.body}</p>
          </div>
          : <table className={`w-full text-sm ${openId ? "" : "min-w-[720px]"}`}>
            <thead className="sticky top-0 z-10 bg-white shadow-[inset_0_-1px_0_0_theme(colors.slate.200)]">
              <tr className="text-left text-xs font-medium uppercase tracking-wide text-slate-600">
                {selectable && <th scope="col" className="w-10 px-3 py-2">
                  <input type="checkbox" aria-label={`Select all ${title.toLowerCase()}`} checked={allChecked} onChange={toggleAll} className="h-4 w-4 rounded border-slate-300 accent-emerald-700" />
                </th>}
                {leading && <th scope="col" className="w-8 px-1 py-2"><span className="sr-only">Mark</span></th>}
                {visibleColumns.map((column) => <th key={column.key} scope="col" className={`px-3 py-2 font-medium ${column.className ?? ""}`}>{column.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => {
                const id = rowId(row)
                const isOpen = id === openId
                const isChecked = checked.has(id)
                return <tr key={id} aria-current={isOpen ? "true" : undefined} style={{ height: 62 }}
                  className={`group cursor-pointer border-b border-slate-100 transition-colors ${isOpen ? "bg-emerald-50/60" : isChecked ? "bg-slate-50" : "hover:bg-slate-50"}`}
                  onClick={(event) => {
                    if ((event.target as HTMLElement).closest(INTERACTIVE)) return
                    if (isOpen) close(); else open(id)
                  }}>
                  {selectable && <td className="px-3 py-0">
                    <input type="checkbox" aria-label={`Select ${rowTitle(row)}`} checked={isChecked} onChange={() => toggleChecked(id)} className="h-4 w-4 rounded border-slate-300 accent-emerald-700" />
                  </td>}
                  {leading && <td className="px-1 py-0">{leading(row)}</td>}
                  {visibleColumns.map((column, columnIndex) => <td key={column.key} className={`px-3 py-0 ${column.className ?? ""} ${isOpen && columnIndex === 0 ? "relative before:absolute before:inset-y-2 before:-left-px before:w-[3px] before:rounded-full before:bg-emerald-700" : ""}`}>
                    {columnIndex === 0
                      ? <button type="button" ref={(el) => { if (el) triggerRefs.current.set(id, el); else triggerRefs.current.delete(id) }}
                        aria-expanded={isOpen} aria-controls={DETAIL_PANE_ID}
                        aria-label={[rowTitle(row), rowSubtitle?.(row)].filter(Boolean).join(" · ")}
                        onClick={() => (isOpen ? close() : open(id))}
                        className="block w-full min-w-0 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2">
                        {column.render(row)}
                      </button>
                      : column.render(row)}
                  </td>)}
                </tr>
              })}
            </tbody>
          </table>}
      </div>

      {openRow && <DetailPane
        documentId={(detailIdFor ?? rowId)(openRow)}
        title={rowTitle(openRow)}
        subtitle={rowSubtitle?.(openRow) ?? null}
        position={{ index: openIndex + 1, total: sortedRows.length }}
        onClose={close}
        onPrev={openIndex > 0 ? () => step(-1) : null}
        onNext={openIndex < sortedRows.length - 1 ? () => step(1) : null}
        loadDetail={loadDetail}
        actions={paneActions?.(openRow, helpers)}
        menu={paneMenu?.(openRow, helpers)}
        reloadKey={reloadKey} />}
    </div>
  </div>
}
