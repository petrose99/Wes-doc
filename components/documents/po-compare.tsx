"use client"

import type { LineCellStatus, LineMatch, LineMatchStatus } from "@/lib/matching/line-match"
import { descriptionSentence, quantitySentence, unitPriceSentence } from "@/lib/matching/line-match"
import { formatAmount, formatQuantity } from "@/lib/matching/format"
import type { PoLinkKind } from "@/lib/matching/po-link"
import { Equal, EqualNot, Link2Off, X } from "lucide-react"
import Link from "next/link"
import { withOrigin } from "@/lib/navigation/origin"
import { usePathname, useSearchParams } from "next/navigation"
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"

/** #228 / #250: the visible Line match. `=` and `≠` per cell (Q1, Q2), the sentence-first
 * breakdown (Q4), the line status words (Q3 — Check vocabulary as placeholders until #233 lands)
 * and the Purchase Orders chip (Q6, Q11). All of it reads one `LineMatch`, so the row, the pane
 * and the Purchase Orders column can never disagree about what is red. */

// 24px glyph, 44px hit area (the ::after extends the target without growing the mark).
const GLYPH_BASE = "relative inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-colors after:absolute after:-inset-2.5 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"

/** One compare glyph: a button named for what it says, so a screen reader hears the verdict and
 * the keyboard can open the breakdown. `not_compared` renders nothing — an absent glyph is the
 * honest state, not a third symbol. */
export function MatchGlyph({ status, label, onOpen, describedBy, expanded = false }: { status: LineCellStatus; label: string; onOpen: (anchor: HTMLElement) => void; describedBy?: string; expanded?: boolean }) {
  if (status === "not_compared") return null
  const mismatch = status === "mismatch"
  return <button type="button" onClick={(event) => onOpen(event.currentTarget)} aria-describedby={describedBy} aria-expanded={expanded}
    aria-label={`${mismatch ? "Does not match the PO" : "Matches the PO"}: ${label}. Show breakdown`}
    title={mismatch ? "Does not match the PO" : "Matches the PO"}
    className={`${GLYPH_BASE} ${mismatch ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100" : "border-emerald-200/70 bg-transparent text-emerald-700/80 hover:bg-emerald-50"}`}>
    {mismatch ? <EqualNot className="h-3.5 w-3.5" aria-hidden="true" /> : <Equal className="h-3.5 w-3.5" aria-hidden="true" />}
  </button>
}

/** #228 Q3 with #233's Check pair: Match / Mismatch for a compared line; "No PO line" is Q1's
 * own words for a line below the similarity threshold; "Not compared" is Q14's for a PO line
 * that carries nothing to compare. Two different facts, two different labels. */
export const LINE_STATUS_LABEL: Record<LineMatchStatus, string> = {
  match: "Match", mismatch: "Mismatch", not_compared: "Not compared", not_matched: "No PO line",
}

