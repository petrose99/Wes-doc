"use client"

import { Component, useCallback, useContext, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react"
import { ArrowLeft, ChevronDown, ChevronUp, MoreHorizontal, X } from "lucide-react"
import Link from "next/link"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { DocumentMenuDeleteItem, DocumentMenuTopItems, OpenInNewTabMenuItem, PaneDocumentContext, PaneDocumentProvider } from "@/components/queue/document-actions-menu"

export const DETAIL_PANE_ID = "queue-detail-pane"

/** The one name a pane header shows for its row: the party (supplier / merchant / batch) and, in
 * the same line, the reference and amount — never a second line that introduces the document
 * again (#259: the old pane said the name four times across three stacked headers). */
export type PaneName = { title: string; suffix?: string | null }

export type PaneMutation = "changed" | "removed"

const iconButton = "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:pointer-events-none disabled:opacity-40"

/** The frame every document surface shares (#234 d.7, built by #259): one header of two lines —
 * the name, then the Status line the queue supplies — one ⋯ for every secondary and destructive
 * action, the sticky footer slot, and `children` as the content. `mode="pane"` is the Queue
 * screen's right-hand pane (#225) with ↑/↓, "n of N" and Close; below `lg` it is the #209
 * full-screen sheet with Back in place of Close. `mode="full"` is the `?full=1` standalone route:
 * the same header with *Back to queue*, no row navigation.
 *
 * Document actions (Archive · Flag · Delete…) are not props: the embedded `SplitPane` registers
 * the loaded document through `PaneDocumentContext` and the frame's ⋯ renders them from that, so
 * there is exactly one implementation of each action for every queue. */
export function PaneFrame({ mode, name, status, position, onClose, onPrev, onNext, fullHref, backHref, menu, actions, onMutated, archivedToast, headingRef, contentKey, children }: {
  mode: "pane" | "full"
  name: PaneName
  /** Line 2 of the header — the row's state pills and ledger mark. Comes from the row, not the
   * loaded content, so it never skeletons. Omit for surfaces with no status (Payment Batches). */
  status?: ReactNode
  position?: { index: number; total: number }
  onClose?: () => void
  onPrev?: (() => void) | null
  onNext?: (() => void) | null
  /** Pane mode: the standalone `?full=1` route, rendered as the ⋯'s *Open in a new tab*. */
  fullHref?: string
  /** Full mode: where *Back to queue* goes. */
  backHref?: string
  /** The surface's own secondary items (Cancel invoice…, Create expense claim…). */
  menu?: ReactNode
  /** The sticky bottom bar: the surface's primary decision (Approve / Reject, or Resolve). */
  actions?: ReactNode
  /** What the frame's own actions did to the document: `changed` → reload the content, `removed`
   * → the row is gone (close the pane, refresh the list; full mode goes back to the queue). */
  onMutated?: (kind: PaneMutation) => void
  /** Queues with a Closed facet say where the row went ("Archived — now under Closed"). */
  archivedToast?: { archived: string; unarchived: string }
  headingRef?: React.RefObject<HTMLHeadingElement | null>
  /** Changes when the document behind the frame changes; resets the ⋯'s open state. */
  contentKey?: string
  children: ReactNode
}) {
  const isPane = mode === "pane"
  const titleId = `${DETAIL_PANE_ID}-title`
  const [menuOpen, setMenuOpen] = useState(false)
  useEffect(() => { setMenuOpen(false) }, [contentKey])

  return <PaneDocumentProvider onMutated={onMutated} archivedToast={archivedToast}>
    <section id={DETAIL_PANE_ID} aria-labelledby={titleId}
      className={isPane
        ? "fixed inset-0 z-50 flex min-h-0 flex-col bg-white lg:static lg:z-auto lg:h-auto lg:min-h-0 lg:w-[60%] lg:shrink-0 lg:overflow-hidden"
        : "flex h-screen min-h-0 flex-col bg-white"}>
      <header className="border-b border-slate-200 px-3 py-1.5 pt-[calc(0.375rem+env(safe-area-inset-top,0px))] lg:pt-1.5">
        <div className="flex h-9 items-center gap-1">
          {isPane
            ? <button type="button" onClick={onClose} aria-label="Back to queue" className={`${iconButton} lg:hidden`}><ArrowLeft className="h-5 w-5" aria-hidden /></button>
            : <Link href={backHref ?? "#"} aria-label="Back to queue" title="Back to queue" className={iconButton}><ArrowLeft className="h-5 w-5" aria-hidden /></Link>}
          <h2 id={titleId} ref={headingRef} tabIndex={-1} className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900 outline-none" title={[name.title, name.suffix].filter(Boolean).join("  ")}>
            {name.title}
            {name.suffix && <span className="font-normal text-slate-500">{"  "}{name.suffix}</span>}
          </h2>
          {isPane && position && <span className="hidden shrink-0 px-1 text-xs tabular-nums text-slate-500 sm:inline" aria-live="polite">{position.index} of {position.total}</span>}
          {isPane && <div className="flex shrink-0 items-center" role="group" aria-label="Move selection">
            <button type="button" onClick={onPrev ?? undefined} disabled={!onPrev} aria-label="Previous row" title="Previous row (↑)" className={iconButton}><ChevronUp className="h-4 w-4" aria-hidden /></button>
            <button type="button" onClick={onNext ?? undefined} disabled={!onNext} aria-label="Next row" title="Next row (↓)" className={iconButton}><ChevronDown className="h-4 w-4" aria-hidden /></button>
          </div>}
          <PaneMenu open={menuOpen} onOpenChange={setMenuOpen} fullHref={isPane ? fullHref : undefined} menu={menu} onDeleted={!isPane && backHref ? () => { window.location.assign(backHref) } : undefined} />
          {isPane && <button type="button" onClick={onClose} aria-label="Close" title="Close (Esc)" className={`${iconButton} hidden lg:inline-flex`}><X className="h-4 w-4" aria-hidden /></button>}
        </div>
        {status !== undefined && <div className="flex min-h-[18px] items-center gap-1.5 overflow-hidden pl-1 text-[13px] leading-[18px] text-slate-600 lg:pl-0">{status}</div>}
      </header>

      <div className="relative min-h-0 flex-1 overflow-hidden">{children}</div>

      {actions && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-3 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] shadow-[0_-6px_16px_-12px_rgba(15,23,42,0.35)] lg:pb-2">
        {actions}
      </footer>}
    </section>
  </PaneDocumentProvider>
}

