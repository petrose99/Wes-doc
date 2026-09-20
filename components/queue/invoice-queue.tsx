"use client"

import type { QueueArrival } from "@/lib/navigation/origin-server"
import { useRef, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { QueueScreen, type QueueColumn, type SortOption } from "@/components/queue/queue-screen"
import { joinSegments } from "@/components/queue/queue-card"
import { InboundAddressLine } from "@/components/intake/inbound-address-line"
import { AddTypeButton, type AddTypeButtonHandle } from "@/components/intake/add-type-button"
import type { SheetTemplate } from "@/components/extract/types"
import type { FieldTable } from "@/lib/configuration/field-table"
import { PaneMenuItem } from "@/components/queue/detail-pane"
import { DocumentBulkActions, DocumentPaneActions } from "@/components/queue/document-actions"
import { formatDate, formatMoney, StatePills, TitleCell } from "@/components/queue/row-cells"
import { StatusLine } from "@/components/queue/status-line"
import { processingFact } from "@/lib/documents/processing-fact"
import { PoChip, useOriginHere } from "@/components/documents/po-compare"
import { ReasonDialog } from "@/components/list-screen/reason-dialog-button"
import type { Facet } from "@/components/queue/facet-filters"
import { ApprovalBulkAction, type ApprovalWorkflowOption } from "@/components/typed-destinations/approval-bulk-action"
import { PostConfirmDialog } from "@/components/queue/post-confirm-dialog"
import { ConnectionBand } from "@/components/queue/connection-band"
import type { LedgerBandStatus } from "@/lib/integration-push"
import { Button } from "@/components/ui/button"
import { Send } from "lucide-react"
import { ConfidenceField, ProcessingStateGlyph } from "@/components/typed-destinations/row-signals"
import { PROCESSING_STATES, PROCESSING_STATE_LABELS, processingState } from "@/lib/documents/processing-state"
import { type ItemizedRecord } from "@/components/typed-destinations/bulk-approve-receipt"
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
    // #258: the one status vocabulary — the five processing states plus the ledger's own two
    // facts, in two sections so "Status" still reads as one chip.
    param: "status", label: "Status",
    sections: [
      {
        label: "Processing state", options: PROCESSING_STATES.map((value) => ({ value, label: PROCESSING_STATE_LABELS[value] })),
      },
      { label: "Ledger", options: [
        { value: "posting", label: "Posting…" }, { value: "posted", label: "Posted" },
        { value: "failed", label: "Post failed" }, { value: "paid", label: "Paid" },
      ] },
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
  // #228 Q6: the Purchase Orders facet. Matched = a compared PO with nothing red; No PO = nothing
  // compared (none, a suggestion only, or a rejected link); Mismatch = a compared PO with `≠`s.
  { param: "po", label: "PO", options: [{ value: "matched", label: "Matched" }, { value: "none", label: "No PO" }, { value: "mismatch", label: "Mismatch" }] },
  { param: "blocked", label: "Needs attention", kind: "toggle", options: [{ value: "1", label: "Needs attention only" }] },
  { param: "unpaid", label: "Unpaid", kind: "toggle", options: [{ value: "1", label: "Unpaid only" }] },
  { param: "touchless", label: "Touchless", kind: "toggle", options: [{ value: "1", label: "Touchless only" }] },
]

function poSubtitle(bill: BillRow): string | null {
  const po = bill.po
  if (po.removed) return "PO removed"
  if (!po.kind) return null
  if (po.kind === "suggested") return po.suggestionCount > 1 ? `${po.suggestionCount} likely POs` : `Likely ${po.poNumber ?? "PO"}`
  return `${po.poNumber ?? "PO"}${po.mismatchCount ? ` · ${po.mismatchCount} mismatch${po.mismatchCount === 1 ? "" : "es"}` : ""}`
}

const SORTS: SortOption<BillRow>[] = [
  { key: "newest", label: "Newest first", compare: () => 0 },
  { key: "due", label: "Due date", compare: (a, b) => (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity) },
  { key: "amount", label: "Amount, high to low", compare: (a, b) => (b.total ?? -Infinity) - (a.total ?? -Infinity) },
  { key: "supplier", label: "Supplier A–Z", compare: (a, b) => (a.supplier ?? "￿").localeCompare(b.supplier ?? "￿") },
]

export function InvoiceQueue({ workspaceId, basePath, bills, minConfidencePercent, availableWorkflows = [], views, viewsPhone, stat, initialSelectedId, fieldTable = null, workspaceDocumentCount, todayOutcome, inboundAddress, fileId, templates, arrival, connectionId = null, connectionBandStatus = null, isOwner = false }: {
  workspaceId: string
  basePath: string
  bills: BillRow[]
  minConfidencePercent: number
  /** #236: active ApprovalWorkflows this workspace can Start on a selection — empty when the
   * approval-workflows module is off, or none are configured yet, in which case the Approval ▾
   * bulk control doesn't render at all. */
  availableWorkflows?: ApprovalWorkflowOption[]
  views?: ReactNode
  /** #261: the phone filter row's Views select. */
  viewsPhone?: ReactNode
  stat?: ReactNode
  initialSelectedId?: string | null
  /** #252: Admin › Configuration › Fields for invoices, when one has been saved. */
  fieldTable?: FieldTable | null
  /** #264: has the workspace ever held a document (any type) — decides first-use vs. done. */
  workspaceDocumentCount: number
  /** #264: the done state's "n approved today, m posted." sentence. */
  todayOutcome: { approvedToday: number; postedToday: number }
  /** #264 spec §3.1: `${token}@${domain}`, or null when email intake is off or the token could
   * not be issued (healthcare workspace) — first-use then omits the address line entirely. */
  inboundAddress: string | null
  /** #266: `ensurePipelineFile`'s id (upload target) and its Document-type choices, for the
   * header Add button/drop zone/dialog. */
  fileId: string
  templates: SheetTemplate[]
  /** #268: the Origin strip's model + the missing-row notice, from `queueArrival` on the server. */
  arrival?: QueueArrival
  /** #281: the workspace's active ledger connection id, or null with none/inactive — the bulk
   * Post button still shows (§3's enablement rule never hides it), but every row reads ineligible
   * and the confirm dialog's Post stays disabled until a connection exists. */
  connectionId?: string | null
  /** #281 spec.md §6: the connection-failure band's cause, null when connected and healthy (band
   * hidden) or integrations are off. */
  connectionBandStatus?: LedgerBandStatus | null
  isOwner?: boolean
}) {
  const router = useRouter()
  const origin = useOriginHere()
  const addButtonRef = useRef<AddTypeButtonHandle>(null)
  const [needsAttention, setNeedsAttention] = useState<Set<string>>(new Set())
  // #261: the card's "overdue" reads against one instant per mount (the same as Approvals' card).
  const [renderedAt] = useState(() => Date.now())
  const [cancelling, setCancelling] = useState<BillRow | null>(null)
  const [posting, setPosting] = useState<string[] | null>(null)
  const minConfidence = minConfidenceFromPercent(minConfidencePercent)
  const billsById = new Map(bills.map((bill) => [bill.documentId, bill]))
  const toRecord = (id: string): ItemizedRecord => {
    const bill = billsById.get(id)
    return { id, type: "Invoice", vendor: bill?.supplier ?? null, number: bill?.invoiceNumber ?? null, amount: bill?.total ?? null, currencyCode: bill?.currencyCode ?? null, dateLabel: "Due", date: bill?.dueDate ?? null }
  }
  // #281 spec.md §2: the client's eligibility guess (never the gate — the server re-resolves at
  // confirm time). Limited to signals BillRow already carries; category/currency confirmation
  // isn't one of them, so a row this marks eligible can still come back ineligible server-side —
  // that outcome shows in the confirm dialog's per-row reason, not as a silent drop (H9).
  const postEligible = (bill: BillRow) => !bill.cancelledAt && bill.status === "reviewed" && bill.paymentStatus?.toLowerCase() !== "posted"
  // #281 spec.md §7: the pane ⋯'s "Post to ledger" reason — the same guess as `postEligible`,
  // named so a keyboard/screen-reader user gets it via `aria-describedby` (H6), not a hover tooltip.
  const postIneligibleReason = (bill: BillRow): string | null => {
    if (!connectionId) return "No ledger connected"
    if (bill.cancelledAt) return "Invoice is cancelled"
    if (bill.status !== "reviewed") return "Not yet reviewed"
    if (bill.paymentStatus?.toLowerCase() === "posted") return "Already posted to your ledger"
    return null
  }

  // One state per row, shared by the leading glyph and the State column / pane Status line
  // (#258): heldBack folds in here so the glyph and the pill can no longer disagree (#258 closed
  // that split).
  const billState = (bill: BillRow) => processingState({
    approvalStatus: bill.approvalStatus, blockedByCheck: bill.blockedByCheck, escalated: bill.escalated,
    touchless: bill.touchless, status: bill.status, heldBack: needsAttention.has(bill.documentId),
  })
  const billLedger = (bill: BillRow) => bill.paidState.state !== "unpaid" ? bill.paidState.label : bill.paymentStatus
  // The queue column keeps the pill only (StatePills); the pane's Status line (#234) adds the
  // fact sentence — both share the same `state` so they can't disagree.
  const statePills = (bill: BillRow) => <StatePills state={billState(bill)}
    openCheckCodes={bill.openCheckCodes} cancelledReason={bill.cancelledReason} ledger={billLedger(bill)}
    trailing={<ReviewSlaCountdownBadge openedAt={bill.reviewTaskOpenedAt} slaHours={DEFAULT_REVIEW_SLA_HOURS} />} />
  const paneStatus = (bill: BillRow) => {
    const state = billState(bill)
    const fact = processingFact({
      approvalStatus: bill.approvalStatus, blockedByCheck: bill.blockedByCheck, escalated: bill.escalated,
      touchless: bill.touchless, status: bill.status, heldBack: needsAttention.has(bill.documentId),
      cancelledReason: bill.cancelledReason, reviewTaskOpenedAt: bill.reviewTaskOpenedAt, receivedAt: bill.receivedAt,
      openCheckCodes: bill.openCheckCodes,
      approvedBy: bill.status === "reviewed" ? { actorName: null, at: bill.reviewedAt ?? new Date() } : null,
    })
    return <StatusLine state={state} fact={fact} ledger={billLedger(bill)} openCheckCodes={bill.openCheckCodes} cancelledReason={bill.cancelledReason}
      trailing={<ReviewSlaCountdownBadge openedAt={bill.reviewTaskOpenedAt} slaHours={DEFAULT_REVIEW_SLA_HOURS} />} />
  }

  const columns: QueueColumn<BillRow>[] = [
    {
      key: "supplier", label: "Supplier", narrow: true, className: "min-w-[12rem]", fieldKey: "vendor", phone: "title",
      phoneRender: (bill) => bill.supplier ?? <span className="font-normal text-slate-600">Unknown supplier</span>,
      render: (bill) => <TitleCell subtitle={bill.filename} missingLabel="Unknown supplier"
        title={bill.supplier ? <ConfidenceField label="Supplier" value={bill.fieldConfidence.vendor ?? bill.fieldConfidence.merchant} minConfidence={minConfidence}>{bill.supplier}</ConfidenceField> : null} />,
    },
    {
      key: "number", label: "Invoice #", className: "whitespace-nowrap text-slate-700", fieldKey: "invoice_number", priority: "low", phone: "subtitle",
      // #261 spec §2: the card's second line — "INV-2031 · Due 30 Sep"; a missing half is omitted.
      phoneRender: (bill) => {
        const overdue = bill.dueDate !== null && bill.dueDate.getTime() < renderedAt
        return joinSegments([
          bill.invoiceNumber,
          bill.dueDate ? <span className={overdue ? "text-red-700" : ""}>Due {formatDate(bill.dueDate)}{overdue ? " · overdue" : ""}</span> : null,
        ])
      },
      render: (bill) => <ConfidenceField label="Invoice number" value={bill.invoiceNumber ? bill.fieldConfidence.invoice_number : undefined} minConfidence={minConfidence}>{bill.invoiceNumber ?? "—"}</ConfidenceField>,
    },
    {
      key: "amount", label: "Amount", narrow: true, className: "whitespace-nowrap text-right tabular-nums text-slate-900", fieldKey: "total", phone: "trailing",
      phoneRender: (bill) => bill.total !== null ? formatMoney(bill.total, bill.currencyCode) : <span className="font-normal text-slate-600">No amount</span>,
      render: (bill) => <ConfidenceField label="Amount" value={bill.total !== null ? bill.fieldConfidence.total ?? bill.fieldConfidence.amount : undefined} minConfidence={minConfidence}>{bill.total !== null ? formatMoney(bill.total, bill.currencyCode) : "—"}</ConfidenceField>,
    },
    {
      key: "due", label: "Due", narrow: true, className: "whitespace-nowrap tabular-nums text-slate-700", fieldKey: "due_date",
      render: (bill) => <>
        <ConfidenceField label="Due date" value={bill.extractedDueDate ? bill.fieldConfidence.due_date : undefined} minConfidence={minConfidence}>{formatDate(bill.dueDate)}</ConfidenceField>
        {bill.dueDate && !bill.extractedDueDate && <span className="ml-1.5 text-xs text-slate-500" title="From the supplier's payment terms, not the document">inferred</span>}
      </>,
    },
    { key: "aging", label: "Aging", className: "whitespace-nowrap", priority: "low", render: (bill) => <DueDateCountdownBadge dueDate={bill.dueDate} /> },
    {
      // #228 Q5/Q6/Q11: the matched PO as a chip carrying the number of `≠` glyphs the pane will
      // show; dashed for a suggestion that compares nothing; "PO removed" after a rejection.
      key: "po", label: "Purchase Orders", narrow: true, className: "whitespace-nowrap", phone: "pill",
      render: (bill) => <PoChip poNumber={bill.po.poNumber} kind={bill.po.kind} mismatchCount={bill.po.mismatchCount} confidence={bill.po.confidence ?? undefined}
        suggestionCount={bill.po.suggestionCount} removed={bill.po.removed} origin={origin}
        href={bill.po.kind && bill.po.kind !== "suggested" && bill.po.poDocumentId ? `/workspaces/${workspaceId}/purchase-orders/${bill.po.poDocumentId}` : undefined} />,
      // #261: the card is one `<a>`; the chip's own PO link would nest an anchor (hydration error),
      // so the phone pill is the chip without `href` — the PO link lives in the pane's Match tab.
      phoneRender: (bill) => <PoChip poNumber={bill.po.poNumber} kind={bill.po.kind} mismatchCount={bill.po.mismatchCount} confidence={bill.po.confidence ?? undefined}
        suggestionCount={bill.po.suggestionCount} removed={bill.po.removed} origin={origin} />,
    },
    {
      key: "state", label: "State", phone: "pill",
      render: statePills,
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
    if (bill.paidState.state === "paid" || bill.paidState.state === "partially_paid") return { canCancel: false, reason: "Already paid, so it can no longer be cancelled." }
    if (bill.paidState.state === "scheduled") return { canCancel: false, reason: "In a payment batch. Reject the batch first." }
    if (status === "posted") return { canCancel: false, reason: "Already posted to your ledger, so it can no longer be cancelled." }
    return { canCancel: true, reason: null }
  }

  return <>
    <QueueScreen<BillRow>
    origin={arrival?.origin ?? null}
    initialMissing={arrival?.initialMissing}
    connectionBand={<ConnectionBand status={connectionBandStatus} workspaceId={workspaceId} isOwner={isOwner} />}
      title="Invoices"
      addAction={<AddTypeButton ref={addButtonRef} workspaceId={workspaceId} fileId={fileId} templates={templates} type="invoice" inboundAddress={inboundAddress} />}
      dropZone={{ type: "invoices", onFiles: (files) => addButtonRef.current?.openWithFiles(files) }}
      basePath={basePath}
      rows={bills}
      rowId={(bill) => bill.documentId}
      // #228 Q6: the PO folds into the name's suffix (the card's second line below `md`), so a
      // phone reviewer hears the red count without the column.
      rowName={(bill) => ({ title: bill.supplier ?? "Unknown supplier", suffix: [bill.invoiceNumber, bill.total !== null ? formatMoney(bill.total, bill.currencyCode) : null, poSubtitle(bill)].filter(Boolean).join(" · ") || bill.filename })}
      paneStatus={paneStatus}
      archivedToast={{ archived: "Archived — now under Closed", unarchived: "Unarchived — back in Open" }}
      // #223: the leading edge is the five-state processing glyph, not the aging bucket (aging lives
      // in the countdown badge's own text since #208).
      leading={(bill) => <ProcessingStateGlyph state={billState(bill)} minConfidencePercent={minConfidencePercent} />}
      columns={columns}
      fieldTable={fieldTable}
      selectable
      sortOptions={SORTS}
      facets={INVOICE_FACETS}
      views={views}
      viewsPhone={viewsPhone}
      stat={stat}
      onExportAll={exportAll}
      initialSelectedId={initialSelectedId}
      // #261: card rows below `md`; the label is the card's accessible name, comma-separated.
      cards={{ below: "md", label: (bill) => {
        const overdue = bill.dueDate !== null && bill.dueDate.getTime() < renderedAt
        return [
          bill.supplier ?? "Unknown supplier",
          bill.total !== null ? formatMoney(bill.total, bill.currencyCode) : "No amount",
          bill.invoiceNumber,
          bill.dueDate ? `Due ${formatDate(bill.dueDate)}${overdue ? ", overdue" : ""}` : null,
          poSubtitle(bill),
          PROCESSING_STATE_LABELS[billState(bill)],
        ].filter(Boolean).join(", ")
      } }}
      empty={{
        // #266: the header Add button is the entry point; the empty state repeats it (desktop
        // only — `AddTypeButton` itself hides `<md`) plus the inbound address.
        firstUse: {
          title: "No invoices yet",
          body: "Add an invoice and DocuBite extracts it into a row here. You check it beside the source, approve it, and post it.",
          action: <div className="flex flex-col items-center gap-3">
            <AddTypeButton workspaceId={workspaceId} fileId={fileId} templates={templates} type="invoice" inboundAddress={inboundAddress} />
            {inboundAddress && <InboundAddressLine address={inboundAddress} />}
          </div>,
          phoneAction: inboundAddress
            ? <InboundAddressLine address={inboundAddress} />
            : <p className="text-sm text-slate-600">Add invoices from a computer.</p>,
        },
        done: { body: `${todayOutcome.approvedToday} approved today, ${todayOutcome.postedToday} posted.` },
        filteredBody: "Clear a filter to widen the queue.",
      }}
      workspaceDocumentCount={workspaceDocumentCount}
      loadDetail={(documentId) => getQueueDetailAction(workspaceId, documentId, { queueTitle: "Invoices" })}
      bulkActions={({ selectedIds, clear }) => <DocumentBulkActions
        workspaceId={workspaceId} noun="invoice" selectedIds={selectedIds} clear={clear} toRecord={toRecord}
        eligibleIds={selectedIds.filter((id) => !billsById.get(id)?.blockedByCheck)} exportFilename="invoices.csv"
        onHeldBack={(heldBack, approved) => setNeedsAttention((prev) => { const next = new Set(prev); for (const id of heldBack) next.add(id); for (const id of approved) next.delete(id); return next })}
        // #229 Q9 (#251): "Prepare payment run" has left this bar — paying happens on Bill Pay.
        approvedNext={{ label: "Approved invoices are ready in Bill Pay", href: `/workspaces/${workspaceId}/payments/bill-pay` }}
        extra={<>
          <ApprovalBulkAction workspaceId={workspaceId} selectedIds={selectedIds} clear={clear} toRecord={toRecord} workflows={availableWorkflows}
            startEligibleIds={selectedIds.filter((id) => { const status = billsById.get(id)?.approvalStatus; return status === "not_started" || status === "rejected" })}
            cancelEligibleIds={selectedIds.filter((id) => billsById.get(id)?.approvalStatus === "in_progress")} />
          {/* #281 (#248): Post — bulk-bar order is Approve · Post · Export | Delete (spec.md §3);
              enabled whenever the selection is non-empty, never gated on the client's eligibility
              guess (that only informs the dialog's strip/reasons). */}
          <Button type="button" size="sm" variant="outline" disabled={selectedIds.length === 0} onClick={() => setPosting(selectedIds)}>
            <Send className="h-3.5 w-3.5" aria-hidden />Post
          </Button>
        </>} />}
      paneActions={(bill, { refresh }) => <DocumentPaneActions workspaceId={workspaceId} documentId={bill.documentId} noun="invoice"
        status={bill.status} openReviewTaskId={bill.openReviewTaskId} cancelled={!!bill.cancelledAt} onDone={refresh} />}
      paneMenu={(bill) => {
        const info = cancelInfo(bill)
        const reason = postIneligibleReason(bill)
        return <>
          {/* #281 spec.md §7: single-doc "Post to ledger" — disabled (not hidden, H9) when
              ineligible, reusing the bulk dialog's shape for a one-row selection. */}
          <PaneMenuItem disabled={!!reason} hint={reason ?? undefined} onClick={() => setPosting([bill.documentId])}>Post to ledger</PaneMenuItem>
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

    <PostConfirmDialog open={posting !== null} onClose={() => setPosting(null)} workspaceId={workspaceId} connectionId={connectionId}
      records={(posting ?? []).map(toRecord)} eligibleIds={(posting ?? []).filter((id) => { const bill = billsById.get(id); return bill && postEligible(bill) })}
      onPosted={() => router.refresh()} />
  </>
}
