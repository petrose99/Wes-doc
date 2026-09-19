"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react"
import { ArrowUpDown, Download, MoreHorizontal, Search, ShieldAlert, ShieldCheck } from "lucide-react"
import { toast } from "sonner"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { DetailPane, DETAIL_PANE_ID, type PaneName } from "@/components/queue/detail-pane"
import { FacetFilters, type Facet } from "@/components/queue/facet-filters"
import { FilterButton, FilterSheet } from "@/components/queue/filter-sheet"
import Link from "next/link"
import { OverrideModeProvider, useOverrideMode } from "@/components/queue/override-mode-context"
import { OriginStrip } from "@/components/queue/origin-strip"
import { QueueCard, joinSegments } from "@/components/queue/queue-card"
import { QueueEmpty } from "@/components/queue/queue-empty"
import { withOrigin, type Origin } from "@/lib/navigation/origin"
import { emptyQueueState } from "@/lib/queue/empty-state"
import { clearFilterParams } from "@/lib/queue/filters"
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
  /** #261: which slot of the phone card this column feeds below the card breakpoint. Columns
   * without one are table-only. `title` takes the first such column; `subtitle` and `pill`
   * collect every column in order. */
  phone?: "title" | "trailing" | "subtitle" | "pill"
  /** #261: card-specific rendering when `render` carries desktop-only chrome (TitleCell's filename
   * subtitle, a confidence field). Defaults to `render`. */
  phoneRender?: (row: T) => ReactNode
  /** #261: hidden between the card breakpoint and `lg` (`hidden lg:table-cell`) so the table fits
   * a tablet without the retired horizontal scroller. */
  priority?: "low"
}

export type SortOption<T> = { key: string; label: string; compare: (a: T, b: T) => number }

export type BulkContext = { selectedIds: string[]; clear: () => void }
/** `next` (#257 spec 3.5 "After a decision"): opens the row after the open one, wrapping to the
 * first; null when no other row is left — the result strip's *Next to approve* reads it. */
export type PaneHelpers = { close: () => void; refresh: () => void; next: (() => void) | null }
/** #273: handles a surface-owned dialog (rendered beside the screen, not inside a callback) needs
 * after a mutation — re-read the open pane + rows, and re-scope the selection. */