/** The header's one ⋯. Order: Open in a new tab · Open review task · Archive · Flag · ── ·
 * the surface's items · Delete…. Renders nothing at all when there is nothing to put in it (a
 * Payment Batch with no surface items). A real menu for the keyboard: `role="menu"`, roving
 * ArrowUp/Down with wrap, Home/End; Escape and outside focus close it (Radix). */
function PaneMenu({ open, onOpenChange, fullHref, menu, onDeleted }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  fullHref?: string
  menu?: ReactNode
  onDeleted?: () => void
}) {
  const ctx = useContext(PaneDocumentContext)
  const hasDoc = !!ctx?.doc
  const contentRef = useRef<HTMLDivElement>(null)
  if (!fullHref && !menu && !hasDoc) return null

  const items = () => Array.from(contentRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const list = items()
    if (list.length === 0) return
    const index = list.indexOf(document.activeElement as HTMLElement)
    let next: number | null = null
    if (event.key === "ArrowDown") next = index < 0 || index === list.length - 1 ? 0 : index + 1
    else if (event.key === "ArrowUp") next = index <= 0 ? list.length - 1 : index - 1
    else if (event.key === "Home") next = 0
    else if (event.key === "End") next = list.length - 1
    if (next === null) return
    event.preventDefault()
    list[next].focus()
  }

  return <Popover open={open} onOpenChange={onOpenChange}>
    <PopoverTrigger asChild>
      <button type="button" aria-label="More actions" title="More actions" aria-haspopup="menu" aria-expanded={open} className={iconButton}>
        <MoreHorizontal className="h-4 w-4" aria-hidden />
      </button>
    </PopoverTrigger>
    <PopoverContent ref={contentRef} align="end" role="menu" aria-label="More actions" className="w-64 p-1" onKeyDown={onKeyDown}
      onOpenAutoFocus={(event) => { event.preventDefault(); items()[0]?.focus() }}
      onClick={(event) => { if ((event.target as HTMLElement).closest("[data-menu-close]")) onOpenChange(false) }}>
      {fullHref && <OpenInNewTabMenuItem href={fullHref} />}
      <DocumentMenuTopItems closeMenu={() => onOpenChange(false)} />
      {(menu || hasDoc) && (fullHref || hasDoc) && <div role="separator" className="my-1 h-px bg-slate-200" />}
      {menu}
      <DocumentMenuDeleteItem onDeleted={onDeleted} />
    </PopoverContent>
  </Popover>
}

/** The Queue screen's Detail pane (#225; CONTEXT.md "Detail pane"): `PaneFrame` in pane mode
 * around the load / missing / error lifecycle of whatever `loadDetail` returns (the embedded
 * split pane, via `getQueueDetailAction`). */
