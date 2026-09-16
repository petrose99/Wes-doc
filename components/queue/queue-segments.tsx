"use client"

import Link from "next/link"
import { useRef } from "react"

export type QueueSegment = { key: string; label: string; count: number; href: string }

/** #257 S2/B4: the segmented control every Approval-kind screen below `lg` uses to switch queues
 * (Invoice approvals · PO mismatches · Claims once #273 lands) — replaces the desktop
 * `ApprovalsQueuePicker` link pair at every width, so one control exists instead of two
 * differently-styled pickers for the same job. Data-driven: no segment renders before its data
 * does (#247 — no empty KPI), and the count is always shown, including `(0)`.
 *
 * These are links, not tab-panel switches — activating one navigates. `role="tab"` describes the
 * visual/interaction pattern (roving tabindex, ←/→ move) while `aria-selected` marks the current
 * queue; screen readers still get "link" semantics from the underlying `<a>`. */
export function QueueSegments({ segments, active, label = "Approval queues" }: {
  segments: QueueSegment[]
  active: string
  label?: string
}) {
  const refs = useRef<Map<string, HTMLAnchorElement>>(new Map())

  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
    event.preventDefault()
    const next = segments[(index + (event.key === "ArrowRight" ? 1 : -1) + segments.length) % segments.length]
    refs.current.get(next.key)?.focus()
  }

  return <div role="tablist" aria-label={label} className="flex w-full gap-1 rounded-lg bg-slate-100 p-1">
    {segments.map((segment, index) => {
      const selected = segment.key === active
      return <Link key={segment.key} href={segment.href}
        ref={(el) => { if (el) refs.current.set(segment.key, el); else refs.current.delete(segment.key) }}
        role="tab" aria-selected={selected} tabIndex={selected ? 0 : -1}
        onKeyDown={(event) => onKeyDown(event, index)}
        className={`flex h-10 flex-1 items-center justify-center rounded-md px-2 text-sm font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-1 ${selected ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-800"}`}>
        {segment.label} ({segment.count})
      </Link>
    })}
  </div>
}
