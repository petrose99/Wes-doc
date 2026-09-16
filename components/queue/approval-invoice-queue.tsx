"use client"

import { useState, useTransition, type ReactNode } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { QueueScreen, type QueueColumn, type SortOption } from "@/components/queue/queue-screen"
import { PaneMenuItem } from "@/components/queue/detail-pane"
import { formatDate, formatMoney, TitleCell } from "@/components/queue/row-cells"
import { ReasonDialog } from "@/components/list-screen/reason-dialog-button"
import type { Facet } from "@/components/queue/facet-filters"
import { QueueSegments } from "@/components/queue/queue-segments"
import { ProcessingStateGlyph } from "@/components/typed-destinations/row-signals"
import { processingState } from "@/lib/documents/processing-state"
import { useOnlineStatus } from "@/lib/client/use-online-status"
import { usePhoneLane } from "@/lib/client/use-phone-lane"
import { countWaitingOnOthers, filterApprovalInvoiceRows } from "@/lib/approvals/filters"
import { DecisionResultStrip, NETWORK_ERROR, OFFLINE_REASON, type Decided } from "@/components/queue/decision-result"
import { decideReviewTaskStageAction } from "@/app/(app)/workspaces/[workspaceId]/review-actions"
import { sendApprovalBackForReviewAction } from "@/app/(app)/workspaces/[workspaceId]/(queue)/approvals/actions"
import { getQueueDetailAction } from "@/app/(app)/workspaces/[workspaceId]/queue-actions"
import type { ApprovalInvoiceRow } from "@/models/approvals"

export const APPROVAL_INVOICE_FACETS: Facet[] = [
  { param: "status", label: "Status", options: [{ value: "not_eligible", label: "Not eligible" }], allLabel: "Ready to approve" },
  { param: "approver", label: "Approver", options: [{ value: "anyone", label: "Anyone" }], allLabel: "Me" },
]

const SORTS: SortOption<ApprovalInvoiceRow>[] = [
  { key: "waiting", label: "Waiting longest first", compare: (a, b) => a.waitingSince.getTime() - b.waitingSince.getTime() },
  { key: "amount", label: "Amount, high to low", compare: (a, b) => (b.total ?? -Infinity) - (a.total ?? -Infinity) },
  { key: "due", label: "Due soonest", compare: (a, b) => (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity) },
]

function stageLabel(stage: ApprovalInvoiceRow["stage"]): string {
  return `${stage.index + 1} of ${stage.total} · ${stage.name}`
}

function waitingSinceLabel(date: Date): string {
  const days = Math.max(0, Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000)))
  if (days === 0) return "Today"
  if (days === 1) return "1 day"
  return `${days} days`
}

function eligibilityText(row: ApprovalInvoiceRow): string {
  if (row.eligibility.status === "no_approver") return "Needs attention · no approver"
  if (row.eligibility.status === "not_eligible") return `Not eligible — ${row.eligibility.reason}`
  return ""
}

/** #236: Approvals › Invoices — every submitted Approval (CONTEXT.md), on the shared Queue
 * screen (#225). A row's Approve/Reject decide the invoice's *current stage*
 * (`decideReviewTaskStageAction`, already generic across every workflow surface); "Send back for
 * review" lives in the pane's header overflow, not the sticky footer, per decision #6. */
