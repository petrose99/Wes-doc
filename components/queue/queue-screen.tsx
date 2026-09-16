"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { ArrowUpDown, Download, MoreHorizontal, ShieldAlert, ShieldCheck } from "lucide-react"
import { toast } from "sonner"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { DetailPane, DETAIL_PANE_ID, type PaneName } from "@/components/queue/detail-pane"
import { FacetFilters, type Facet } from "@/components/queue/facet-filters"
import { FilterButton, FilterSheet } from "@/components/queue/filter-sheet"
import { OverrideModeProvider, useOverrideMode } from "@/components/queue/override-mode-context"
import { confirmLeave } from "@/lib/client/unsaved-changes"
import { isPhoneLane } from "@/lib/client/use-phone-lane"
import { orderColumnsByFieldTable, widthClassFor, type FieldTable } from "@/lib/configuration/field-table"

export type QueueColumn<T> = {
  key: string
  label: string
  /** Kept in the narrowed list while the Detail pane is open (#225 §3). */
  narrow?: boolean
  /** Cell classes — alignment, tabular numerals, width hints. */
  className?: string
  /** #252: the document field this column shows, so Admin › Configuration › Fields can order,
   * size or hide it in the system views. Columns without one (state, aging, PO) keep their place. */
  fieldKey?: string
  render: (row: T) => ReactNode
}

export type SortOption<T> = { key: string; label: string; compare: (a: T, b: T) => number }

export type BulkContext = { selectedIds: string[]; clear: () => void }
/** `next` (#257 spec 3.5 "After a decision"): opens the row after the open one, wrapping to the
 * first; null when no other row is left — the result strip's *Next to approve* reads it. */
export type PaneHelpers = { close: () => void; refresh: () => void; next: (() => void) | null }

/** Tailwind needs the literal class strings in source — a `${below}:hidden` template would never
 * be generated — so the two breakpoints the card mode supports each carry their own set. */
