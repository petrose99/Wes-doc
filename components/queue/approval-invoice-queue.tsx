"use client"

import { useState, useTransition, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ExternalLink, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { QueueScreen, type QueueColumn, type SortOption } from "@/components/queue/queue-screen"
import { PaneMenuItem } from "@/components/queue/detail-pane"
import { formatDate, formatMoney, TitleCell } from "@/components/queue/row-cells"
import { ReasonDialog } from "@/components/list-screen/reason-dialog-button"
import type { Facet } from "@/components/queue/facet-filters"
import { ApprovalsQueuePicker } from "@/components/typed-destinations/approvals-queue-picker"
import { ProcessingStateGlyph } from "@/components/typed-destinations/row-signals"
import { processingState } from "@/lib/documents/processing-state"
import { useOnlineStatus } from "@/lib/client/use-online-status"
import { decideReviewTaskStageAction } from "@/app/(app)/workspaces/[workspaceId]/review-actions"
import { sendApprovalBackForReviewAction } from "@/app/(app)/workspaces/[workspaceId]/(queue)/approvals/actions"
import { getQueueDetailAction } from "@/app/(app)/workspaces/[workspaceId]/queue-actions"
import type { ApprovalInvoiceRow } from "@/models/approvals"

export const APPROVAL_INVOICE_FACETS: Facet[] = [
  { param: "status", label: "Status", options: [{ value: "not_eligible", label: "Not eligible" }], allLabel: "Ready to approve" },
  { param: "approver", label: "Approver", options: [{ value: "anyone", label: "Anyone" }], allLabel: "Me" },
]

const SORTS: SortOption<ApprovalInvoiceRow>[] = [
  { key: "waiting", label: "Waiting longest", compare: (a, b) => a.waitingSince.getTime() - b.waitingSince.getTime() },
  { key: "amount", label: "Amount, high to low", compare: (a, b) => (b.total ?? -Infinity) - (a.total ?? -Infinity) },
  { key: "due", label: "Due date", compare: (a, b) => (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity) },
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
  rows: ApprovalInvoiceRow[]
  poMismatchCount: number
  /** The saved-view picker (#201) — composed here, after the queue picker, matching every other
   * typed destination's `views` slot; PO Mismatches has no saved views yet, so it omits this. */
  views?: ReactNode
  initialSelectedId?: string | null
}) {
  const router = useRouter()
  const online = useOnlineStatus()
  const [pending, setPending] = useState<{ taskId: string; decision: "approve" | "reject" } | null>(null)
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
  const decide = async (row: ApprovalInvoiceRow, decision: "approve" | "reject", note: string | undefined, onSettled: () => void) => {
    setError(null)
    setPending({ taskId: row.taskId, decision })
    try {
      const result = await decideReviewTaskStageAction(workspaceId, row.taskId, decision, note)
      if (!result.success) { setError({ taskId: row.taskId, message: result.error || "Could not record that decision" }); router.refresh(); return }
      toast.success(decision === "approve" ? "Approved" : "Rejected")
      onSettled()
    } catch {
      setError({ taskId: row.taskId, message: "Could not reach the server" })
      router.refresh()
    } finally {
      setPending(null)
    }
  }

  return <>
    <QueueScreen<ApprovalInvoiceRow>
      title="Invoices"
      basePath={basePath}
      rows={rows}
      rowId={(row) => row.documentId}
      rowTitle={(row) => row.supplier ?? "Unknown supplier"}
      rowSubtitle={(row) => [row.invoiceNumber, row.total !== null ? formatMoney(row.total, row.currencyCode) : null].filter(Boolean).join(" · ") || null}
      leading={(row) => <ProcessingStateGlyph state={processingState({ approvalStatus: "in_progress", blockedByCheck: row.eligibility.status !== "ready", escalated: false, touchless: false, status: "needs_review" })} />}
      columns={columns}
      sortOptions={SORTS}
      facets={APPROVAL_INVOICE_FACETS}
      views={<>
        <ApprovalsQueuePicker workspaceId={workspaceId} active="invoices" invoiceCount={rows.length} poMismatchCount={poMismatchCount} />
        {views}
      </>}
      initialSelectedId={initialSelectedId}
      empty={{
        title: "Nothing to approve right now.",
        body: "Ready to Approve shows every submitted Approval whose current stage you can decide. Start one from the Invoices bulk-action bar (Approval ▾ → Start).",
        filteredTitle: "Nothing matches these filters.",
        filteredBody: "Try Approver · Anyone to see Approvals pending on other approvers.",
      }}
      loadDetail={(documentId) => getQueueDetailAction(workspaceId, documentId, { initialTab: "approval" })}
      paneActions={(row) => {
        const rowError = error?.taskId === row.taskId ? error.message : null
        const isPending = pending?.taskId === row.taskId
        // Decision #5: an ineligible row's Approve is disabled, but Reject stays available —
        // "never overridable from Approvals" is about the underlying check/exception, not about
        // withdrawing the Approval itself.
        const rejectDisabled = !online || !row.canDecide || pending !== null
        const approveDisabled = rejectDisabled || row.eligibility.status !== "ready"
        const disabledReason = !online ? "You're offline — reconnect to decide this Approval." : !row.canDecide ? "Only this stage's approver can decide it." : row.eligibility.status !== "ready" ? eligibilityText(row) : null
        return <>
          {rowError && <p role="alert" className="w-full text-xs text-red-700 sm:mr-auto sm:w-auto">{rowError}</p>}
          {!rowError && disabledReason && <span className="w-full text-xs text-slate-600 sm:mr-auto sm:w-auto">{disabledReason}</span>}
          {isPending && <span className="w-full text-xs text-slate-600 sm:mr-auto sm:w-auto" aria-live="polite">{pending?.decision === "approve" ? "Approving…" : "Rejecting…"}</span>}
          <Button type="button" size="sm" variant="outline" disabled={rejectDisabled} onClick={() => setRejecting(row)}>Reject</Button>
          <Button type="button" size="sm" disabled={approveDisabled} onClick={() => setApproving(row)}>Approve</Button>
        </>
      }}
      paneMenu={(row) => <>
        <PaneMenuItem onClick={() => window.open(`${basePath}/${row.documentId}?full=1`, "_blank", "noopener")}>
          <ExternalLink className="mr-2 h-4 w-4 text-slate-500" aria-hidden />Open in a new tab
        </PaneMenuItem>
        <PaneMenuItem tone="amber" disabled={!online || !row.canDecide} onClick={() => setSendingBack(row)}>
          Send back for review…
        </PaneMenuItem>
      </>} />

    {/* Decision #11: a plain Approve keeps an optional comment, never a required reason. */}
    <ApproveCommentDialog row={approving} onClose={() => setApproving(null)} pending={pending !== null}
      onApprove={(comment) => { const row = approving; if (row) void decide(row, "approve", comment || undefined, () => { setApproving(null); router.refresh() }) }} />

    <ReasonDialog open={rejecting !== null} onClose={() => setRejecting(null)}
      action={async (formData) => {
        if (!rejecting) return { success: false, error: "No invoice selected" }
        const reason = String(formData.get("reason") || "").trim()
        const result = await decideReviewTaskStageAction(workspaceId, rejecting.taskId, "reject", reason)
        if (result.success) { toast.success("Rejected"); router.refresh() }
        return result
      }}
      title="Reject this Approval"
      description="Ends this Approval's run. The reason is recorded on the audit trail."
      submitLabel="Reject"
      placeholder="Why is this being rejected?" />

    <ReasonDialog open={sendingBack !== null} onClose={() => setSendingBack(null)}
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

/** Decision #11's optional-comment Approve. Deliberately not `ReasonDialog`: that component
 * requires non-empty text and disables submit until there's some — the whole point here is that
 * submitting with nothing typed is the common path. */
function ApproveCommentDialog({ row, onClose, onApprove, pending }: {
  row: ApprovalInvoiceRow | null
  onClose: () => void
  onApprove: (comment: string) => void
  pending: boolean
}) {
  const [comment, setComment] = useState("")
  const [, startTransition] = useTransition()
  return <Dialog open={row !== null} title="Approve this stage" description={row ? `${stageLabel(row.stage)} — an optional comment is recorded on the audit trail.` : ""} onClose={() => { if (!pending) { onClose(); setComment("") } }}>
    <div className="space-y-3 px-5 py-4">
      <textarea rows={3} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Comment (optional)"
        className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm transition-colors focus:border-emerald-400 focus:bg-white focus:outline-none" />
      <div className="flex justify-end gap-2">
        <button type="button" className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100" disabled={pending} onClick={() => { onClose(); setComment("") }}>Cancel</button>
        <button type="button" className="inline-flex items-center gap-1.5 rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-40" disabled={pending}
          onClick={() => startTransition(() => { onApprove(comment.trim()); setComment("") })}>
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}Approve
        </button>
      </div>
    </div>
  </Dialog>
}