export function ApprovalInvoiceQueue({ workspaceId, basePath, rows, poMismatchCount, views, initialSelectedId }: {
  workspaceId: string
  basePath: string
  /** Every row the actor may see — the Approver/Status facets apply client-side
   * (`filterApprovalInvoiceRows`), so the Filter sheet and the empty state can count. */
  rows: ApprovalInvoiceRow[]
  /** PO mismatches through the same facets, for the segment count. */
  poMismatchCount: number
  /** The saved-view picker (#201) — composed here, after the queue picker, matching every other
   * typed destination's `views` slot; PO Mismatches has no saved views yet, so it omits this. */
  views?: ReactNode
  initialSelectedId?: string | null
}) {
  const router = useRouter()
  const online = useOnlineStatus()
  const phone = usePhoneLane()
  const [pending, setPending] = useState<{ taskId: string; decision: "approve" | "reject" } | null>(null)
  // #257 spec 3.5 "After a decision": the decided row stays open (pinned) with a result strip in
  // place of the decision bar; the desktop toast stays as well. Cleared when another row opens.
  const [decided, setDecided] = useState<Decided<ApprovalInvoiceRow> | null>(null)
  const [approving, setApproving] = useState<ApprovalInvoiceRow | null>(null)
  const [rejecting, setRejecting] = useState<ApprovalInvoiceRow | null>(null)
  const [sendingBack, setSendingBack] = useState<ApprovalInvoiceRow | null>(null)
  const [error, setError] = useState<{ taskId: string; message: string } | null>(null)

  const columns: QueueColumn<ApprovalInvoiceRow>[] = [
    { key: "supplier", label: "Supplier", narrow: true, className: "min-w-[12rem]", render: (row) => <TitleCell title={row.supplier} missingLabel="Unknown supplier" subtitle={row.eligibility.status !== "ready" ? eligibilityText(row) : null} /> },
    { key: "number", label: "Invoice #", className: "whitespace-nowrap text-slate-700", render: (row) => <>{row.invoiceNumber ?? "—"}</> },
    { key: "amount", label: "Amount", narrow: true, className: "whitespace-nowrap text-right tabular-nums text-slate-900", render: (row) => <>{row.total !== null ? formatMoney(row.total, row.currencyCode) : "—"}</> },
    { key: "due", label: "Due", narrow: true, className: "whitespace-nowrap tabular-nums text-slate-700", render: (row) => <>{formatDate(row.dueDate)}</> },
    { key: "stage", label: "Stage", className: "whitespace-nowrap text-slate-700", render: (row) => <>{stageLabel(row.stage)}</> },
    { key: "waiting", label: "Waiting since", className: "whitespace-nowrap tabular-nums text-slate-700", render: (row) => <>{waitingSinceLabel(row.waitingSince)}</> },
  ]

  // Decision #10's "server refused" state: the inline error stays attached to the row, and the
  // row still refreshes right after — a stage another approver just decided (the classic race,
  // "Approved by Dana 12s ago") is only resolved by re-reading the server, not by trusting the
  // client's optimistic guess.
  // Three exits (spec 3.6): success → result strip; server refused (already decided, not your
  // stage) → the strip carries the server's sentence and the row re-reads; network throw → the
  // sheet stays open with the typed reason and the bar shows the error.
  const decide = async (row: ApprovalInvoiceRow, decision: "approve" | "reject", note: string | undefined): Promise<{ success: boolean; error?: string }> => {
    setError(null)
    setPending({ taskId: row.taskId, decision })
    try {
      const result = await decideReviewTaskStageAction(workspaceId, row.taskId, decision, note)
      if (!result.success) {
        setDecided({ row, outcome: "refused", message: result.error || "This stage is no longer yours to decide." })
        router.refresh()
        return { success: true }
      }
      setDecided({ row, outcome: decision === "approve" ? "approved" : "rejected" })
      if (!phone) toast.success(decision === "approve" ? "Approved" : "Rejected")
      router.refresh()
      return { success: true }
    } catch {
      setError({ taskId: row.taskId, message: NETWORK_ERROR })
      return { success: false, error: NETWORK_ERROR }
    } finally {
      setPending(null)
    }
  }
  const waitingOnOthers = countWaitingOnOthers(rows)
  // One clock reading per render of the list, so "overdue" is stable across cards.
  const [renderedAt] = useState(() => Date.now())
  const searchParams = useSearchParams()
  const ownCount = filterApprovalInvoiceRows(rows, searchParams).length

  return <>
    <QueueScreen<ApprovalInvoiceRow>
      title="Invoices"
      basePath={basePath}
      rows={rows}
      filterRows={filterApprovalInvoiceRows}
      pinned={decided?.row ?? null}
      onOpenChange={(id) => { if (id !== decided?.row.documentId) setDecided(null) }}
      initialMissingNotice="This invoice was already decided — it's no longer in Ready to Approve."
      rowId={(row) => row.documentId}
      rowName={(row) => ({ title: row.supplier ?? "Unknown supplier", suffix: [row.invoiceNumber, row.total !== null ? formatMoney(row.total, row.currencyCode) : null].filter(Boolean).join(" · ") || null })}
      leading={(row) => <ProcessingStateGlyph state={processingState({ approvalStatus: "in_progress", blockedByCheck: row.eligibility.status !== "ready", escalated: false, touchless: false, status: "needs_review" })} />}
      columns={columns}
      sortOptions={SORTS}
      facets={APPROVAL_INVOICE_FACETS}
      band={<div className="px-4 pt-3"><QueueSegments segments={[
        { key: "invoices", label: "Invoice approvals", count: ownCount, href: basePath },
        { key: "po-mismatches", label: "PO mismatches", count: poMismatchCount, href: basePath.replace(/\/invoices$/, "/po-mismatches") },
      ]} active="invoices" /></div>}
      views={views}
      cards={{ below: "lg", title: "Ready to Approve", render: (row, { open }) => <ApprovalCard row={row} onOpen={open} now={renderedAt} /> }}
      initialSelectedId={initialSelectedId}
      empty={{
        title: "Nothing needs your approval",
        body: "Anything you can decide will show here.",
        action: <span className="flex flex-wrap justify-center gap-x-4 gap-y-1">
          {waitingOnOthers > 0 && <Link href={`${basePath}?approver=anyone`} className="font-medium text-emerald-800 underline-offset-2 hover:underline">{waitingOnOthers} waiting on other approvers</Link>}
          <Link href={`/workspaces/${workspaceId}/invoices`} className="font-medium text-emerald-800 underline-offset-2 hover:underline">Go to Invoices</Link>
        </span>,
        filteredTitle: "No rows match these filters",
        filteredAction: <Link href={basePath} className="font-medium text-emerald-800 underline-offset-2 hover:underline">Clear filters</Link>,
      }}
      loadDetail={(documentId) => getQueueDetailAction(workspaceId, documentId, { initialTab: "approval" })}
      paneActions={(row, helpers) => {
        if (decided && decided.row.documentId === row.documentId) {
          return <DecisionResultStrip decided={decided} next={helpers.next} onBack={() => { setDecided(null); helpers.close() }} />
        }
        const rowError = error?.taskId === row.taskId ? error.message : null
        const isPending = pending?.taskId === row.taskId
        // Decision #5: an ineligible row's Approve is disabled, but Reject stays available —
        // "never overridable from Approvals" is about the underlying check/exception, not about
        // withdrawing the Approval itself.
        const rejectDisabled = !online || !row.canDecide || pending !== null
        const approveDisabled = rejectDisabled || row.eligibility.status !== "ready"
        const disabledReason = !online ? OFFLINE_REASON : !row.canDecide ? "Only this stage's approver can decide it." : row.eligibility.status !== "ready" ? eligibilityText(row) : null
        return <>
          {rowError && <p role="alert" className="w-full text-xs text-red-700 sm:mr-auto sm:w-auto">{rowError}</p>}
          {!rowError && disabledReason && <span className="w-full text-xs text-slate-600 sm:mr-auto sm:w-auto">{disabledReason}</span>}
          {isPending && <span className="w-full text-xs text-slate-600 sm:mr-auto sm:w-auto" aria-live="polite">{pending?.decision === "approve" ? "Approving…" : "Rejecting…"}</span>}
          <Button type="button" size="sm" variant="outline" disabled={rejectDisabled} onClick={() => setRejecting(row)}>Reject</Button>
          <Button type="button" size="sm" disabled={approveDisabled} onClick={() => setApproving(row)}>Approve</Button>
        </>
      }}
      paneMenu={(row) => <>
        <PaneMenuItem tone="amber" disabled={!online || !row.canDecide || phone} hint={phone ? "Send back for review is a desktop action." : undefined} onClick={() => setSendingBack(row)}>
          Send back for review…
        </PaneMenuItem>
      </>} />

    {/* Decision #11: a plain Approve keeps an optional comment, never a required reason. */}
    <ApproveCommentDialog row={approving} onClose={() => setApproving(null)} pending={pending !== null}
      disabledReason={!online ? OFFLINE_REASON : null}
      onApprove={async (comment) => { const row = approving; if (!row) return { success: false, error: "No invoice selected" }; return decide(row, "approve", comment || undefined) }} />

    <ReasonDialog open={rejecting !== null} placement="sheet" onClose={() => setRejecting(null)}
      disabledReason={!online ? OFFLINE_REASON : null} pendingLabel="Rejecting…"
      action={async (formData) => {
        if (!rejecting) return { success: false, error: "No invoice selected" }
        return decide(rejecting, "reject", String(formData.get("reason") || "").trim())
      }}
      title="Reject this Approval"
      description="This ends the approval run for this invoice. The reason goes on the audit trail and to whoever started it."
      submitLabel="Reject"
      placeholder="Why is this being rejected?" />

    <ReasonDialog open={sendingBack !== null} onClose={() => setSendingBack(null)}
      disabledReason={!online ? OFFLINE_REASON : null} pendingLabel="Sending back…"
      action={async (formData) => {
        if (!sendingBack) return { success: false, error: "No invoice selected" }
        const result = await sendApprovalBackForReviewAction(workspaceId, sendingBack.taskId, formData)
        if (result.success) { toast.success("Sent back for review"); router.refresh() }
        return result
      }}
      title="Send back for review"
      description="The invoice returns to review and this run ends — a fresh Approval can be started on it later. The reason is recorded on the audit trail."
      submitLabel="Send back"
      placeholder="Why is this going back for review?" />
  </>
}

