"use client"

import { useCallback, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import Link from "next/link"
import { withOrigin } from "@/lib/navigation/origin"
import { useOriginHere } from "@/components/documents/po-compare"
import { CheckCircle2, Download, Landmark, Loader2, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { QueueScreen, type QueueColumn, type SortOption } from "@/components/queue/queue-screen"
import type { Facet } from "@/components/queue/facet-filters"
import { TitleCell } from "@/components/queue/row-cells"
import { ReasonDialog } from "@/components/list-screen/reason-dialog-button"
import { MarkPaidDialog } from "@/components/payments/mark-paid-dialog"
import { DiscountCountdownBadge } from "@/components/documents/countdown-badge"
import { formatPaymentDate, formatPaymentDateTime, formatPaymentMoney } from "@/components/payments/format"
import { resolveCountdown } from "@/lib/documents/countdown"
import { BATCH_VIEW_LABEL, type BatchView } from "@/lib/payments/batch-status"
import { approvePaymentBatchAction, getPaymentBatchDetailAction, markPaymentBatchPaidAction, rejectPaymentBatchAction, unmarkPaymentBatchPaidAction } from "@/app/(app)/workspaces/[workspaceId]/(queue)/payments/actions"
import type { PaymentBatchRow } from "@/models/payment-batches"

/** #229 Q11 (#251): the Payment Batches queue — system views Pending approval · Approved ·
 * Paid, Rejected under Closed; the 60% Detail pane with a sticky Reject · Approve while
 * pending, Download payment file · Mark batch as paid once approved. Server-confirmed writes,
 * no optimistic removal, no Undo, no single-key approve (#227's rules). */
export const BATCH_FACETS: Facet[] = [
  {
    param: "view", label: "Status",
    sections: [
      { label: "Open", options: [{ value: "pending_approval", label: "Pending approval" }, { value: "approved", label: "Approved" }] },
      { label: "Closed", options: [{ value: "paid", label: "Paid" }, { value: "rejected", label: "Rejected" }] },
    ],
  },
]

const SORTS: SortOption<PaymentBatchRow>[] = [
  { key: "newest", label: "Newest first", compare: (a, b) => b.createdAt.getTime() - a.createdAt.getTime() },
  { key: "due", label: "Due date", compare: (a, b) => (a.earliestDue?.getTime() ?? Infinity) - (b.earliestDue?.getTime() ?? Infinity) },
  { key: "amount", label: "Total, high to low", compare: (a, b) => b.total - a.total },
]

const PILL: Record<PaymentBatchRow["view"], string> = {
  pending_approval: "bg-blue-100 text-blue-800",
  approved: "bg-emerald-100 text-emerald-800",
  paid: "bg-slate-200 text-slate-800",
  rejected: "bg-amber-100 text-amber-900",
}

export function PaymentBatchQueue({ workspaceId, basePath, rows: serverRows, fallbackCurrency, isOwner, currentUserId, stat, initialSelectedId }: {
  workspaceId: string
  currentUserId: string
  basePath: string
  rows: PaymentBatchRow[]
  fallbackCurrency: string
  isOwner: boolean
  stat?: React.ReactNode
  initialSelectedId?: string | null
}) {
  const router = useRouter()
  const origin = useOriginHere()
  const [approving, setApproving] = useState<PaymentBatchRow | null>(null)
  const [rejecting, setRejecting] = useState<PaymentBatchRow | null>(null)
  const [markingPaid, setMarkingPaid] = useState<PaymentBatchRow | null>(null)
  const [unmarking, setUnmarking] = useState<PaymentBatchRow | null>(null)
  const [busy, setBusy] = useState(false)
  // A decision the server has confirmed shows on the row, the pane subtitle and the footer at
  // once, before `router.refresh()` re-renders the page — never an Approve offered twice. Cleared
  // when fresh rows arrive.
  const [decisions, setDecisions] = useState<{ rows: PaymentBatchRow[]; map: Map<string, BatchView> }>({ rows: serverRows, map: new Map() })
  const decided = decisions.rows === serverRows ? decisions.map : new Map<string, BatchView>()
  const setDecided = (update: (prev: Map<string, BatchView>) => Map<string, BatchView>) => setDecisions((prev) => ({ rows: serverRows, map: update(prev.rows === serverRows ? prev.map : new Map()) }))
  const rows = decided.size === 0 ? serverRows : serverRows.map((batch) => decided.has(batch.id) ? { ...batch, view: decided.get(batch.id)! } : batch)
  // The open pane's refresh (bumps its reloadKey and the route) — a decision re-reads the pane
  // body, not just the row.
  const paneRefresh = useRef<() => void>(() => router.refresh())
  const refreshAll = () => paneRefresh.current()
  // Stable identity: the pane refetches whenever `loadDetail` changes.
  const loadDetail = useCallback((batchId: string) => getPaymentBatchDetailAction(workspaceId, batchId), [workspaceId])
  const money = (value: number, currency: string | null) => formatPaymentMoney(value, currency, fallbackCurrency)

  const columns: QueueColumn<PaymentBatchRow>[] = [
    { key: "name", label: "Batch name", narrow: true, className: "min-w-[11rem]", render: (batch) => <TitleCell title={batch.name} subtitle={batch.comment} /> },
    { key: "status", label: "Status", narrow: true, className: "whitespace-nowrap", render: (batch) => <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${PILL[batch.view]}`}>{BATCH_VIEW_LABEL[batch.view]}</span> },
    { key: "created", label: "Created", className: "whitespace-nowrap tabular-nums text-slate-700", render: (batch) => formatPaymentDateTime(batch.createdAt) },
    { key: "submittedBy", label: "Submitted by", className: "whitespace-nowrap text-slate-700", render: (batch) => batch.submittedBy?.name ?? "—" },
    {
      key: "due", label: "Due", narrow: true, className: "whitespace-nowrap tabular-nums text-slate-700",
      render: (batch) => {
        const countdown = batch.view === "pending_approval" || batch.view === "approved" ? resolveCountdown(batch.earliestDue, new Date(), 3) : null
        return <span className="inline-flex flex-wrap items-center gap-1.5">
          <span>{formatPaymentDate(batch.earliestDue)}</span>
          {countdown && countdown.urgency === "overdue" && <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-800">{countdown.label}</span>}
          {countdown && countdown.urgency === "expiring" && <span className="rounded-full bg-purple-50 px-2 py-0.5 text-xs font-semibold text-purple-700">{countdown.label.replace("Expires", "Due")}</span>}
          {batch.view === "pending_approval" && batch.discountExpiresInDays !== null && <DiscountCountdownBadge daysLeft={batch.discountExpiresInDays} />}
        </span>
      },
    },
    { key: "bills", label: "Bills", className: "whitespace-nowrap text-right tabular-nums text-slate-700", render: (batch) => batch.billCount },
    { key: "total", label: "Total", narrow: true, className: "whitespace-nowrap text-right tabular-nums text-slate-900", render: (batch) => money(batch.total, batch.currencyCode) },
    { key: "currency", label: "Currency", className: "whitespace-nowrap text-slate-700", render: (batch) => batch.currencyCode },
    { key: "payFrom", label: "Pay From", className: "whitespace-nowrap text-slate-700", render: (batch) => batch.payFromLabel },
  ]

  const approve = async () => {
    if (!approving) return
    setBusy(true)
    try {
      const result = await approvePaymentBatchAction(workspaceId, approving.id)
      if (!result.success) { toast.error(result.error ?? "Couldn't approve this batch"); return }
      toast.success(`${approving.name} approved`)
      setDecided((prev) => new Map(prev).set(approving.id, "approved"))
      setApproving(null)
      refreshAll()
    } catch { toast.error("Couldn't reach the server. Nothing changed — try again.") } finally { setBusy(false) }
  }

  return <>
    <QueueScreen<PaymentBatchRow>
      title="Payment Batches"
      basePath={basePath}
      rows={rows}
      rowId={(batch) => batch.id}
      rowTitle={(batch) => batch.name}
      rowSubtitle={(batch) => `${BATCH_VIEW_LABEL[batch.view]} · ${batch.billCount} bill${batch.billCount === 1 ? "" : "s"} · ${money(batch.total, batch.currencyCode)}`}
      columns={columns}
      sortOptions={SORTS}
      facets={BATCH_FACETS}
      sortParam="sort"
      stat={stat}
      initialSelectedId={initialSelectedId}
      empty={{ title: "No batches yet.", body: "Select invoices in Bill Pay to create one.", filteredBody: "Clear a filter to widen the queue." }}
      loadDetail={loadDetail}
      paneActions={(batch, helpers) => {
        paneRefresh.current = helpers.refresh
        if (batch.view === "pending_approval") {
          if (!isOwner) return <p className="mr-auto text-xs text-slate-600">Waiting for an owner to decide it — submitted {formatPaymentDate(batch.createdAt)}.</p>
          return <>
            <Button type="button" className="lg:h-8 lg:text-xs" variant="outline" disabled={busy} onClick={() => setRejecting(batch)}><XCircle className="h-3.5 w-3.5" aria-hidden />Reject…</Button>
            <Button type="button" className="lg:h-8 lg:text-xs" disabled={busy} onClick={() => setApproving(batch)}><CheckCircle2 className="h-3.5 w-3.5" aria-hidden />Approve</Button>
          </>
        }
        if (batch.view === "approved") {
          return <>
            {!isOwner && <p className="mr-auto text-xs text-slate-600">An owner marks it paid once the bank has taken the file.</p>}
            {batch.fileProblems > 0
              ? <Button asChild className="lg:h-8 lg:text-xs" variant="outline"><Link className="py-1.5" href={withOrigin(`/workspaces/${workspaceId}/settings/payments`, origin)}><Landmark className="h-3.5 w-3.5" aria-hidden />Fix bank details to download</Link></Button>
              : <Button asChild className="lg:h-8 lg:text-xs" variant="outline"><a className="py-1.5" href={`/api/workspaces/${workspaceId}/payment-runs/${batch.id}/download`} download onClick={() => { const onFocus = () => { window.removeEventListener("focus", onFocus); refreshAll() }; window.addEventListener("focus", onFocus); window.setTimeout(refreshAll, 2500) }}><Download className="h-3.5 w-3.5" aria-hidden />{batch.exportedAt ? "Download again" : "Download payment file"}</a></Button>}
            {isOwner && <Button type="button" className="lg:h-8 lg:text-xs" disabled={busy} onClick={() => setMarkingPaid(batch)}><CheckCircle2 className="h-3.5 w-3.5" aria-hidden />Mark batch as paid…</Button>}
          </>
        }
        if (batch.view === "paid") return <>
          <p className="mr-auto text-xs text-slate-600">Paid {formatPaymentDate(batch.paidAt)}{batch.paidBy ? ` by ${batch.paidBy.name}` : ""}.</p>
          {isOwner && <Button type="button" className="lg:h-8 lg:text-xs" variant="outline" disabled={busy} onClick={() => setUnmarking(batch)}>Remove payment records…</Button>}
        </>
        return <p className="mr-auto text-xs text-slate-600">Rejected {formatPaymentDate(batch.rejectedAt)}. Its invoices are back on Bill Pay.</p>
      }} />

    <ConfirmDialog open={approving !== null} busy={busy}
      title={`Approve ${approving?.name ?? "this batch"}?`}
      description="Approving makes the payment file available. No money moves until it is uploaded to the bank."
      confirmLabel={busy ? "Approving…" : "Approve batch"}
      onConfirm={() => void approve()} onCancel={() => { if (!busy) setApproving(null) }}>
      {approving && <dl className="space-y-1 text-sm text-slate-700">
        <div className="flex gap-2"><dt className="w-24 shrink-0 font-medium text-slate-800">Batch</dt><dd>{approving.billCount} bill{approving.billCount === 1 ? "" : "s"} · <span className="font-semibold tabular-nums text-slate-900">{money(approving.total, approving.currencyCode)}</span> · Pay From {approving.payFromLabel}</dd></div>
        <div className="flex gap-2"><dt className="w-24 shrink-0 font-medium text-slate-800">Submitted</dt><dd>{approving.submittedBy?.name ?? "—"} · {formatPaymentDateTime(approving.createdAt)}</dd></div>
        {approving.submittedBy?.id === currentUserId && <div className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">You submitted this batch — approving it yourself is allowed and recorded as such.</div>}
        {approving.discountExpiresInDays !== null && <div className="rounded bg-purple-50 px-2 py-1 text-xs text-purple-800">A discount in this batch expires {approving.discountExpiresInDays === 0 ? "today" : `in ${approving.discountExpiresInDays} day${approving.discountExpiresInDays === 1 ? "" : "s"}`}; the file pays the discounted amount.</div>}
      </dl>}
    </ConfirmDialog>

    <ReasonDialog open={unmarking !== null} onClose={() => setUnmarking(null)}
      action={async (formData) => {
        if (!unmarking) return { success: false, error: "No batch selected" }
        const result = await unmarkPaymentBatchPaidAction(workspaceId, unmarking.id, formData)
        if (result.success) { toast.success(`${unmarking.name} is Approved again — its payment records are removed`); setDecided((prev) => new Map(prev).set(unmarking.id, "approved")); refreshAll() }
        return result
      }}
      title={`Remove the payment records of ${unmarking?.name ?? "this batch"}`}
      description="Every invoice in the batch reads Scheduled again and the batch returns to Approved. The payment file stays a fact. The reason is kept on the audit trail."
      submitLabel="Remove payment records"
      placeholder="Why was this batch marked paid in error?" />

    <ReasonDialog open={rejecting !== null} onClose={() => setRejecting(null)}
      action={async (formData) => {
        if (!rejecting) return { success: false, error: "No batch selected" }
        const result = await rejectPaymentBatchAction(workspaceId, rejecting.id, formData)
        if (result.success) { toast.success(`${rejecting.name} rejected — its invoices are back on Bill Pay`); setDecided((prev) => new Map(prev).set(rejecting.id, "rejected")); refreshAll() }
        return result
      }}
      title={`Reject ${rejecting?.name ?? "this batch"}`}
      description="The batch closes and every invoice in it returns to Bill Pay. The reason is recorded on the batch and the audit trail."
      submitLabel="Reject batch"
      placeholder="Why is this batch being rejected?" />

    <MarkPaidDialog open={markingPaid !== null} onClose={() => setMarkingPaid(null)}
      title={`Mark ${markingPaid?.name ?? "this batch"} as paid`}
      description="Records a payment for every invoice in the batch. The ledger isn't changed; the invoices read “Paid (recorded)” until it confirms."
      submitLabel="Mark batch as paid"
      recap={markingPaid && <div className="space-y-2">
        <p className="border-y border-slate-200 py-2 text-sm text-slate-700">{markingPaid.billCount} bill{markingPaid.billCount === 1 ? "" : "s"} · <span className="font-semibold tabular-nums text-slate-900">{money(markingPaid.total, markingPaid.currencyCode)}</span> · Pay From {markingPaid.payFromLabel}</p>
        {!markingPaid.exportedAt && <p role="alert" className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">The payment file hasn&apos;t been downloaded yet — nobody has taken this batch to the bank from here. Mark it paid only if the payment was made another way.</p>}
        <p className="text-xs text-slate-600">Reversal is “Remove payment records…” on the batch, with a reason.</p>
      </div>}
      onSubmit={async (input) => {
        if (!markingPaid) return { success: false, error: "No batch selected" }
        const result = await markPaymentBatchPaidAction(workspaceId, markingPaid.id, input)
        if (result.success) { toast.success(`${markingPaid.name} marked paid`); setDecided((prev) => new Map(prev).set(markingPaid.id, "paid")); refreshAll() }
        return result
      }} />
    {busy && <span className="sr-only" role="status"><Loader2 className="inline h-3 w-3" aria-hidden />Working…</span>}
  </>
}
