"use client"

import { useState, type ReactNode } from "react"
import { toast } from "sonner"
import { QueueScreen, type QueueColumn, type SortOption } from "@/components/queue/queue-screen"
import { joinSegments } from "@/components/queue/queue-card"
import type { FieldTable } from "@/lib/configuration/field-table"
import { PaneMenuItem } from "@/components/queue/detail-pane"
import { DocumentBulkActions, DocumentPaneActions } from "@/components/queue/document-actions"
import { formatDate, formatMoney, StatePills, TitleCell } from "@/components/queue/row-cells"
import { StatusLine } from "@/components/queue/status-line"
import { processingFact } from "@/lib/documents/processing-fact"
import type { Facet } from "@/components/queue/facet-filters"
import { ConfidenceField, ProcessingStateGlyph } from "@/components/typed-destinations/row-signals"
import { PROCESSING_STATES, PROCESSING_STATE_LABELS, processingState } from "@/lib/documents/processing-state"
import type { ItemizedRecord } from "@/components/typed-destinations/bulk-approve-receipt"
import { ReviewSlaCountdownBadge } from "@/components/documents/countdown-badge"
import { DEFAULT_REVIEW_SLA_HOURS } from "@/lib/documents/countdown"
import { minConfidenceFromPercent } from "@/lib/documents/confidence-state"
import { bulkExportDocumentsAction } from "@/app/(app)/workspaces/[workspaceId]/pipeline-actions"
import { getQueueDetailAction } from "@/app/(app)/workspaces/[workspaceId]/queue-actions"
import { downloadCsv } from "@/lib/client/download-csv"
import type { ReceiptRow } from "@/models/receipts"

/** #212's Status and Claim taxonomy as summary chips (#225). */
export const RECEIPT_FACETS: Facet[] = [
  {
    // #258: the five processing states — Receipts have no ledger facet (they never post/pay).
    param: "status", label: "Status",
    sections: [{
      label: "Processing state", options: PROCESSING_STATES.map((value) => ({ value, label: PROCESSING_STATE_LABELS[value] })),
    }],
  },
  { param: "claim", label: "Claim", options: [{ value: "unclaimed", label: "Unclaimed" }, { value: "claimed", label: "Claimed" }] },
  { param: "touchless", label: "Touchless", kind: "toggle", options: [{ value: "1", label: "Touchless only" }] },
]

const SORTS: SortOption<ReceiptRow>[] = [
  { key: "newest", label: "Newest first", compare: () => 0 },
  { key: "date", label: "Purchase date", compare: (a, b) => (b.purchaseDate?.getTime() ?? -Infinity) - (a.purchaseDate?.getTime() ?? -Infinity) },
  { key: "amount", label: "Amount, high to low", compare: (a, b) => (b.total ?? -Infinity) - (a.total ?? -Infinity) },
  { key: "merchant", label: "Merchant A–Z", compare: (a, b) => (a.merchant ?? "￿").localeCompare(b.merchant ?? "￿") },
]