/** #257 spec 3.3: the phone/tablet card row for Invoice approvals — one `<a>` per row so a
 * long-press/open-in-new-tab works and the deep-link route already exists; `onClick` prevents
 * default and drives the shared `open()` (pushState per S8). */
function ApprovalCard({ row, onOpen, now }: { row: ApprovalInvoiceRow; onOpen: () => void; now: number }) {
  const notEligible = row.eligibility.status !== "ready"
  const overdue = row.dueDate !== null && row.dueDate.getTime() < now
  return <a href={`#${row.documentId}`} onClick={(event) => { event.preventDefault(); onOpen() }}
    className="flex min-h-16 items-start gap-3 px-4 py-3 hover:bg-slate-50 active:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-inset">
    <ProcessingStateGlyph state={processingState({ approvalStatus: "in_progress", blockedByCheck: notEligible, escalated: false, touchless: false, status: "needs_review" })} />
    <span className="min-w-0 flex-1">
      <span className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[15px] font-semibold text-slate-900">{row.supplier ?? "Unknown supplier"}</span>
        <span className="shrink-0 tabular-nums text-[15px] font-semibold text-slate-900">{row.total !== null ? formatMoney(row.total, row.currencyCode) : <span className="font-normal text-slate-600">No amount</span>}</span>
      </span>
      <span className="mt-0.5 block text-[13px] text-slate-600">
        {row.invoiceNumber ?? "No invoice #"} · <span className={overdue ? "text-red-700" : ""}>Due {formatDate(row.dueDate)}{overdue ? " · overdue" : ""}</span>
      </span>
      <span className="mt-0.5 block text-[13px]">
        {notEligible
          ? <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[12px] font-medium text-amber-900">{eligibilityText(row)}</span>
          : <span className="text-slate-700">{stageLabel(row.stage)}</span>}
      </span>
    </span>
  </a>
}

