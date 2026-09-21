"use client"

import { type ReactNode, useState } from "react"
import { ExternalLink, XCircle, Loader2 } from "lucide-react"
import { useRegisterDocumentActions, type RegisteredDocument } from "@/components/queue/document-actions-menu"
import { PaneResizeGrip, usePaneResize } from "@/components/queue/pane-resize-grip"
import { StatusLine } from "@/components/queue/status-line"
import { formatDate } from "@/components/queue/row-cells"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { updateReviewTaskStatusAction } from "@/app/(app)/workspaces/[workspaceId]/review-actions"
import type { ProcessingState } from "@/lib/documents/processing-state"
import type { ProcessingFact } from "@/lib/documents/processing-fact"

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

/** #361 step 3: the status track that replaces the five-step stepper for `BillPane` (#354's
 * signed list — "stepper folded into the status track"). Three parts, always in this order:
 * `StatusLine` (unchanged, #258) with the ledger "Paid" pill plus a trailing date when this bill
 * has been paid; a persistent open-checks summary (spec §4.2 — complements `StatusLine`'s own
 * fact sentence, which drops the check count once escalated/rejected takes precedence, #4.3);
 * and the Approval block (§4.3), the one and only place a blocking reason renders. `escalated`
 * has no per-document actor-role query in the row projection (spec: "no new query") so its
 * sentence names the generic waiting party, not a person. */
export function BillStatusTrack({ workspaceId, openReviewTaskId, state, fact, ledger, openCheckCodes, cancelledReason, paidAt, blockedByCheck, escalated, approvalStatus, rejectedByActor, onDone }: {
  workspaceId: string
  openReviewTaskId: string | null
  state: ProcessingState
  fact: ProcessingFact
  ledger?: string | null
  openCheckCodes: string[]
  cancelledReason?: string | null
  /** When this bill has been paid — renders as `StatusLine`'s `trailing` node, "· Paid {date}",
   * matching the `· Synced` suffix pattern's spot (spec §4.1). Null for every unpaid bill. */
  paidAt?: Date | null
  blockedByCheck: boolean
  escalated: boolean
  approvalStatus: "not_started" | "in_progress" | "approved" | "rejected" | "cancelled"
  /** Who rejected, when known (`StatusLine`'s own `doc.decision` upgrade already resolves this
   * for the fact sentence) — the Approval block's "Rejected by {actor}" reuses that name rather
   * than a second query. */
  rejectedByActor?: string | null
  onDone: () => void
}) {
  const [confirmingReject, setConfirmingReject] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const checkCount = openCheckCodes.length
  const blockReason =
    blockedByCheck ? `Blocked — ${checkCount} open check${checkCount === 1 ? "" : "s"} must clear first`
    : escalated ? "Escalated — waiting on a reviewer"
    : approvalStatus === "rejected" ? (rejectedByActor ? `Rejected by ${rejectedByActor}` : "Rejected")
    : null
  const canReject = approvalStatus === "in_progress" && !!openReviewTaskId

  const reject = async () => {
    if (!openReviewTaskId) return
    setConfirmingReject(false)
    setRejecting(true)
    try {
      await updateReviewTaskStatusAction(workspaceId, openReviewTaskId, "rejected")
      onDone()
    } finally {
      setRejecting(false)
    }
  }

  return <div className="flex flex-col gap-2 border-b border-slate-200 px-3 py-2">
    <StatusLine state={state} fact={fact} ledger={ledger} openCheckCodes={openCheckCodes} cancelledReason={cancelledReason}
      trailing={paidAt ? <span>· Paid {formatDate(paidAt)}</span> : undefined} />
    {checkCount > 0 && <p role="status" className="text-xs text-slate-600">{checkCount} open check{checkCount === 1 ? "" : "s"}</p>}
    {blockReason && <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <span>{blockReason}</span>
      {canReject && <Button type="button" size="sm" variant="outline" disabled={rejecting} onClick={() => setConfirmingReject(true)}>
        {rejecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <XCircle className="h-3.5 w-3.5" aria-hidden />}Reject
      </Button>}
    </div>}
    <ConfirmDialog
      open={confirmingReject}
      destructive
      busy={rejecting}
      title="Reject this bill?"
      description="The open approval is closed as rejected and the decision is recorded on the audit trail. The document itself stays in the company."
      confirmLabel={rejecting ? "Rejecting…" : "Reject"}
      onConfirm={() => void reject()}
      onCancel={() => setConfirmingReject(false)} />
  </div>
}
