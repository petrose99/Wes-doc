"use client"

import { type ReactNode } from "react"
import { ExternalLink } from "lucide-react"
import { useRegisterDocumentActions, type RegisteredDocument } from "@/components/queue/document-actions-menu"
import { PaneResizeGrip, usePaneResize } from "@/components/queue/pane-resize-grip"

const SPLIT_KEY = "bill-pane-split"

export type BillPaneProviderLink = { href: string; label: string } | null

/** #361 step 1/2 (map #353, #355's Bill template): the takeover shell's drag-grip viewer/form
 * split and its one net-new header element, the `Open in <Provider>` link (#355 Q2). `PaneFrame`
 * already renders the true header (`<Supplier> — <number>`, the ⋯ menu with Archive/Flag/Move/
 * Send for review/Delete, and `×`/↑/↓) — this component never repeats that h2 (area primer:
 * "never repeated across stacked headers"); it only adds the link *beside* it, per Q2, and
 * registers the document the same way `SplitPane` does so the frame's ⋯ has something to act on.
 *
 * Viewer/form content is `children`-shaped (`viewer`/`form`) through the rest of this ticket and
 * #362: the status track (step 3) and footer (step 4) render *inside* `form` by the caller, not
 * owned here, so later steps compose without reshaping this return value. The floating "Open
 * file" icon reuses `SplitPane`'s exact ≥lg pattern (#355 Q3 — "was the source strip's line") so
 * both templates share one implementation of it; below `lg` the phone lane's own stacked source
 * band (unchanged, #359) still carries the file link, so this icon is `lg:flex` only, matching
 * `split-pane.tsx`'s existing one. */
export function BillPane({ document, providerLink, fileHref, viewer, form }: {
  document: RegisteredDocument
  /** #355 Q2: omitted entirely (not greyed) when no provider is connected or the document has no
   * ledger line yet — the caller decides that; this component renders what it is given. */
  providerLink: BillPaneProviderLink
  fileHref: string
  viewer: ReactNode
  form: ReactNode
}) {
  useRegisterDocumentActions(document)
  const resize = usePaneResize(SPLIT_KEY)
  const { splitPct, dragging, rowRef } = resize
  return <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
    {providerLink && <div className="flex shrink-0 items-center border-b border-slate-200 px-3 py-1.5">
      <a href={providerLink.href} target="_blank" rel="noreferrer" className="text-sm font-medium text-emerald-700 hover:underline">
        {providerLink.label}
      </a>
    </div>}
    <div ref={rowRef} className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
      <div className={`relative min-h-0 flex-1 overflow-hidden border-slate-200 lg:flex-none lg:border-b-0 lg:border-r lg:[flex-basis:var(--split-pct)] ${dragging ? "" : "motion-safe:transition-[flex-basis] motion-safe:duration-200"}`}
        style={{ ["--split-pct" as string]: `${splitPct}%` }}>
        <a href={fileHref} target="_blank" rel="noopener noreferrer" aria-label="Open file in a new tab" title="Open file in a new tab"
          className="absolute right-2 top-2 z-10 hidden h-9 w-9 items-center justify-center rounded-full bg-white/90 text-slate-600 shadow-sm backdrop-blur hover:bg-white hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 lg:flex">
          <ExternalLink className="h-4 w-4" aria-hidden />
        </a>
        {viewer}
      </div>
      <PaneResizeGrip state={resize} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto">
        {form}
      </div>
    </div>
  </div>
}
