"use client"

import type { MouseEvent, ReactNode } from "react"
import { DETAIL_PANE_ID } from "@/components/queue/detail-pane"

/** Joins non-empty segments with " · " for a card's subtitle line — a missing half (no due date,
 * no number) is omitted, never rendered as "Due —" (#261 spec §4 Partial data). */
export function joinSegments(segments: ReactNode[]): ReactNode {
  const present = segments.filter((segment) => segment !== null && segment !== undefined && segment !== false && segment !== "")
  return present.flatMap((segment, index) => (index === 0 ? [segment] : [" · ", segment]))
    .map((piece, index) => <span key={index}>{piece}</span>)
}

/** #261 spec §1: the one card row every queue renders below its card breakpoint — one `<a>` per
 * row so long-press / open-in-new-tab works and the deep-link route already exists; `onClick`
 * prevents default and drives the shared `open()` (pushState below `lg`, #257 S8). Anatomy: the
 * queue's leading mark · line 1 title + trailing · line 2 subtitle · line 3 pills. The composite
 * `<a>` carries an explicit comma-separated `aria-label` (#257 lesson). */
export function QueueCard({ href, label, isOpen, onOpen, leading, title, trailing, subtitle, pill, subtitleClamp = false }: {
  href: string
  label: string
  isOpen: boolean
  onOpen: () => void
  leading?: ReactNode
  title: ReactNode
  trailing?: ReactNode
  subtitle?: ReactNode
  pill?: ReactNode
  /** Two-line subtitle (Exceptions' check message) instead of a one-line truncate. */
  subtitleClamp?: boolean
}) {
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    // Modified clicks keep the native anchor (new tab); a plain tap opens the pane in place.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
    event.preventDefault()
    onOpen()
  }
  return <a href={href} onClick={onClick} aria-label={label} aria-expanded={isOpen} aria-controls={DETAIL_PANE_ID} aria-current={isOpen ? "true" : undefined}
    className={`flex min-h-16 items-start gap-3 px-4 py-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600 ${isOpen ? "bg-emerald-50/60" : "hover:bg-slate-50 active:bg-slate-50"}`}>
    {leading}
    <span className="min-w-0 flex-1">
      <span className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[15px] font-semibold text-slate-900">{title}</span>
        {trailing !== undefined && trailing !== null && <span className="shrink-0 text-[15px] font-semibold tabular-nums text-slate-900">{trailing}</span>}
      </span>
      {subtitle !== undefined && subtitle !== null && <span className={`mt-0.5 block text-[13px] text-slate-600 ${subtitleClamp ? "line-clamp-2" : "truncate"}`}>{subtitle}</span>}
      {pill !== undefined && pill !== null && <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px]">{pill}</span>}
    </span>
  </a>
}