export type QueueControls = { refresh: () => void; select: (ids: string[]) => void }

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
  /** #285/#286: an Admin queue's one primary button (Invite a user, Add a company), rendered at the
   * right end of row 1 before `stat`. Absent on the document queues. */
  primaryAction?: ReactNode
  /** #285/#286: Override Mode has no meaning on an Admin list (no soft checks); `false` hides the
   * menu item and the banner. The provider stays mounted so the pane's consumers keep working. */
  overrideMode?: boolean
  /** #286: one free-text filter on the facet row (≥ md) and in the Filter sheet (< md), read and
   * written on `param`; `filterRows` does the matching. Clear filters clears it too. */
  search?: { param: string; label: string }
  /** #229 Q8 (#251): one metric band above header row 1 — Bill Pay's *Open invoices by age*.
   * The one documented exception to #225's "no band": aging is the payer's question and lives
   * where the payer works. Absent everywhere else. */
  band?: ReactNode
  /** #281 spec.md §6: the queue-scoped connection-failure band (`ConnectionBand`) — amber, static,
   * rendered right after `origin` and before the metric `band`. Absent (`undefined`/`null`) on
   * every queue that never posts. */
  connectionBand?: ReactNode
  /** Additional overflow-menu items, rendered after Override Mode and Export. */
  menu?: ReactNode
  onExportAll?: () => Promise<void>
  /** The bulk action bar's contents — the surface's own buttons and dialogs. */
  bulkActions?: (context: BulkContext) => ReactNode
  /** #264 spec §4: three empty states, one prop. `firstUse` renders only while the *workspace*
   * (not just this view) has never held a document; queues that omit it fall straight to `done`,
   * the#257/#261 behaviour unchanged. `done.action` is Approvals' "N waiting on other approvers"
   * link (#257 spec 3.6). `filteredAction` renders under the filtered state (Clear filters). */
  empty: {
    firstUse?: { title: string; body: string; action?: ReactNode; phoneAction?: ReactNode }
    done?: { title?: string; body?: string; action?: ReactNode }
    filteredTitle?: string; filteredBody?: string; filteredAction?: ReactNode
  }
  /** #264 spec §2: has this *workspace* (any type, any status) ever held a document — decides
   * first-use vs. done. Omit it (Payments) and first-use never renders, matching pre-#264 behaviour. */
  workspaceDocumentCount?: number
  loadDetail: (documentId: string) => Promise<ReactNode | null>
  paneActions?: (row: T, helpers: PaneHelpers) => ReactNode
  paneMenu?: (row: T, helpers: PaneHelpers) => ReactNode
  /** #273: hands the screen's refresh/select handles up once they exist (see `QueueControls`). */
  onControls?: (controls: QueueControls) => void
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
    /** A bespoke card. Omit it (#261) and the screen renders `QueueCard` from the columns'
     * `phone` slots — the default every queue takes. */
    render?: (row: T, state: { isOpen: boolean; open: () => void }) => ReactNode
    /** The slot card's accessible name (comma-separated). Defaults to `rowName` title, suffix. */
    label?: (row: T) => string
    /** Two-line subtitle on the slot card (Exceptions' check message). */
    subtitleClamp?: boolean
  }
  /** #261: the Views control for the phone filter row (`SavedViewPicker variant="select"`) —
   * `views` itself is hidden below the card breakpoint. */
  viewsPhone?: ReactNode
  /** #257 spec 3.4: the queue's own facet predicate, applied to `rows` before the sort — so the
   * Filter sheet's "Show n rows" counts from the same array the list renders and the empty
   * state can say how many rows the filters hid. Pages that pass it hand over *all* rows. */
  filterRows?: (rows: T[], params: URLSearchParams) => T[]
  /** #257 spec 3.5: a row the surface just decided, kept in the list while its pane is open so
   * the result strip shows there instead of #249's close-with-toast. Dropped on close. */
  pinned?: T | null
  /** #268 spec §2.5: a deep link to a row this view no longer holds — filtered out, moved to
   * another queue, or deleted — the line to show above the list, since the model cannot load a
   * missing row into the pane. `showHref` renders a "Show it" link when the row can still be
   * found somewhere. */
  initialMissing?: { text: string; showHref?: string; name?: string }
  /** #268 spec §2.1–2.4: the cross-surface hop this queue was opened from, or null. Rendered as
   * the one Origin link, first in `#main`'s tab order, before `band`. */
  origin?: Origin | null
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
  views, viewsPhone, stat, primaryAction, overrideMode: overrideModeEnabled = true, search, band, connectionBand, menu, onExportAll, bulkActions, empty, workspaceDocumentCount = 0, loadDetail, paneActions, paneMenu, initialSelectedId = null, sortParam = "sort", cards, phoneReadOnly = false,
  filterRows, pinned = null, initialMissing, onOpenChange, origin = null, onControls,
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
  const hereQuery = searchParams.toString()
  const here = hereQuery ? `${pathname}?${hereQuery}` : pathname

  // #262: the roving tab stop — one row button carries tabIndex=0, everything else -1, so Tab
  // leaves the table in one hop instead of walking every row. The open row wins; failing that,
  // whichever row was last focused in this mount; failing that, the first row (spec §3.1).
  const [lastFocusedRowId, setLastFocusedRowId] = useState<string | null>(null)
  // #262: flags the layout's "Skip to the list" link as reachable — set while this queue is
  // mounted, cleared on unmount, read by the link via a `[data-queue-list]` CSS selector.
  useLayoutEffect(() => {
    document.body.dataset.queueList = "1"
    return () => { delete document.body.dataset.queueList }
  }, [])

  // A deep link to a row the view no longer holds (decided since the link was made, or handed to
  // us by the server as already gone): say so once, above the list, rather than opening a pane on
  // nothing. Read at mount only. #268 spec §2.5 case 1: a row still in `rows` but filtered out of
  // `visibleRows` is a client-derived variant of the same notice, computed below instead.
  const [missingNotice] = useState<typeof initialMissing>(() =>
    initialMissing && (!initialSelectedId || !rows.some((row) => rowId(row) === initialSelectedId)) ? initialMissing : undefined)

  const sortKey = searchParams.get(sortParam)
  const activeSort = sortOptions.find((option) => option.key === sortKey) ?? sortOptions[0] ?? null
  const visibleRows = useMemo(() => (filterRows ? filterRows(rows, searchParams) : rows), [rows, filterRows, searchParams])
  // #268 spec §2.5 case 1: the deep-linked row exists but the current filters hide it — named
  // from `rows` (the row is still known), href drops every query param so the operator sees it
  // unfiltered.
  const filteredNotice = useMemo(() => {
    if (!initialSelectedId) return undefined
    const row = rows.find((r) => rowId(r) === initialSelectedId)
    if (!row || visibleRows.some((r) => rowId(r) === initialSelectedId)) return undefined
    const { title, suffix } = rowName(row)
    const name = [title, suffix].filter(Boolean).join(" ")
    return { text: `${[title, suffix].filter(Boolean).join(" · ")} no longer matches these filters.`, showHref: `${basePath}/${initialSelectedId}`, name }
  }, [initialSelectedId, rows, visibleRows, rowId, rowName, basePath])
  // The notice belongs to the row the URL addressed at arrival; opening another row clears it (spec §2.5).
  const activeNotice = openId && openId !== initialSelectedId ? undefined : (filteredNotice ?? missingNotice)
  const sortedRows = useMemo(() => {
    const base = activeSort ? [...visibleRows].sort(activeSort.compare) : visibleRows
    // The decided row stays in the list, at its place or the end, while its pane is open.
    if (pinned && openId === rowId(pinned) && !base.some((row) => rowId(row) === openId)) return [...base, pinned]
    return base
  }, [visibleRows, activeSort, pinned, openId, rowId])

  const ids = useMemo(() => sortedRows.map(rowId), [sortedRows, rowId])
  const openIndex = openId ? ids.indexOf(openId) : -1
  const openRow = openIndex >= 0 ? sortedRows[openIndex] : null
  const rovingId = openId ?? (lastFocusedRowId && ids.includes(lastFocusedRowId) ? lastFocusedRowId : ids[0]) ?? null

  const focusRow = useCallback((id: string | undefined | null) => {
    // #264 spec §8: the list is empty — focus its heading, not the queue's own h1, so the arrival
    // lands on the thing actually explaining the screen.
    if (!id) { (document.getElementById("queue-empty-title") ?? document.getElementById("queue-title"))?.focus(); return }
    const button = triggerRefs.current.get(id)
    button?.focus()
    button?.scrollIntoView({ block: "nearest" })
  }, [])
  const focusCheckbox = useCallback((id: string | undefined | null) => {
    if (!id) return
    rootRef.current?.querySelector<HTMLElement>(`tr[data-row-id="${id}"] input[type=checkbox]`)?.focus()
  }, [])

  // #262 arrival focus (spec §3.2): a `g` jump, `/`, or the "Skip to the list" link writes this
  // flag before navigating; consumed here once the rows (or the empty state) have rendered, then
  // removed so a later render of the same screen doesn't refire it.
  useEffect(() => {
    if (typeof window === "undefined") return
    if (window.sessionStorage.getItem("docubite.pendingFocus") !== "rows") return
    window.sessionStorage.removeItem("docubite.pendingFocus")
    focusRow(openId ?? ids[0] ?? null)
  }, [ids, openId, focusRow])
  // Same-route `g` jump (already on the destination): the host dispatches this instead of
  // `router.push`-ing to where we already are.
  useEffect(() => {
    const onFocusRows = () => focusRow(openId ?? ids[0] ?? null)
    window.addEventListener("docubite:focus-rows", onFocusRows)
    return () => window.removeEventListener("docubite:focus-rows", onFocusRows)
  }, [ids, openId, focusRow])
  const extraParams = useMemo(() => (search ? [search.param] : []), [search])
  const filtered = facets.some((facet) => searchParams.get(facet.param)) || extraParams.some((param) => (searchParams.get(param) ?? "").trim() !== "")
  // #286: the search input writes its param on a short debounce (replace, not push — typing is
  // not history). Local state keeps the keystrokes; the URL is the truth the list filters on.
  const [searchDraft, setSearchDraft] = useState(() => (search ? searchParams.get(search.param) ?? "" : ""))
  const urlSearch = search ? searchParams.get(search.param) ?? "" : ""
  useEffect(() => { setSearchDraft(urlSearch) }, [urlSearch])
  const commitSearch = useCallback((value: string) => {
    if (!search) return
    const next = new URLSearchParams(window.location.search)
    if (value.trim() === "") next.delete(search.param); else next.set(search.param, value)
    const qs = next.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname)
  }, [search, router, pathname])
  useEffect(() => {
    if (!search || searchDraft === urlSearch) return
    const timer = window.setTimeout(() => commitSearch(searchDraft), 200)
    return () => window.clearTimeout(timer)
  }, [search, searchDraft, urlSearch, commitSearch])
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
  useEffect(() => { onControls?.({ refresh, select: (next) => setChecked(new Set(next)) }) }, [onControls, refresh])

  const setSort = (key: string) => {
    const next = new URLSearchParams(searchParams.toString())
    if (key === sortOptions[0]?.key) next.delete(sortParam); else next.set(sortParam, key)
    const qs = next.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }

  // #261 spec §6: the filtered-empty state's default Clear filters. The button unmounts with the
  // empty state, so focus is handed to the first control that still explains the list: the phone
  // Filters button, the first header chip, else the queue title — never body (critic D3).
  const clearFilters = () => {
    const qs = clearFilterParams(searchParams, facets, sortParam, extraParams).toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
    const root = rootRef.current
    const candidates = ["#queue-filters-trigger", "#queue-facets button", "#queue-title"]
    for (const selector of candidates) {
      const el = root?.querySelector<HTMLElement>(selector)
      if (el && el.offsetParent !== null) { el.focus(); return }
    }
  }
  /** #261: the card slot a column feeds, rendered with `phoneRender` when the cell carries
   * desktop-only chrome. */
  const phoneSlot = (row: T, slot: NonNullable<QueueColumn<T>["phone"]>) =>
    columns.filter((column) => column.phone === slot).map((column) => (column.phoneRender ?? column.render)(row)).filter((node) => node !== null && node !== undefined && node !== false && node !== "")
  const cardLabel = (row: T) => cards?.label ? cards.label(row) : [rowName(row).title, rowName(row).suffix].filter(Boolean).join(", ")
  const lowPriority = (column: QueueColumn<T>) => (column.priority === "low" ? "hidden lg:table-cell" : "")

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
    {/* #268 spec §2.1–2.4: the cross-surface hop's way back — first focusable in `#main`, above
        even the metric band. */}
    <OriginStrip origin={origin} />
    {connectionBand}
    {/* Bill Pay's metric band sits above row 1; a card-mode queue's band (Approvals' segments) sits
        under the title so the phone reads title → segments → Filter → list (#257 spec 3.3). */}
    {!cards && band}
    {/* Row 1: title · Views · Sort · filters · stat · menu */}
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-200 px-4 py-2">
      <h1 id="queue-title" tabIndex={-1} className={`flex items-baseline gap-2 ${below ? below.h1 : "text-lg"} font-semibold tracking-tight text-slate-900 focus:outline-none`}>
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
      {facets.length > 0 && <span id="queue-facets" className={below ? below.hideBelow : "contents"}><FacetFilters facets={facets} sortParam={sortParam} extraParams={extraParams} /></span>}
      {search && <span className={`${below ? below.hideBelowInline : "inline-flex"} h-8 items-center gap-1 rounded-md border border-slate-300 bg-white pl-2 pr-1 text-xs font-medium text-slate-700 focus-within:ring-2 focus-within:ring-emerald-600 focus-within:ring-offset-1`}>
        <Search className="h-3.5 w-3.5 text-slate-500" aria-hidden />
        <input id="queue-search" type="search" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Escape" && searchDraft !== "") { event.preventDefault(); event.stopPropagation(); setSearchDraft(""); commitSearch("") } }}
          aria-label={search.label} placeholder={search.label} autoComplete="off"
          className="h-full w-44 bg-transparent pr-1 text-xs font-medium text-slate-700 placeholder:text-slate-500 focus:outline-none" />
      </span>}
      <div className="ml-auto flex items-center gap-2">
        {primaryAction}
        {stat}
        <Popover open={menuOpen} onOpenChange={setMenuOpen}>
          <PopoverTrigger asChild>
            <button type="button" aria-label="Queue options" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600">
              <MoreHorizontal className="h-4 w-4" aria-hidden />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 p-1" onClick={(event) => { if ((event.target as HTMLElement).closest("[data-menu-close]")) setMenuOpen(false) }}>
            {overrideModeEnabled && <button type="button" role="switch" aria-checked={overrideMode.active} onClick={overrideMode.toggle} data-menu-close
              className="flex w-full items-start gap-2.5 rounded-sm px-2.5 py-2 text-left text-sm text-slate-700 hover:bg-slate-100">
              {overrideMode.active ? <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden /> : <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden />}
              <span>
                <span className="block font-medium">{overrideMode.active ? "Turn off Override Mode" : "Turn on Override Mode"}</span>
                <span className="block text-xs text-slate-500">Lets you override soft checks (match, confidence, trust, workspace) with a reason. Duplicate, jurisdiction and SMB-ceiling checks never can be.</span>
              </span>
            </button>}
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
    {below && (facets.length > 0 || sortOptions.length > 1 || viewsPhone || search) && <div className={`${below.showBelowOnly} flex items-center gap-2 border-b border-slate-200 px-4 py-2`}>
      {viewsPhone}
      {(facets.length > 0 || sortOptions.length > 1 || search) && <>
        <FilterButton id="queue-filters-trigger" facets={facets} sortParam={sortParam} defaultSortKey={sortOptions[0]?.key ?? null} onClick={() => setFilterOpen(true)} extraParams={extraParams} />
        <FilterSheet open={filterOpen} onClose={() => setFilterOpen(false)} facets={facets} sortOptions={sortOptions} sortParam={sortParam} rows={rows} filterRows={filterRows} search={search} />
      </>}
    </div>}
    {activeNotice && <p role="status" className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-[13px] text-slate-700">
      {activeNotice.text}{activeNotice.showHref && <> <Link href={activeNotice.showHref} aria-label={activeNotice.name ? `Show ${activeNotice.name}` : "Show it"} className="font-medium text-slate-900 underline underline-offset-2">Show it</Link></>}
    </p>}

    {/* Override Mode banner — only while the mode is on (#203's permanent strip is gone). */}
    {overrideModeEnabled && overrideMode.active && <div role="status" className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-xs font-medium text-amber-900">
      <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" aria-hidden />Override Mode is on. Open a row&apos;s Checks tab to override a soft check with a reason.</span>
      <button type="button" onClick={overrideMode.toggle} className="rounded-md border border-amber-300 bg-white px-2 py-0.5 text-xs font-medium text-amber-900 hover:bg-amber-100 max-md:h-11 max-md:px-3">Turn off</button>
    </div>}

    {/* Bulk action bar: its own row above the table head once anything is checked. */}
    {!phoneReadOnly && selectable && bulkActions && checkedIds.length > 0 && <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2 text-sm" role="region" aria-label="Bulk actions">
      <span className="mr-1 font-medium tabular-nums text-slate-800">{checkedIds.length} selected</span>
      {bulkActions({ selectedIds: checkedIds, clear: clearChecked })}
      <button type="button" onClick={clearChecked} className="ml-auto text-xs font-medium text-slate-600 hover:text-slate-900">Clear selection</button>
    </div>}

    <div className="flex min-h-0 flex-1 md:overflow-hidden">
      <div id="queue-list" className={`min-w-0 flex-1 md:overflow-auto ${openId ? "lg:shadow-[inset_-1px_0_0_0_rgb(226_232_240)]" : ""}`}>
        {phoneReadOnly && <p className={`px-4 py-2 text-[13px] text-slate-600 ${below ? below.hideAbove : "lg:hidden"}`}>Full view on desktop — this list is read-only on a phone.</p>}
        {sortedRows.length === 0
          ? <QueueEmpty
            state={emptyQueueState({ workspaceDocumentCount, rowCount: sortedRows.length, filtered, hasFirstUse: !!empty.firstUse }) ?? "done"}
            firstUse={empty.firstUse} done={empty.done}
            filteredTitle={empty.filteredTitle} filteredBody={empty.filteredBody} filteredAction={empty.filteredAction}
            hiddenByFilters={hiddenByFilters} onClearFilters={clearFilters} />
          : <>
          {below && cards && <ul aria-label={cards.title ?? title} className={below.hideAbove}>
            {sortedRows.map((row) => {
              const id = rowId(row)
              const isOpen = id === openId
              const toggle = () => (isOpen ? close() : open(id))
              return <li key={id} data-row-id={id} className="border-b border-slate-200 last:border-b-0">
                {cards.render
                  ? cards.render(row, { isOpen, open: toggle })
                  : <QueueCard href={`${basePath}/${id}`} label={cardLabel(row)} isOpen={isOpen} onOpen={toggle} leading={leading?.(row)}
                    title={phoneSlot(row, "title")[0] ?? rowName(row).title}
                    trailing={phoneSlot(row, "trailing")[0]}
                    subtitle={(() => { const s = phoneSlot(row, "subtitle"); return s.length > 0 ? joinSegments(s) : null })()}
                    pill={(() => { const p = phoneSlot(row, "pill"); return p.length > 0 ? p.map((node, index) => <Fragment key={index}>{node}</Fragment>) : null })()}
                    subtitleClamp={cards.subtitleClamp} />}
              </li>
            })}
          </ul>}
          <table className={`w-full text-sm ${below ? below.table : ""}`}>
            <thead className="sticky top-0 z-10 bg-white shadow-[inset_0_-1px_0_0_theme(colors.slate.200)]">
              <tr className="text-left text-xs font-medium uppercase tracking-wide text-slate-600">
                {selectable && <th scope="col" className="w-10 px-3 py-2">
                  <input type="checkbox" aria-label={`Select all ${title.toLowerCase()}`} checked={allChecked} onChange={toggleAll} className="h-4 w-4 rounded border-slate-300 accent-emerald-700" />
                </th>}
                {leading && <th scope="col" className="w-8 px-1 py-2"><span className="sr-only">Mark</span></th>}
                {visibleColumns.map((column) => <th key={column.key} scope="col" className={`px-3 py-2 font-medium ${column.className ?? ""} ${lowPriority(column)}`}>{column.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row, index) => {
                const id = rowId(row)
                const isOpen = id === openId
                const isChecked = checked.has(id)
                // #262 roving tabindex (spec §3.1): ↓/↑ move the tab stop while the pane is closed
                // (the document-wide handler already moves it when a row is open, so this defers
                // to that — no double handling); Home/End always jump to the ends; ← hands off to
                // the row's own checkbox.
                const onRowKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
                  if (event.key === "ArrowDown" && openId === null) { event.preventDefault(); focusRow(ids[index + 1]) }
                  else if (event.key === "ArrowUp" && openId === null) { event.preventDefault(); focusRow(ids[index - 1]) }
                  else if (event.key === "Home") { event.preventDefault(); focusRow(ids[0]) }
                  else if (event.key === "End") { event.preventDefault(); focusRow(ids[ids.length - 1]) }
                  else if (event.key === "ArrowRight" && selectable) { event.preventDefault(); focusCheckbox(id) }
                }
                return <tr key={id} data-row-id={id} aria-current={isOpen ? "true" : undefined} style={{ height: 62 }}
                  className={`group cursor-pointer border-b border-slate-100 transition-colors ${isOpen ? "bg-emerald-50/60" : isChecked ? "bg-slate-50" : "hover:bg-slate-50"}`}
                  onClick={(event) => {
                    if ((event.target as HTMLElement).closest(INTERACTIVE)) return
                    if (isOpen) close(); else open(id)
                  }}>
                  {selectable && <td className="px-3 py-0">
                    <input type="checkbox" tabIndex={-1} aria-label={`Select ${rowName(row).title}`} checked={isChecked} onChange={() => toggleChecked(id)}
                      onKeyDown={(event) => {
                        if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); focusRow(id) }
                        else if (event.key === "ArrowDown") { event.preventDefault(); focusCheckbox(ids[index + 1]) }
                        else if (event.key === "ArrowUp") { event.preventDefault(); focusCheckbox(ids[index - 1]) }
                      }}
                      className="h-4 w-4 rounded border-slate-300 accent-emerald-700" />
                  </td>}
                  {leading && <td className="px-1 py-0">{leading(row)}</td>}
                  {visibleColumns.map((column, columnIndex) => <td key={column.key} className={`px-3 py-0 ${column.className ?? ""} ${lowPriority(column)} ${isOpen && columnIndex === 0 ? "relative before:absolute before:inset-y-2 before:-left-px before:w-[3px] before:rounded-full before:bg-emerald-700" : ""}`}>
                    {columnIndex === 0
                      ? <button type="button" ref={(el) => { if (el) triggerRefs.current.set(id, el); else triggerRefs.current.delete(id) }}
                        tabIndex={id === rovingId ? 0 : -1}
                        aria-expanded={isOpen} aria-controls={DETAIL_PANE_ID}
                        aria-label={[rowName(row).title, rowName(row).suffix].filter(Boolean).join(" · ")}
                        onClick={() => (isOpen ? close() : open(id))}
                        onFocus={() => setLastFocusedRowId(id)}
                        onKeyDown={onRowKeyDown}
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
        fullHref={withOrigin(fullHref ? fullHref(openRow) : `${basePath}/${(detailIdFor ?? rowId)(openRow)}?full=1`, here)}
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
