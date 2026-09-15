"use client"

import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { ArrowLeft, ChevronDown, ChevronUp, MoreHorizontal, X } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

export const DETAIL_PANE_ID = "queue-detail-pane"

/** The Queue screen's one right-hand Detail pane (#225; CONTEXT.md "Detail pane"). Owns the
 * frame — title, close, ↑/↓, the header overflow, the sticky bottom action bar — and the
 * load/error lifecycle around whatever `loadDetail` returns (the embedded split pane, via
 * `getQueueDetailAction`). Below `lg` it is the #209 full-screen sheet: same component, same
 * content, positioned over the queue with a Back control in place of Close. */
export function DetailPane({ documentId, title, subtitle, position, onClose, onPrev, onNext, loadDetail, actions, menu, reloadKey }: {
  documentId: string
  title: string
  subtitle?: string | null
  position: { index: number; total: number }
  onClose: () => void
  onPrev: (() => void) | null
  onNext: (() => void) | null
  loadDetail: (documentId: string) => Promise<ReactNode | null>
  /** The sticky bottom bar: the surface's primary decision (Approve / Reject, or Resolve). */
  actions?: ReactNode
  /** Secondary actions for the header overflow ("Cancel invoice…", "Open full page"). */
  menu?: ReactNode
  /** Bump to re-run `loadDetail` for the same document (after an action changed it). */
  reloadKey?: number
}) {
  const [content, setContent] = useState<ReactNode | null>(null)
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">("loading")
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)

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

  return <section id={DETAIL_PANE_ID} aria-labelledby={`${DETAIL_PANE_ID}-title`}
    className="fixed inset-0 z-50 flex min-h-0 flex-col bg-white lg:static lg:z-auto lg:h-auto lg:min-h-0 lg:w-[60%] lg:shrink-0 lg:overflow-hidden">
    <header className="flex items-center gap-2 border-b border-slate-200 px-3 py-2 pt-[calc(0.5rem+env(safe-area-inset-top,0px))] lg:pt-2">
      <button type="button" onClick={onClose} aria-label="Back to queue" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 lg:hidden">
        <ArrowLeft className="h-5 w-5" aria-hidden />
      </button>
      <div className="min-w-0 flex-1">
        <h2 id={`${DETAIL_PANE_ID}-title`} ref={headingRef} tabIndex={-1} className="truncate text-sm font-semibold text-slate-900 outline-none">{title}</h2>
        {subtitle && <p className="line-clamp-2 text-xs text-slate-600 lg:truncate">{subtitle}</p>}
      </div>
      <span className="hidden shrink-0 text-xs tabular-nums text-slate-500 sm:inline" aria-live="polite">{position.index} of {position.total}</span>
      <div className="flex shrink-0 items-center" role="group" aria-label="Move selection">
        <button type="button" onClick={onPrev ?? undefined} disabled={!onPrev} aria-label="Previous row" title="Previous row (↑)"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:pointer-events-none disabled:opacity-40">
          <ChevronUp className="h-4 w-4" aria-hidden />
        </button>
        <button type="button" onClick={onNext ?? undefined} disabled={!onNext} aria-label="Next row" title="Next row (↓)"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:pointer-events-none disabled:opacity-40">
          <ChevronDown className="h-4 w-4" aria-hidden />
        </button>
      </div>
      {menu && <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger asChild>
          <button type="button" aria-label="More actions" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600">
            <MoreHorizontal className="h-4 w-4" aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 p-1" onClick={(event) => { if ((event.target as HTMLElement).closest("[data-menu-close]")) setMenuOpen(false) }}>
          {menu}
        </PopoverContent>
      </Popover>}
      <button type="button" onClick={onClose} aria-label="Close detail" title="Close (Esc)" className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 lg:inline-flex">
        <X className="h-4 w-4" aria-hidden />
      </button>
    </header>

    <div className="relative min-h-0 flex-1 overflow-hidden">
      {state === "loading" && <div className="absolute inset-0 z-10 flex flex-col gap-3 bg-white p-4" aria-busy="true" aria-label="Loading document">
        <div className="h-4 w-1/2 animate-pulse rounded bg-slate-100" />
        <div className="flex min-h-0 flex-1 gap-3">
          <div className="hidden flex-1 animate-pulse rounded bg-slate-100 lg:block" />
          <div className="flex flex-1 flex-col gap-2">
            {Array.from({ length: 7 }).map((_, i) => <div key={i} className="h-9 animate-pulse rounded bg-slate-100" style={{ animationDelay: `${i * 60}ms` }} />)}
          </div>
        </div>
      </div>}
      {state === "missing" && <p className="p-6 text-sm text-slate-700">This document is no longer in the workspace. Close the pane and refresh the queue.</p>}
      {state === "error" && <div className="p-6 text-sm">
        <p className="text-red-700">Couldn&apos;t load this document. Check your connection and try again.</p>
        <button type="button" onClick={() => load()} className="mt-2 inline-flex h-8 items-center rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50">Retry</button>
      </div>}
      {content && <PaneErrorBoundary key={`${documentId}:${reloadKey}`} onRetry={() => load()}><div className="h-full min-h-0">{content}</div></PaneErrorBoundary>}
    </div>

    {actions && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-3 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] shadow-[0_-6px_16px_-12px_rgba(15,23,42,0.35)] lg:pb-2">
      {actions}
    </footer>}
  </section>
}

/** A row in the pane's header overflow: full-width, keyboard-reachable, closes the menu on
 * activation unless the action opens its own dialog (pass `keepOpen`). */
export function PaneMenuItem({ onClick, children, tone = "neutral", disabled, hint, keepOpen }: {
  onClick?: () => void
  children: ReactNode
  tone?: "neutral" | "amber" | "red"
  disabled?: boolean
  hint?: string
  keepOpen?: boolean
}) {
  const toneClass = tone === "red" ? "text-red-700 hover:bg-red-50" : tone === "amber" ? "text-amber-800 hover:bg-amber-50" : "text-slate-700 hover:bg-slate-100"
  return <div>
    <button type="button" onClick={onClick} disabled={disabled} {...(keepOpen ? {} : { "data-menu-close": true })}
      className={`flex w-full items-center rounded-sm px-2.5 py-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50 ${toneClass}`}>
      {children}
    </button>
    {disabled && hint && <p className="px-2.5 pb-2 text-xs text-slate-500">{hint}</p>}
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