const BELOW = {
  md: { hideBelow: "hidden md:contents", hideBelowInline: "hidden md:inline-flex", hideAbove: "md:hidden", h1: "text-xl md:text-lg", showBelowOnly: "md:hidden", table: "hidden md:table", titleAbove: "hidden md:inline" },
  lg: { hideBelow: "hidden lg:contents", hideBelowInline: "hidden lg:inline-flex", hideAbove: "lg:hidden", h1: "text-xl lg:text-lg", showBelowOnly: "lg:hidden", table: "hidden lg:table", titleAbove: "hidden lg:inline" },
} as const

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
  /** The row's name as the Detail pane header shows it (#259): `title` is who/what, `suffix` the
   * number · amount. The row's `aria-label` and its checkbox label are built from the same pair. */
  rowName: (row: T) => PaneName
  /** The pane header's Status line (#259): the row's state pills. Comes from the row, not the
   * loaded content, so it never skeletons. Omit it (Payment Batches) and the line is gone. */
  paneStatus?: (row: T) => ReactNode
  /** Where the ⋯'s *Open in a new tab* goes. Defaults to `${basePath}/${detailId}?full=1`. */
  fullHref?: (row: T) => string
  /** Archive/Unarchive toast copy for queues with a Closed facet ("Archived — now under Closed"). */
  archivedToast?: { archived: string; unarchived: string }
  /** The processing-state mark at the row's leading edge (CONTEXT.md "Processing state"). */
  leading?: (row: T) => ReactNode
  columns: QueueColumn<T>[]
  /** #252: the workspace's saved field table for this queue's type, or null when none is saved.
   * Orders the field columns, drops Hidden ones and applies the width. */
  fieldTable?: FieldTable | null
  /** Renders the bulk-selection checkbox column. Off for surfaces with no bulk actions. */
  selectable?: boolean
  sortOptions?: SortOption<T>[]
  facets?: Facet[]
  views?: ReactNode
  /** One inline figure at the right end of row 1 (#186's metric; #205's band is gone). */
  stat?: ReactNode
  /** #229 Q8 (#251): one metric band above header row 1 — Bill Pay's *Open invoices by age*.
   * The one documented exception to #225's "no band": aging is the payer's question and lives
   * where the payer works. Absent everywhere else. */
  band?: ReactNode
  /** Additional overflow-menu items, rendered after Override Mode and Export. */
  menu?: ReactNode
  onExportAll?: () => Promise<void>
  /** The bulk action bar's contents — the surface's own buttons and dialogs. */
  bulkActions?: (context: BulkContext) => ReactNode
  /** `action` renders under the body of the *unfiltered* empty state — Approvals' "N waiting on
   * other approvers" link (#257 spec 3.6). `filteredAction` under the filtered one (Clear filters). */
  empty: { title: string; body: string; filteredTitle?: string; filteredBody?: string; action?: ReactNode; filteredAction?: ReactNode }
  loadDetail: (documentId: string) => Promise<ReactNode | null>
  paneActions?: (row: T, helpers: PaneHelpers) => ReactNode
  paneMenu?: (row: T, helpers: PaneHelpers) => ReactNode
  /** A deep link (`/invoices/<id>`) opens the queue with that row selected and the pane open. */
  initialSelectedId?: string | null
  /** The URL search param the sort is read from and written to. Defaults to `sort`. */
  sortParam?: string
  /** #257 S2: a card `<ul>` rendering mode below the given breakpoint, shared by every caller
   * that needs one instead of the horizontally-scrolling table (`below: "lg"` for Approvals,
   * `below: "md"` for #261's other queues) — one shell primitive, not a second list component
   * (B4). The table still renders at and above the breakpoint. */
  cards?: {
    below: "md" | "lg"
    /** The h1 below the breakpoint ("Ready to Approve"); desktop keeps `title`. */
    title?: string
    render: (row: T, state: { isOpen: boolean; open: () => void }) => ReactNode
  }
  /** #257 spec 3.4: the queue's own facet predicate, applied to `rows` before the sort — so the
   * Filter sheet's "Show n rows" counts from the same array the list renders and the empty
   * state can say how many rows the filters hid. Pages that pass it hand over *all* rows. */
  filterRows?: (rows: T[], params: URLSearchParams) => T[]
  /** #257 spec 3.5: a row the surface just decided, kept in the list while its pane is open so
   * the result strip shows there instead of #249's close-with-toast. Dropped on close. */
  pinned?: T | null
  /** #257 spec 3.6: a deep link to a row this view no longer holds (already decided) — the line
   * to show above the list, since the model cannot load a decided row into the pane. */
  initialMissingNotice?: string
  /** Fires with the open row's id whenever the pane opens on another row or closes — the surface
   * uses it to drop a result strip (#257 spec 3.5) that belongs to the row that was decided. */
  onOpenChange?: (id: string | null) => void
  /** #257 S2: content-only rendering for a queue deep-linked to below its card breakpoint before
   * its own cards ship (#261) — no bulk bar, no row actions, no pane decision bar; the table stays,
   * with a line above it naming it read-only on a phone. */
  phoneReadOnly?: boolean
}

const INTERACTIVE = "a, button, input, select, textarea, label, [role=button], [contenteditable=true]"