/** Decision #11's optional-comment Approve. Deliberately not `ReasonDialog`: that component
 * requires non-empty text and disables submit until there's some — the whole point here is that
 * submitting with nothing typed is the common path. */
function ApproveCommentDialog({ row, onClose, onApprove, pending, disabledReason }: {
  row: ApprovalInvoiceRow | null
  onClose: () => void
  /** Resolves like a `ReasonDialog` action: `success: false` keeps the sheet open with the
   * typed comment and shows `error` inline (the network case). */
  onApprove: (comment: string) => Promise<{ success: boolean; error?: string }>
  pending: boolean
  /** Offline inside the open sheet (spec 3.6): submit disabled, sentence under it, comment kept. */
  disabledReason?: string | null
}) {
  const [comment, setComment] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const close = () => { onClose(); setComment(""); setError(null) }
  const description = row ? `${stageLabel(row.stage)}. Approving ${row.nextStageName ? `moves it to ${row.nextStageName}` : "completes the Approval"}.` : ""
  return <Dialog open={row !== null} placement="sheet" initialFocus="textarea" title="Approve this stage" description={description} onClose={() => { if (!pending) close() }}>
    <div className="space-y-3 px-5 py-4">
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-slate-800">Comment (optional)</span>
        <textarea rows={3} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Anything the next approver should know"
          className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-base text-slate-900 transition-colors placeholder:text-slate-500 focus:border-emerald-400 focus:bg-white focus:outline-none sm:text-sm" />
      </label>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {disabledReason && <p role="status" className="text-[13px] text-slate-600">{disabledReason}</p>}
      <div className="flex justify-end gap-2 max-md:grid max-md:grid-cols-2 max-md:[&>button]:h-12">
        <button type="button" className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 max-md:border max-md:border-slate-300" disabled={pending} onClick={close}>Cancel</button>
        <button type="button" className="inline-flex items-center justify-center gap-1.5 rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-40" disabled={pending || !!disabledReason}
          onClick={() => startTransition(async () => {
            setError(null)
            const result = await onApprove(comment.trim())
            if (!result.success) { setError(result.error ?? "Couldn't record that."); return }
            close()
          })}>
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}{pending ? "Approving…" : "Approve"}
        </button>
      </div>
    </div>
  </Dialog>
}