export function DetailPane({ documentId, name, status, position, onClose, onPrev, onNext, loadDetail, actions, menu, fullHref, onMutated, archivedToast, reloadKey }: {
  documentId: string
  name: PaneName
  status?: ReactNode
  position: { index: number; total: number }
  onClose: () => void
  onPrev: (() => void) | null
  onNext: (() => void) | null
  loadDetail: (documentId: string) => Promise<ReactNode | null>
  actions?: ReactNode
  menu?: ReactNode
  fullHref?: string
  onMutated?: (kind: PaneMutation) => void
  archivedToast?: { archived: string; unarchived: string }
  /** Bump to re-run `loadDetail` for the same document (after an action changed it). */
  reloadKey?: number
}) {
  const [content, setContent] = useState<ReactNode | null>(null)
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">("loading")
  const headingRef = useRef<HTMLHeadingElement>(null)

  const load = useCallback(() => {
    let cancelled = false
    // Deferred a tick so the effect body itself doesn't set state synchronously.
    Promise.resolve().then(() => { if (!cancelled) setState("loading") })
    loadDetail(documentId)
      .then((node) => {
        if (cancelled) return
        if (node === null) { setState("missing"); setContent(null); return }
        setContent(node)
        setState("ready")
      })
      .catch(() => { if (!cancelled) setState("error") })
    return () => { cancelled = true }
  }, [documentId, loadDetail])

  useEffect(() => load(), [load, reloadKey])

  // Opening or moving the selection lands focus on the pane's heading so a screen reader hears
  // which document is now in view; ↑/↓ keep working from there because the queue listens at its
  // root. Close returns focus to the row (handled by the queue).
  useEffect(() => { headingRef.current?.focus({ preventScroll: true }) }, [documentId])

  return <PaneFrame mode="pane" name={name} status={status} position={position} onClose={onClose} onPrev={onPrev} onNext={onNext}
    fullHref={fullHref} menu={menu} actions={actions} onMutated={onMutated} archivedToast={archivedToast} headingRef={headingRef} contentKey={documentId}>
    {state === "loading" && <div className="absolute inset-0 z-10 flex flex-col bg-white" aria-busy="true" aria-label="Loading document">
      {/* The stepper band and the source strip, as bars, so the chrome doesn't jump when the content lands. */}
      <div className="h-9 shrink-0 border-b border-slate-200 px-3 py-2"><div className="h-5 w-72 max-w-full animate-pulse rounded bg-slate-100" /></div>
      <div className="flex min-h-0 flex-1 gap-3 p-4">
        <div className="hidden flex-1 animate-pulse rounded bg-slate-100 lg:block" />
        <div className="flex flex-1 flex-col gap-2">
          {Array.from({ length: 7 }).map((_, i) => <div key={i} className="h-9 animate-pulse rounded bg-slate-100" style={{ animationDelay: `${i * 60}ms` }} />)}
        </div>
      </div>
    </div>}
    {state === "missing" && <div className="p-6 text-sm">
      <p className="text-slate-700">This document is no longer in the workspace.</p>
      <button type="button" onClick={() => onMutated?.("removed")} className="mt-2 inline-flex h-8 items-center rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50">Refresh queue</button>
    </div>}
    {state === "error" && <div className="p-6 text-sm">
      <p className="text-red-700">Couldn&apos;t load this document. Check your connection and try again.</p>
      <button type="button" onClick={() => load()} className="mt-2 inline-flex h-8 items-center rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50">Retry</button>
    </div>}
    {content && <PaneErrorBoundary key={`${documentId}:${reloadKey}`} onRetry={() => load()}><div className="h-full min-h-0">{content}</div></PaneErrorBoundary>}
  </PaneFrame>
}

/** A row in the pane's ⋯: full-width, a `menuitem` in the roving order, closes the menu on
 * activation unless the action opens its own dialog or is mid-flight (`keepOpen`). A disabled
 * item stays in the order (`aria-disabled`, not `disabled`) with its visible reason under the
 * label — the reason is the point of keeping it, not the click. */
export function PaneMenuItem({ onClick, href, children, tone = "neutral", disabled, hint, keepOpen, busy }: {
  onClick?: () => void
  /** A navigation item renders as a real link (open in new tab, copy link) rather than a button. */
  href?: string
  children: ReactNode
  tone?: "neutral" | "amber" | "red"
  disabled?: boolean
  hint?: string
  keepOpen?: boolean
  busy?: boolean
}) {
  const hintId = useId()
  const toneClass = tone === "red" ? "text-red-700 hover:bg-red-50" : tone === "amber" ? "text-amber-800 hover:bg-amber-50" : "text-slate-700 hover:bg-slate-100"
  const inert = disabled || busy
  const className = `flex w-full items-center rounded-sm px-2.5 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600 ${disabled ? "cursor-not-allowed text-slate-500 hover:bg-transparent" : toneClass}`
  return <div>
    {href && !inert
      ? <a href={href} role="menuitem" tabIndex={-1} data-menu-close className={className}>{children}</a>
      : <button type="button" role="menuitem" tabIndex={-1} aria-disabled={inert || undefined} aria-busy={busy || undefined}
        aria-describedby={disabled && hint ? hintId : undefined}
        onClick={inert ? undefined : onClick}
        {...(keepOpen || inert ? {} : { "data-menu-close": true })}
        className={className}>
        {children}
      </button>}
    {disabled && hint && <p id={hintId} className="px-2.5 pb-2 text-xs text-slate-500">{hint}</p>}
  </div>
}

/** A render failure inside the loaded detail stays inside the pane — the queue beside it keeps
 * working — instead of reaching the route's error boundary and replacing the whole screen. */
class PaneErrorBoundary extends Component<{ children: ReactNode; onRetry: () => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (!this.state.failed) return this.props.children
    return <div className="p-6 text-sm">
      <p className="text-red-700">Couldn&apos;t show this document&apos;s detail. Try again, or open it in a new tab from the menu above.</p>
      <button type="button" onClick={() => { this.setState({ failed: false }); this.props.onRetry() }} className="mt-2 inline-flex h-8 items-center rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50">Retry</button>
    </div>
  }
}
