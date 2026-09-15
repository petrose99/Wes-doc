"use client"

import { useRef, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { QueueScreen, type QueueColumn, type SortOption } from "@/components/queue/queue-screen"
import { PaneMenuItem } from "@/components/queue/detail-pane"
import { DocumentBulkActions, DocumentPaneActions } from "@/components/queue/document-actions"
import { formatDate, formatMoney, StatePills, TitleCell } from "@/components/queue/row-cells"
import { ReasonDialog } from "@/components/list-screen/reason-dialog-button"
import type { Facet } from "@/components/queue/facet-filters"
import { ApprovalBulkAction, type ApprovalWorkflowOption } from "@/components/typed-destinations/approval-bulk-action"
import { ConfidenceField, ProcessingStateGlyph } from "@/components/typed-destinations/row-signals"
import { processingState } from "@/lib/documents/processing-state"
import { EligibilityStrip, ItemizedRecapTable, type ItemizedRecord } from "@/components/typed-destinations/bulk-approve-receipt"
import { DueDateCountdownBadge, ReviewSlaCountdownBadge } from "@/components/documents/countdown-badge"
import { DEFAULT_REVIEW_SLA_HOURS } from "@/lib/documents/countdown"
import { minConfidenceFromPercent } from "@/lib/documents/confidence-state"
import { bulkExportDocumentsAction } from "@/app/(app)/workspaces/[workspaceId]/pipeline-actions"
import { cancelInvoiceAction } from "@/app/(app)/workspaces/[workspaceId]/actions"
import { getQueueDetailAction } from "@/app/(app)/workspaces/[workspaceId]/queue-actions"
import { downloadCsv } from "@/lib/client/download-csv"
import type { BillRow } from "@/models/bills"

/** #225: the Invoices queue on the shared Queue screen. Status and Invoice Approval keep #211's
 * taxonomy, now as summary chips over a hierarchical facet panel (Open sub-states vs Closed);
 * Aging joins them as a chip group in place of #186's six header cards. */
export const INVOICE_FACETS: Facet[] = [
  {
    param: "status", label: "Status",
    sections: [
      { label: "Open", options: [{ value: "unreviewed", label: "Unreviewed" }, { value: "reviewed", label: "Reviewed" }, { value: "synced", label: "Synced" }] },
      { label: "Closed", options: [{ value: "paid", label: "Paid" }] },
    ],
  },
  {
    param: "approval", label: "Invoice Approval",
    options: [
      { value: "not_started", label: "Not started" }, { value: "in_progress", label: "In progress" }, { value: "approved", label: "Approved" },
      { value: "rejected", label: "Rejected" }, { value: "cancelled", label: "Cancelled" },
    ],
  },
  {
    param: "aging", label: "Aging", kind: "multi",
    options: [
      { value: "current", label: "Current" }, { value: "1-30", label: "1–30 days overdue" }, { value: "31-60", label: "31–60 days" },
      { value: "61-90", label: "61–90 days" }, { value: "90+", label: "90+ days" }, { value: "none", label: "No due date" },
    ],
  },
  { param: "blocked", label: "Needs attention", kind: "toggle", options: [{ value: "1", label: "Needs attention only" }] },
  { param: "unpaid", label: "Unpaid", kind: "toggle", options: [{ value: "1", label: "Unpaid only" }] },
  { param: "touchless", label: "Touchless", kind: "toggle", options: [{ value: "1", label: "Touchless only" }] },
]

const SORTS: SortOption<BillRow>[] = [
  { key: "newest", label: "Newest first", compare: () => 0 },
  { key: "due", label: "Due date", compare: (a, b) => (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity) },
  { key: "amount", label: "Amount, high to low", compare: (a, b) => (b.total ?? -Infinity) - (a.total ?? -Infinity) },
  { key: "supplier", label: "Supplier A–Z", compare: (a, b) => (a.supplier ?? "￿").localeCompare(b.supplier ?? "￿") },
]

export function InvoiceQueue({ workspaceId, basePath, bills, payableDocumentIds, preparePaymentRunAction, minConfidencePercent, availableWorkflows = [], views, stat, initialSelectedId }: {
  workspaceId: string
  basePath: string
  bills: BillRow[]
  payableDocumentIds: string[]
  preparePaymentRunAction: (formData: FormData) => Promise<void>
  minConfidencePercent: number
  /** #236: active ApprovalWorkflows this workspace can Start on a selection — empty when the
   * approval-workflows module is off, or none are configured yet, in which case the Approval ▾
   * bulk control doesn't render at all. */
  availableWorkflows?: ApprovalWorkflowOption[]
  views?: ReactNode
  stat?: ReactNode
  initialSelectedId?: string | null
}) {
  const router = useRouter()
  const [needsAttention, setNeedsAttention] = useState<Set<string>>(new Set())
  const [cancelling, setCancelling] = useState<BillRow | null>(null)
  const minConfidence = minConfidenceFromPercent(minConfidencePercent)
  const billsById = new Map(bills.map((bill) => [bill.documentId, bill]))
  const toRecord = (id: string): ItemizedRecord => {
    const bill = billsById.get(id)
    return { id, type: "Invoice", vendor: bill?.supplier ?? null, number: bill?.invoiceNumber ?? null, amount: bill?.total ?? null, currencyCode: bill?.currencyCode ?? null, dateLabel: "Due", date: bill?.dueDate ?? null }
  }

  const columns: QueueColumn<BillRow>[] = [
    {
      key: "supplier", label: "Supplier", narrow: true, className: "min-w-[12rem]",
      render: (bill) => <TitleCell subtitle={bill.filename} missingLabel="Unknown supplier"
        title={bill.supplier ? <ConfidenceField label="Supplier" value={bill.fieldConfidence.vendor ?? bill.fieldConfidence.merchant} minConfidence={minConfidence}>{bill.supplier}</ConfidenceField> : null} />,
    },
    {
      key: "number", label: "Invoice #", className: "whitespace-nowrap text-slate-700",
      render: (bill) => <ConfidenceField label="Invoice number" value={bill.invoiceNumber ? bill.fieldConfidence.invoice_number : undefined} minConfidence={minConfidence}>{bill.invoiceNumber ?? "—"}</ConfidenceField>,
    },
    {
      key: "amount", label: "Amount", narrow: true, className: "whitespace-nowrap text-right tabular-nums text-slate-900",
      render: (bill) => <ConfidenceField label="Amount" value={bill.total !== null ? bill.fieldConfidence.total ?? bill.fieldConfidence.amount : undefined} minConfidence={minConfidence}>{bill.total !== null ? formatMoney(bill.total, bill.currencyCode) : "—"}</ConfidenceField>,
    },
    {
      key: "due", label: "Due", narrow: true, className: "whitespace-nowrap tabular-nums text-slate-700",
      render: (bill) => <>
        <ConfidenceField label="Due date" value={bill.extractedDueDate ? bill.fieldConfidence.due_date : undefined} minConfidence={minConfidence}>{formatDate(bill.dueDate)}</ConfidenceField>
        {bill.dueDate && !bill.extractedDueDate && <span className="ml-1.5 text-xs text-slate-500" title="From the supplier's payment terms, not the document">inferred</span>}
      </>,
    },
    { key: "aging", label: "Aging", className: "whitespace-nowrap", render: (bill) => <DueDateCountdownBadge dueDate={bill.dueDate} /> },
    {
      key: "state", label: "State",
      render: (bill) => <StatePills minConfidencePercent={minConfidencePercent}
        cancelled={!!bill.cancelledAt} cancelledReason={bill.cancelledReason}
        needsAttention={bill.blockedByCheck || needsAttention.has(bill.documentId) || bill.approvalStatus === "rejected"} openCheckCodes={bill.openCheckCodes}
        inReview={bill.approvalStatus === "in_progress"} touchless={bill.touchless} approved={bill.status === "reviewed"}
        ledger={bill.paymentStatus}
        trailing={<ReviewSlaCountdownBadge openedAt={bill.reviewTaskOpenedAt} slaHours={DEFAULT_REVIEW_SLA_HOURS} />} />,
    },
  ]

  const exportAll = async () => {
    const result = await bulkExportDocumentsAction(workspaceId, bills.map((bill) => bill.documentId))
    if (!result.success || !result.data) { toast.error(result.error || "Export failed"); return }
    downloadCsv(result.data.csv, "invoices.csv")
    toast.success(`Exported ${bills.length} invoices`)
  }

  const cancelInfo = (bill: BillRow) => {
    if (bill.cancelledAt) return null
    const status = bill.paymentStatus?.toLowerCase() ?? null
    if (status === "synced") return { canCancel: false, reason: "Already synced to your ledger, so it can no longer be cancelled." }
    if (status === "paid" || status === "reconciled") return { canCancel: false, reason: "Already paid, so it can no longer be cancelled." }
    return { canCancel: true, reason: null }
  }

  return <>
    <QueueScreen<BillRow>
      title="Invoices"
      basePath={basePath}
      rows={bills}
      rowId={(bill) => bill.documentId}
      rowTitle={(bill) => bill.supplier ?? "Unknown supplier"}
      rowSubtitle={(bill) => [bill.invoiceNumber, bill.total !== null ? formatMoney(bill.total, bill.currencyCode) : null].filter(Boolean).join(" · ") || bill.filename}
      // #223: the leading edge is the five-state processing glyph, not the aging bucket (aging lives
      // in the countdown badge's own text since #208).
      leading={(bill) => <ProcessingStateGlyph
        state={processingState({ approvalStatus: bill.approvalStatus, blockedByCheck: bill.blockedByCheck, escalated: bill.escalated, touchless: bill.touchless, status: bill.status })}
        minConfidencePercent={minConfidencePercent} />}
      columns={columns}
      selectable
      sortOptions={SORTS}
      facets={INVOICE_FACETS}
      views={views}
      stat={stat}
      onExportAll={exportAll}
      initialSelectedId={initialSelectedId}
      empty={{ title: "No invoices yet.", body: "Invoices appear here once one is extracted from an upload or an inbound email.", filteredBody: "Clear a filter to widen the queue." }}
      loadDetail={(documentId) => getQueueDetailAction(workspaceId, documentId)}
      bulkActions={({ selectedIds, clear }) => <DocumentBulkActions
        workspaceId={workspaceId} noun="invoice" selectedIds={selectedIds} clear={clear} toRecord={toRecord}
        eligibleIds={selectedIds.filter((id) => !billsById.get(id)?.blockedByCheck)} exportFilename="invoices.csv"
        onHeldBack={(heldBack, approved) => setNeedsAttention((prev) => { const next = new Set(prev); for (const id of heldBack) next.add(id); for (const id of approved) next.delete(id); return next })}
        extra={<>
          <ApprovalBulkAction workspaceId={workspaceId} selectedIds={selectedIds} clear={clear} toRecord={toRecord} workflows={availableWorkflows}
            startEligibleIds={selectedIds.filter((id) => { const status = billsById.get(id)?.approvalStatus; return status === "not_started" || status === "rejected" })}
            cancelEligibleIds={selectedIds.filter((id) => billsById.get(id)?.approvalStatus === "in_progress")} />
          <PaymentRunAction selectedIds={selectedIds} payableDocumentIds={payableDocumentIds} preparePaymentRunAction={preparePaymentRunAction} toRecord={toRecord} />
        </>} />}
      paneActions={(bill, { refresh }) => <DocumentPaneActions workspaceId={workspaceId} documentId={bill.documentId} noun="invoice"
        status={bill.status} openReviewTaskId={bill.openReviewTaskId} cancelled={!!bill.cancelledAt} onDone={refresh} />}
      paneMenu={(bill) => {
        const info = cancelInfo(bill)
        return <>
          <PaneMenuItem onClick={() => window.open(`${basePath}/${bill.documentId}?full=1`, "_blank", "noopener")}>
            <ExternalLink className="mr-2 h-4 w-4 text-slate-500" aria-hidden />Open in a new tab
          </PaneMenuItem>
          {info && <PaneMenuItem tone="amber" disabled={!info.canCancel} hint={info.reason ?? undefined} onClick={() => setCancelling(bill)}>Cancel invoice…</PaneMenuItem>}
        </>
      }} />

    <ReasonDialog open={cancelling !== null} onClose={() => setCancelling(null)}
      action={async (formData) => {
        if (!cancelling) return { success: false, error: "No invoice selected" }
        const result = await cancelInvoiceAction(workspaceId, cancelling.documentId, formData)
        if (result.success) { toast.success("Invoice cancelled"); router.refresh() }
        return result
      }}
      title="Cancel this invoice"
      description="This is final. There is no way to un-cancel once confirmed. The reason is recorded on the audit trail."
      submitLabel="Cancel invoice"
      placeholder="Why is this invoice being cancelled?" />
  </>
}

/** Invoices' surface-specific bulk action: the payment-run file for the eligible selection. */
function PaymentRunAction({ selectedIds, payableDocumentIds, preparePaymentRunAction, toRecord }: {
  selectedIds: string[]
  payableDocumentIds: string[]
  preparePaymentRunAction: (formData: FormData) => Promise<void>
  toRecord: (id: string) => ItemizedRecord
}) {
  const [confirming, setConfirming] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const payable = selectedIds.filter((id) => payableDocumentIds.includes(id))
  if (payable.length === 0) return null
  return <>
    <form ref={formRef} action={preparePaymentRunAction} className="hidden">
      {payable.map((id) => <input key={id} type="hidden" name="documentId" value={id} />)}
    </form>
    <Button type="button" size="sm" variant="outline" onClick={() => setConfirming(true)}>Prepare payment run ({payable.length})</Button>
    <ConfirmDialog
      open={confirming}
      title={`Prepare a payment run for ${payable.length} invoice${payable.length === 1 ? "" : "s"}?`}
      description="Downloads a payment file for the eligible invoices below. No money moves."
      confirmLabel={`Prepare payment run (${payable.length})`}
      onConfirm={() => { setConfirming(false); formRef.current?.requestSubmit() }}
      onCancel={() => setConfirming(false)}>
      <div className="space-y-2">
        <EligibilityStrip eligible={payable.length} total={selectedIds.length} />
        <ItemizedRecapTable records={payable.map(toRecord)} />
      </div>
    </ConfirmDialog>
  </>
}