function QueueScreenInner<T>({
  title, basePath, rows, rowId, detailIdFor, rowName, paneStatus, fullHref, archivedToast, leading, columns: rawColumns, fieldTable = null, selectable = false, sortOptions = [], facets = [],
  views, stat, band, menu, onExportAll, bulkActions, empty, loadDetail, paneActions, paneMenu, initialSelectedId = null, sortParam = "sort", cards, phoneReadOnly = false,
  filterRows, pinned = null, initialMissingNotice, onOpenChange,
}: QueueScreenProps<T>) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const overrideMode = useOverrideMode()
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [openId, setOpenId] = useState<string | null>(initialSelectedId)
  const [reloadKey, setReloadKey] = useState(0)
  // Reported once per change of the open row, not on every render of a new callback identity.
  const reportedOpenId = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    if (reportedOpenId.current === openId) return
    reportedOpenId.current = openId
    onOpenChange?.(openId)
  }, [openId, onOpenChange])
  const [menuOpen, setMenuOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRefs = useRef<Map<string, HTMLButtonElement>>(new Map())
  const below = cards ? BELOW[cards.below] : null

  // A deep link to a row the view no longer holds (decided since the link was made): say so once,
  // above the list, rather than opening a pane on nothing. Read at mount only.
  const [missingNotice] = useState<string | null>(() =>
    initialSelectedId && initialMissingNotice && !rows.some((row) => rowId(row) === initialSelectedId) ? initialMissingNotice : null)

  const sortKey = searchParams.get(sortParam)
  const activeSort = sortOptions.find((option) => option.key === sortKey) ?? sortOptions[0] ?? null
  const visibleRows = useMemo(() => (filterRows ? filterRows(rows, searchParams) : rows), [rows, filterRows, searchParams])
  const sortedRows = useMemo(() => {
    const base = activeSort ? [...visibleRows].sort(activeSort.compare) : visibleRows
    // The decided row stays in the list, at its place or the end, while its pane is open.
    if (pinned && openId === rowId(pinned) && !base.some((row) => rowId(row) === openId)) return [...base, pinned]
    return base
  }, [visibleRows, activeSort, pinned, openId, rowId])

  const ids = useMemo(() => sortedRows.map(rowId), [sortedRows, rowId])
  const openIndex = openId ? ids.indexOf(openId) : -1
  const openRow = openIndex >= 0 ? sortedRows[openIndex] : null
  const filtered = facets.some((facet) => searchParams.get(facet.param))
  const hiddenByFilters = rows.length - visibleRows.length

  // Reflect the open row in the URL so a refresh, a share, or Back lands on the same state — the
  // `${basePath}/${id}` route renders this same queue with `initialSelectedId` set. replaceState
  // rather than push: arrowing through fifty rows must not leave fifty history entries.
  // #257: below `lg` the Detail pane is a full-screen sheet, so opening one is a navigation, not
  // a refinement — it gets its own history entry (Back/the phone gesture must close it). At `lg`+
  // the pane sits beside the table, so arrowing through rows still replaces in place.
  const syncUrl = useCallback((id: string | null, push: boolean) => {
    if (typeof window === "undefined") return
    const qs = window.location.search
    const url = `${id ? `${basePath}/${id}` : basePath}${qs}`
    if (push) window.history.pushState(window.history.state, "", url)
    else window.history.replaceState(window.history.state, "", url)
  }, [basePath])

  // Opening another row or closing the pane unmounts whatever is in it; unsaved work there
  // (Match manually's pending line matches, #250) gets one chance to say so.
  // True while the open pane owns a history entry of its own (phone lane, opened from the list —
  // not from a deep link, which has no entry to pop).
  const [pushed, setPushed] = useState(false)
  const open = useCallback((id: string) => {
    if (!confirmLeave()) return
    const push = isPhoneLane() && openId === null
    setOpenId(id)
    syncUrl(id, push)
    if (push) setPushed(true)
  }, [syncUrl, openId])
  // Closing returns focus to the row that was open — recorded as state and applied in an effect
  // once the pane has unmounted, so `close` itself stays free of DOM refs.
  const [focusReturn, setFocusReturn] = useState<string | null>(null)
  const close = useCallback((fromPopstate = false) => {
    if (!fromPopstate && !confirmLeave()) return
    // The pane pushed its own entry: pop it, so the phone's Back gesture and the pane's Back
    // control leave the same history behind; the popstate handler below finishes the close.
    if (!fromPopstate && pushed) { setPushed(false); window.history.back(); return }
    setPushed(false)
    setFocusReturn(openId)
    setOpenId(null)
    // A popstate-driven close already moved history back; pushing/replacing here would fight it.
    if (!fromPopstate) syncUrl(null, false)
  }, [openId, pushed, syncUrl])
  // Back, the browser's own gesture, or the pane's Back control (`history.back()`) all arrive as
  // popstate — close the pane to match, without touching history a second time.
  useEffect(() => {
    const onPopState = () => { if (openId !== null && isPhoneLane()) close(true) }
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [openId, close])
  useEffect(() => {
    if (openId !== null || !focusReturn) return
    // Table rows register a ref, but below the card breakpoint the table is `display: none` and
    // the surface's own card `<a>` is what the operator left from — focus whichever is rendered.
    const trigger = triggerRefs.current.get(focusReturn)
    const el = trigger && trigger.offsetParent !== null
      ? trigger
      : rootRef.current?.querySelector<HTMLElement>(`[data-row-id="${focusReturn}"] a, [data-row-id="${focusReturn}"] button`)
    el?.focus()
  }, [openId, focusReturn])
  const step = useCallback((delta: 1 | -1) => {
    if (openIndex < 0) return
    const next = ids[openIndex + delta]
    if (next) open(next)
  }, [ids, openIndex, open])

  // The row a deep link asked for may have been filtered out or deleted; don't hold a pane open
  // on nothing. Derived, not synced: `openRow` is already null in that case, and the URL is
  // corrected the next time the operator opens or closes a row.

  // #249: the row *behind an already-open pane* leaving the filtered set — typically the row's
  // own Approve/Resolve action moving it out of the view it was opened from — is a different case
  // from the deep-link one above and needs its own cleanup: `close()` so the URL and column
  // widths reset, plus a toast, since the pane otherwise just vanishes with no explanation beyond
  // whatever toast the action itself already fired. Skipped on first render (`prevIds` still
  // null) so a stale deep link stays silent, per the comment above.
  const prevIdsRef = useRef<string[] | null>(null)
  useEffect(() => {
    const prevIds = prevIdsRef.current
    if (prevIds && openId && prevIds.includes(openId) && !ids.includes(openId)) {
      toast.info("Closed — this row no longer matches the current view.")
      close()
    }
    prevIdsRef.current = ids
  }, [ids, openId, close])

  // ↑/↓ move the selection and Escape closes, from anywhere on the screen except inside a field
  // the operator is typing in.
  useEffect(() => {
    if (!openId) return
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest("input, textarea, select, [contenteditable=true], [role=alertdialog], [role=listbox], [role=menu], [role=radiogroup]")) return
      // Below `lg` the Detail pane is itself a modal dialog; only an inner `Dialog` keeps Escape.
      if (target?.closest("[role=dialog]")?.closest("[data-inner]")) return
      // A modal is open somewhere on the page: its own Escape wins, the queue stays put (#251).
      // `[data-inner]` marks a `Dialog` (Filter/Reject/Approve/Override sheet) specifically — the
      // full-screen Detail pane sheet carries no such attribute, so Escape still closes *that*
      // one when no inner Dialog sits on top of it (#257's history model).
      if (document.querySelector("[data-inner] [role=dialog][aria-modal=true], [data-inner] [role=alertdialog][aria-modal=true]")) return
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

  const columns = useMemo(() => orderColumnsByFieldTable(rawColumns, fieldTable).map((column) => {
    const width = widthClassFor(fieldTable, column.fieldKey)
    return width ? { ...column, className: `${column.className ?? ""} ${width}` } : column
  }), [rawColumns, fieldTable])
  const visibleColumns = openId ? columns.filter((column) => column.narrow) : columns
  const refresh = useCallback(() => { setReloadKey((k) => k + 1); router.refresh() }, [router])
  // The row after the open one, wrapping; the open (possibly pinned, already decided) row itself
  // is never the answer.
  const next = useMemo<(() => void) | null>(() => {
    if (openIndex < 0) return null
    const after = [...ids.slice(openIndex + 1), ...ids.slice(0, openIndex)].find((id) => id !== openId)
    return after ? () => open(after) : null
  }, [ids, openIndex, openId, open])
  const helpers = useMemo<PaneHelpers>(() => ({ close, refresh, next }), [close, refresh, next])

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
    {/* Bill Pay's metric band sits above row 1; a card-mode queue's band (Approvals' segments) sits
        under the title so the phone reads title → segments → Filter → list (#257 spec 3.3). */}
    {!cards && band}
    {/* Row 1: title · Views · Sort · filters · stat · menu */}
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-200 px-4 py-2">
      <h1 className={`flex items-baseline gap-2 ${below ? below.h1 : "text-lg"} font-semibold tracking-tight text-slate-900`}>
        {below && cards?.title ? <><span className={below.hideAbove}>{cards.title}</span><span className={below.titleAbove}>{title}</span></> : title}
        <span className="text-sm font-normal tabular-nums text-slate-500" aria-live="polite" aria-label={`${sortedRows.length} rows`}>{sortedRows.length}</span>
      </h1>
      <span className={below ? below.hideBelow : "contents"}>{views}</span>
      {sortOptions.length > 1 && <label className={`${below ? below.hideBelowInline : "inline-flex"} h-8 items-center gap-1 rounded-md border border-slate-300 bg-white pl-2 pr-1 text-xs font-medium text-slate-700 focus-within:ring-2 focus-within:ring-emerald-600 focus-within:ring-offset-1`}>
        <ArrowUpDown className="h-3.5 w-3.5 text-slate-500" aria-hidden />
        <span className="sr-only">Sort by</span>
        <select value={activeSort?.key} onChange={(event) => setSort(event.target.value)} className="h-full cursor-pointer appearance-none bg-transparent pr-1 text-xs font-medium text-slate-700 focus:outline-none">
          {sortOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
        </select>
      </label>}
      {facets.length > 0 && <span className={below ? below.hideBelow : "contents"}><FacetFilters facets={facets} /></span>}
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

    {cards && band}
    {/* #257 spec 3.4: below the card breakpoint the sort select and facet chips give way to one
        Filter button and its sheet — the same params, one place to change them. */}
    {below && (facets.length > 0 || sortOptions.length > 1) && <div className={`${below.showBelowOnly} flex items-center gap-2 border-b border-slate-200 px-4 py-2`}>
      <FilterButton facets={facets} sortParam={sortParam} defaultSortKey={sortOptions[0]?.key ?? null} onClick={() => setFilterOpen(true)} />
      <FilterSheet open={filterOpen} onClose={() => setFilterOpen(false)} facets={facets} sortOptions={sortOptions} sortParam={sortParam} rows={rows} filterRows={filterRows} />
    </div>}
    {missingNotice && <p role="status" className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-[13px] text-slate-700">{missingNotice}</p>}

    {/* Override Mode banner — only while the mode is on (#203's permanent strip is gone). */}
    {overrideMode.active && <div role="status" className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-xs font-medium text-amber-900">
      <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" aria-hidden />Override Mode is on. Open a row&apos;s Checks tab to override a soft check with a reason.</span>
      <button type="button" onClick={overrideMode.toggle} className="rounded-md border border-amber-300 bg-white px-2 py-0.5 text-xs font-medium text-amber-900 hover:bg-amber-100">Turn off</button>
    </div>}

    {/* Bulk action bar: its own row above the table head once anything is checked. */}
    {!phoneReadOnly && selectable && bulkActions && checkedIds.length > 0 && <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2 text-sm" role="region" aria-label="Bulk actions">
      <span className="mr-1 font-medium tabular-nums text-slate-800">{checkedIds.length} selected</span>
      {bulkActions({ selectedIds: checkedIds, clear: clearChecked })}
      <button type="button" onClick={clearChecked} className="ml-auto text-xs font-medium text-slate-600 hover:text-slate-900">Clear selection</button>
    </div>}

    <div className="flex min-h-0 flex-1 md:overflow-hidden">
      <div className={`min-w-0 flex-1 md:overflow-auto ${openId ? "lg:shadow-[inset_-1px_0_0_0_rgb(226_232_240)]" : ""}`}>
        {phoneReadOnly && <p className={`px-4 py-2 text-[13px] text-slate-600 ${below ? below.hideAbove : "lg:hidden"}`}>Full view on desktop — this list is read-only on a phone.</p>}
        {sortedRows.length === 0
          ? <div className="mx-auto max-w-md px-6 py-16 text-center">
            <p className="text-sm font-medium text-slate-800">{filtered ? empty.filteredTitle ?? "Nothing matches these filters." : empty.title}</p>
            <p className="mt-1 text-sm text-slate-600">{filtered
              ? empty.filteredBody ?? (hiddenByFilters > 0 ? `${hiddenByFilters} ${hiddenByFilters === 1 ? "row is" : "rows are"} hidden by the filters.` : "Clear a filter to widen the queue.")
              : empty.body}</p>
            {(filtered ? empty.filteredAction : empty.action) && <div className="mt-3 text-sm">{filtered ? empty.filteredAction : empty.action}</div>}
          </div>
          : <>
          {below && cards && <ul aria-label={cards.title ?? title} className={below.hideAbove}>
            {sortedRows.map((row) => {
              const id = rowId(row)
              const isOpen = id === openId
              return <li key={id} data-row-id={id} className="border-b border-slate-200 last:border-b-0">
                {cards.render(row, { isOpen, open: () => (isOpen ? close() : open(id)) })}
              </li>
            })}
          </ul>}
          <table className={`w-full text-sm ${below ? below.table : ""} ${openId ? "" : "min-w-[720px]"}`}>
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
                    <input type="checkbox" aria-label={`Select ${rowName(row).title}`} checked={isChecked} onChange={() => toggleChecked(id)} className="h-4 w-4 rounded border-slate-300 accent-emerald-700" />
                  </td>}
                  {leading && <td className="px-1 py-0">{leading(row)}</td>}
                  {visibleColumns.map((column, columnIndex) => <td key={column.key} className={`px-3 py-0 ${column.className ?? ""} ${isOpen && columnIndex === 0 ? "relative before:absolute before:inset-y-2 before:-left-px before:w-[3px] before:rounded-full before:bg-emerald-700" : ""}`}>
                    {columnIndex === 0
                      ? <button type="button" ref={(el) => { if (el) triggerRefs.current.set(id, el); else triggerRefs.current.delete(id) }}
                        aria-expanded={isOpen} aria-controls={DETAIL_PANE_ID}
                        aria-label={[rowName(row).title, rowName(row).suffix].filter(Boolean).join(" · ")}
                        onClick={() => (isOpen ? close() : open(id))}
                        className="block w-full min-w-0 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2">
                        {column.render(row)}
                      </button>
                      : column.render(row)}
                  </td>)}
                </tr>
              })}
            </tbody>
          </table>
          </>}
      </div>

      {openRow && <DetailPane
        documentId={(detailIdFor ?? rowId)(openRow)}
        name={rowName(openRow)}
        status={paneStatus?.(openRow)}
        fullHref={fullHref ? fullHref(openRow) : `${basePath}/${(detailIdFor ?? rowId)(openRow)}?full=1`}
        archivedToast={archivedToast}
        onMutated={(kind) => { if (kind === "removed") { close(); router.refresh() } else refresh() }}
        position={{ index: openIndex + 1, total: sortedRows.length }}
        onClose={() => close()}
        backLabel={`Back to ${cards?.title ?? title}`}
        onPrev={openIndex > 0 ? () => step(-1) : null}
        onNext={openIndex < sortedRows.length - 1 ? () => step(1) : null}
        loadDetail={loadDetail}
        actions={paneActions?.(openRow, helpers)}
        menu={paneMenu?.(openRow, helpers)}
        reloadKey={reloadKey} />}
    </div>
  </div>
}