export function LineStatusPill({ status }: { status: LineMatchStatus }) {
  const cls = status === "mismatch" ? "bg-red-50 text-red-800 ring-red-200" : status === "match" ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-slate-100 text-slate-700 ring-slate-200"
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}`}>{LINE_STATUS_LABEL[status]}</span>
}

export { formatAmount, formatQuantity }

export type BreakdownCell = "quantity" | "unit_price" | "description" | "total"

type BreakdownRow = { label: string; value: ReactNode; emphasis?: "over" | "muted" }

/** The rows under the sentence, in #228 Q4's order: Ordered · Already invoiced (named, linked) ·
 * This invoice · Allowance · Over by. No Received — data DocuBite lacks. */
/** The current surface's address, for the `from=` every hop carries (#244). */
export function useOriginHere(): string {
  const pathname = usePathname()
  const search = useSearchParams()
  const query = search?.toString()
  return query ? `${pathname}?${query}` : pathname
}

export function breakdownFor(line: LineMatch, cell: Exclude<BreakdownCell, "total">, opts: { currency?: string | null; invoiceHref: (documentId: string) => string }): { title: string; sentence: string; rows: BreakdownRow[] } {
  if (cell === "quantity") {
    const q = line.quantity
    return {
      title: "Quantity",
      sentence: quantitySentence(line) ?? "This cell is not compared.",
      rows: [
        { label: "Ordered", value: formatQuantity(q.po) },
        { label: "Already invoiced", value: q.alreadyInvoiced.length
          ? <span className="flex flex-wrap justify-end gap-x-2">{q.alreadyInvoiced.map((sibling) => <Link key={sibling.documentId} href={opts.invoiceHref(sibling.documentId)} className="text-emerald-700 underline decoration-emerald-300 underline-offset-2 hover:text-emerald-800">{sibling.label} · {formatQuantity(sibling.quantity)}</Link>)}</span>
          : <span className="text-slate-500">None</span> },
        { label: "This invoice", value: formatQuantity(q.thisInvoice) },
        { label: "Over ordered by", value: q.po === null || q.thisInvoice === null ? "—" : `${formatQuantity(Math.max(0, (q.thisInvoice + q.alreadyInvoiced.reduce((sum, s) => sum + s.quantity, 0)) - q.po))}${q.overPercent !== null && q.overPercent > 0 ? ` (${q.overPercent} %)` : ""}`, emphasis: q.status === "mismatch" ? "over" : undefined },
        { label: "Allowance", value: q.allowance === null ? "—" : `${formatQuantity(q.allowance)} (${q.allowancePercent} % over)`, emphasis: "muted" },
        { label: "Over the allowance by", value: q.overBy === null ? "—" : formatQuantity(q.overBy), emphasis: q.overBy ? "over" : undefined },
      ],
    }
  }
  if (cell === "unit_price") {
    const p = line.unitPrice
    const off = p.invoice !== null && p.po !== null ? p.invoice - p.po : null
    return {
      title: "Unit price",
      sentence: unitPriceSentence(line) ?? "This cell is not compared.",
      rows: [
        { label: "On the PO", value: formatAmount(p.po, opts.currency) },
        { label: "This invoice", value: formatAmount(p.invoice, opts.currency) },
        { label: "Allowance", value: `${p.allowancePercent} % either side`, emphasis: "muted" },
        { label: "Off by", value: off === null ? "—" : `${off > 0 ? "+" : ""}${formatAmount(off, opts.currency)}${p.variancePercent !== null ? ` (${p.variancePercent} %)` : ""}`, emphasis: p.status === "mismatch" ? "over" : undefined },
      ],
    }
  }
  return {
    title: "Description",
    sentence: descriptionSentence(line),
    rows: [
      { label: "On the PO", value: line.description.po ?? <span className="text-slate-500">No PO line</span> },
      { label: "This invoice", value: line.description.invoice ?? "—" },
      { label: "Similarity", value: line.description.similarity === null ? "—" : `${Math.round(line.description.similarity * 100)} %`, emphasis: "muted" },
    ],
  }
}

const POPOVER_WIDTH = 320
const LG = 1024
const BREAKDOWN_OPEN_EVENT = "po-breakdown-open"

/** The breakdown surface. A popover anchored beside the glyph from `lg` up; a bottom sheet below
 * it (#228 Q14's 390 rule). Rendered through a portal with viewport coordinates so the pane's
 * scroll container and the table's horizontal scroller cannot clip it. Focus lands on the close
 * control, Escape closes, a click outside closes, focus returns to the glyph that opened it. */
export function Breakdown({ title, sentence, rows, onClose, returnFocusTo, children }: {
  title: string
  sentence: string
  rows: BreakdownRow[]
  onClose: () => void
  /** The glyph that opened the breakdown — the anchor and where focus returns. */
  returnFocusTo?: HTMLElement | null
  children?: ReactNode
}) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const titleId = useId()

  // One breakdown at a time: opening this one tells every other to close (they are siblings in
  // different components — the Total's and the cells' — so a DOM event is the seam).
  useEffect(() => {
    const token = {}
    const onOpen = (event: Event) => { if ((event as CustomEvent).detail !== token) onClose() }
    document.addEventListener(BREAKDOWN_OPEN_EVENT, onOpen)
    document.dispatchEvent(new CustomEvent(BREAKDOWN_OPEN_EVENT, { detail: token }))
    return () => document.removeEventListener(BREAKDOWN_OPEN_EVENT, onOpen)
  }, [onClose])

  // Placed from the panel's *measured* height (a ResizeObserver re-runs it once the content is
  // laid out), 8px below the glyph when there is room, otherwise 8px above it — never over the
  // cell it explains.
  useLayoutEffect(() => {
    if (typeof window === "undefined") return
    const place = () => {
      if (window.innerWidth < LG || !returnFocusTo) { setPosition(null); return }
      const rect = returnFocusTo.getBoundingClientRect()
      const height = panelRef.current?.offsetHeight ?? 0
      const left = Math.max(8, Math.min(rect.right - POPOVER_WIDTH, window.innerWidth - POPOVER_WIDTH - 8))
      const below = rect.bottom + 8
      const top = below + height <= window.innerHeight - 8 ? below : Math.max(8, rect.top - height - 8)
      setPosition({ top, left })
    }
    place()
    const observer = panelRef.current ? new ResizeObserver(place) : null
    if (panelRef.current) observer!.observe(panelRef.current)
    window.addEventListener("resize", place)
    window.addEventListener("scroll", place, true)
    return () => { observer?.disconnect(); window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true) }
  }, [returnFocusTo, rows.length])

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.stopPropagation(); onClose(); return }
      // The sheet is modal: Tab cycles inside it.
      if (event.key === "Tab" && panelRef.current && window.innerWidth < LG) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), [tabindex]:not([tabindex=\"-1\"])")
        if (!focusable.length) return
        const first = focusable[0], last = focusable[focusable.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }
    }
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node
      if (panelRef.current?.contains(target) || returnFocusTo?.contains(target)) return
      onClose()
    }
    // Capture phase: Escape closes the breakdown and nothing else — the Queue screen's own
    // document-level Escape (which closes the pane) must not see the same key.
    document.addEventListener("keydown", onKey, true)
    document.addEventListener("mousedown", onPointer)
    return () => { document.removeEventListener("keydown", onKey, true); document.removeEventListener("mousedown", onPointer); returnFocusTo?.focus() }
  }, [onClose, returnFocusTo])

  if (typeof document === "undefined") return null
  const sheet = position === null
  return createPortal(<>
    {sheet && <button type="button" aria-label="Close breakdown" onClick={onClose} className="fixed inset-0 z-[60] bg-slate-900/30" />}
    <div ref={panelRef} role="dialog" aria-modal={sheet} aria-labelledby={titleId}
      style={sheet ? undefined : { top: position.top, left: position.left, width: POPOVER_WIDTH }}
      className={sheet
        ? "fixed inset-x-0 bottom-0 z-[70] max-h-[70vh] overflow-y-auto rounded-t-2xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-8px_32px_-12px_rgba(15,23,42,0.3)]"
        : "fixed z-[70] max-h-[min(24rem,calc(100vh-2rem))] overflow-y-auto rounded-lg bg-white p-3 shadow-[0_10px_28px_-10px_rgba(15,23,42,0.35),0_0_0_1px_rgba(15,23,42,0.06)]"}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 id={titleId} className="text-xs font-semibold text-slate-700">{title} against the PO</h3>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Close breakdown" className="inline-flex h-7 w-7 items-center justify-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      <p className="text-sm text-slate-800">{sentence}</p>
      <dl className="mt-3 divide-y divide-slate-100 text-xs">
        {rows.map((row) => <div key={row.label} className="flex items-baseline justify-between gap-4 py-1.5">
          <dt className={row.emphasis === "muted" ? "text-slate-500" : "font-medium text-slate-600"}>{row.label}</dt>
          <dd className={`text-right tabular-nums ${row.emphasis === "over" ? "font-semibold text-red-700" : row.emphasis === "muted" ? "text-slate-500" : "text-slate-800"}`}>{row.value}</dd>
        </div>)}
      </dl>
      {children}
    </div>
  </>, document.body)
}

/** The Purchase Orders chip (#228 Q6, Q11, Q14): the PO number, carrying the `≠` count; dashed
 * for a suggestion that compares nothing yet; "PO removed" after a rejection. `href` makes it a
 * link to the PO's row where a queue has one. */
export function PoChip({ poNumber, kind, mismatchCount, confidence, removed, href, suggestionCount = 0, className = "", origin }: {
  poNumber: string | null
  kind: PoLinkKind | null
  mismatchCount?: number
  confidence?: number
  removed?: boolean
  href?: string
  /** Several likely POs and none compared (#228 Q14 "2 likely POs"). */
  suggestionCount?: number
  className?: string
  /** Where the chip is rendered, for the hop's `from=` (#244). */
  origin?: string | null
}) {
  const base = `inline-flex max-w-full items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium leading-4 tabular-nums ${className}`
  if (removed) return <span className={`${base} border border-slate-200 bg-slate-50 text-slate-600`} title="The Purchase Order link was rejected"><Link2Off className="h-3 w-3 shrink-0" aria-hidden="true" />PO removed</span>
  if (!kind) return <span className={`${base} text-slate-500`}>No PO</span>
  if (kind === "suggested") {
    const label = suggestionCount > 1 ? `${suggestionCount} likely POs` : `Likely ${poNumber ?? "PO"}`
    return <span className={`${base} border border-dashed border-slate-400 bg-white text-slate-700`} title="Suggested by the matcher; nothing is compared until it is confirmed in Match manually">
      <span className="truncate">{label}</span>
      {confidence !== undefined && suggestionCount <= 1 && <span className="text-slate-500">{Math.round(confidence * 100)} %</span>}
    </span>
  }
  const count = mismatchCount ?? 0
  const meaning = count > 0 ? `${count} mismatch${count === 1 ? "" : "es"} against the PO` : "Matched to this Purchase Order, nothing off"
  const body = <>
    <span className="truncate">{poNumber ?? "PO"}</span>
    {count > 0 && <span role="img" aria-label={meaning} className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-semibold leading-none text-white">{count}</span>}
  </>
  const cls = `${base} border ${count > 0 ? "border-red-200 bg-red-50 text-red-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`
  return href
    ? <Link href={withOrigin(href, origin)} className={`${cls} hover:underline`} title={meaning} aria-label={`${poNumber ?? "Purchase Order"}: ${meaning}. Open the Purchase Order`} onClick={(event) => event.stopPropagation()}>{body}</Link>
    : <span className={cls} title={meaning}>{body}</span>
}