function ClaimPill({ status }: { status: ReceiptRow["claimStatus"] }) {
  if (!status) return <span className="text-xs text-slate-600">Unclaimed</span>
  const cls =
    status === "approved" ? "bg-emerald-100 text-emerald-800" :
    status === "rejected" ? "bg-red-50 text-red-800" :
    status === "submitted" ? "bg-blue-100 text-blue-800" :
    "bg-slate-100 text-slate-700"
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${cls}`}>{status}</span>
}

export function ReceiptQueue({ workspaceId, basePath, receipts, minConfidencePercent, views, viewsPhone, stat, initialSelectedId, fieldTable = null }: {
  workspaceId: string
  basePath: string
  receipts: ReceiptRow[]
  minConfidencePercent: number
  views?: ReactNode
  /** #261: the phone filter row's Views select. */
  viewsPhone?: ReactNode
  stat?: ReactNode
  initialSelectedId?: string | null
  /** #252: Admin › Configuration › Fields for receipts, when one has been saved. */
  fieldTable?: FieldTable | null
}) {
  const [needsAttention, setNeedsAttention] = useState<Set<string>>(new Set())
  const minConfidence = minConfidenceFromPercent(minConfidencePercent)
  const byId = new Map(receipts.map((receipt) => [receipt.documentId, receipt]))
  const toRecord = (id: string): ItemizedRecord => {
    const receipt = byId.get(id)
    return { id, type: "Receipt", vendor: receipt?.merchant ?? null, number: receipt?.receiptNumber ?? null, amount: receipt?.total ?? null, currencyCode: receipt?.currencyCode ?? null, dateLabel: "Date", date: receipt?.purchaseDate ?? null }
  }

  // One state per row, shared by the leading glyph and the State column / pane Status line (#258).
  const receiptState = (receipt: ReceiptRow) => processingState({
    approvalStatus: receipt.approvalStatus, blockedByCheck: receipt.blockedByCheck, escalated: receipt.escalated,
    touchless: receipt.touchless, status: receipt.status, heldBack: needsAttention.has(receipt.documentId),
  })
  const statePills = (receipt: ReceiptRow) => <StatePills state={receiptState(receipt)} openCheckCodes={receipt.openCheckCodes}
    trailing={<ReviewSlaCountdownBadge openedAt={receipt.reviewTaskOpenedAt} slaHours={DEFAULT_REVIEW_SLA_HOURS} />} />
  const paneStatus = (receipt: ReceiptRow) => {
    const state = receiptState(receipt)
    const fact = processingFact({
      approvalStatus: receipt.approvalStatus, blockedByCheck: receipt.blockedByCheck, escalated: receipt.escalated,
      touchless: receipt.touchless, status: receipt.status, heldBack: needsAttention.has(receipt.documentId),
      reviewTaskOpenedAt: receipt.reviewTaskOpenedAt, receivedAt: receipt.receivedAt, openCheckCodes: receipt.openCheckCodes,
      approvedBy: receipt.status === "reviewed" ? { actorName: null, at: receipt.reviewedAt ?? new Date() } : null,
    })
    return <StatusLine state={state} fact={fact} openCheckCodes={receipt.openCheckCodes}
      trailing={<ReviewSlaCountdownBadge openedAt={receipt.reviewTaskOpenedAt} slaHours={DEFAULT_REVIEW_SLA_HOURS} />} />
  }

  const columns: QueueColumn<ReceiptRow>[] = [
    {
      key: "merchant", label: "Merchant", narrow: true, className: "min-w-[12rem]", fieldKey: "merchant", phone: "title",
      phoneRender: (receipt) => receipt.merchant ?? <span className="font-normal text-slate-600">Unknown merchant</span>,
      render: (receipt) => <TitleCell subtitle={receipt.filename} missingLabel="Unknown merchant"
        title={receipt.merchant ? <ConfidenceField label="Merchant" value={receipt.fieldConfidence.merchant} minConfidence={minConfidence}>{receipt.merchant}</ConfidenceField> : null} />,
    },
    {
      key: "number", label: "Receipt #", className: "whitespace-nowrap text-slate-700", fieldKey: "receipt_number", priority: "low", phone: "subtitle",
      // #261 spec §2: "Receipt # · ‹purchase date›"; a missing half is omitted.
      phoneRender: (receipt) => joinSegments([receipt.receiptNumber, receipt.purchaseDate ? formatDate(receipt.purchaseDate) : null]),
      render: (receipt) => <ConfidenceField label="Receipt number" value={receipt.receiptNumber ? receipt.fieldConfidence.receipt_number : undefined} minConfidence={minConfidence}>{receipt.receiptNumber ?? "—"}</ConfidenceField>,
    },
    {
      key: "amount", label: "Amount", narrow: true, className: "whitespace-nowrap text-right tabular-nums text-slate-900", fieldKey: "total", phone: "trailing",
      phoneRender: (receipt) => receipt.total !== null ? formatMoney(receipt.total, receipt.currencyCode) : <span className="font-normal text-slate-600">No amount</span>,
      render: (receipt) => <ConfidenceField label="Amount" value={receipt.total !== null ? receipt.fieldConfidence.total ?? receipt.fieldConfidence.amount : undefined} minConfidence={minConfidence}>{receipt.total !== null ? formatMoney(receipt.total, receipt.currencyCode) : "—"}</ConfidenceField>,
    },
    {
      key: "date", label: "Purchase date", narrow: true, className: "whitespace-nowrap tabular-nums text-slate-700", fieldKey: "purchase_date",
      render: (receipt) => <ConfidenceField label="Purchase date" value={receipt.purchaseDate ? receipt.fieldConfidence.purchase_date : undefined} minConfidence={minConfidence}>{formatDate(receipt.purchaseDate)}</ConfidenceField>,
    },
    {
      key: "state", label: "State", phone: "pill",
      render: statePills,
    },
    // The card shows the Claim pill only when a claim exists; "Unclaimed" stays a table-only word.
    { key: "claim", label: "Claim", priority: "low", phone: "pill", phoneRender: (receipt) => receipt.claimStatus ? <ClaimPill status={receipt.claimStatus} /> : null, render: (receipt) => <ClaimPill status={receipt.claimStatus} /> },
  ]

  const exportAll = async () => {
    const result = await bulkExportDocumentsAction(workspaceId, receipts.map((receipt) => receipt.documentId))
    if (!result.success || !result.data) { toast.error(result.error || "Export failed"); return }
    downloadCsv(result.data.csv, "receipts.csv")
    toast.success(`Exported ${receipts.length} receipts`)
  }

  return <QueueScreen<ReceiptRow>
    title="Receipts"
    basePath={basePath}
    rows={receipts}
    rowId={(receipt) => receipt.documentId}
    rowName={(receipt) => ({ title: receipt.merchant ?? "Unknown merchant", suffix: [receipt.receiptNumber, receipt.total !== null ? formatMoney(receipt.total, receipt.currencyCode) : null].filter(Boolean).join(" · ") || receipt.filename })}
    paneStatus={paneStatus}
    // #223: same five-state processing glyph as Invoices on the leading edge.
    leading={(receipt) => <ProcessingStateGlyph state={receiptState(receipt)} minConfidencePercent={minConfidencePercent} />}
    columns={columns}
    fieldTable={fieldTable}
    selectable
    sortOptions={SORTS}
    facets={RECEIPT_FACETS}
    views={views}
    viewsPhone={viewsPhone}
    stat={stat}
    onExportAll={exportAll}
    initialSelectedId={initialSelectedId}
    // #261: card rows below `md`.
    cards={{ below: "md", label: (receipt) => [
      receipt.merchant ?? "Unknown merchant",
      receipt.total !== null ? formatMoney(receipt.total, receipt.currencyCode) : "No amount",
      receipt.receiptNumber,
      receipt.purchaseDate ? formatDate(receipt.purchaseDate) : null,
      PROCESSING_STATE_LABELS[receiptState(receipt)],
      receipt.claimStatus ? `claim ${receipt.claimStatus}` : null,
    ].filter(Boolean).join(", ") }}
    empty={{ title: "No receipts yet.", body: "Receipts appear here once one is extracted from an upload or an inbound email." }}
    loadDetail={(documentId) => getQueueDetailAction(workspaceId, documentId, { queueTitle: "Receipts" })}
    bulkActions={({ selectedIds, clear }) => <DocumentBulkActions
      workspaceId={workspaceId} noun="receipt" selectedIds={selectedIds} clear={clear} toRecord={toRecord}
      eligibleIds={selectedIds.filter((id) => !byId.get(id)?.blockedByCheck)} exportFilename="receipts.csv"
      onHeldBack={(heldBack, approved) => setNeedsAttention((prev) => { const next = new Set(prev); for (const id of heldBack) next.add(id); for (const id of approved) next.delete(id); return next })} />}
    paneActions={(receipt, { refresh }) => <DocumentPaneActions workspaceId={workspaceId} documentId={receipt.documentId} noun="receipt"
      status={receipt.status} openReviewTaskId={receipt.openReviewTaskId} onDone={refresh} />}
    paneMenu={(receipt) => <>
      {!receipt.claimId && <PaneMenuItem onClick={() => { window.location.href = `${basePath}?mode=claims` }}>Create expense claim…</PaneMenuItem>}
    </>} />
}
