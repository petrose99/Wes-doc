"use client"

import type { QueueArrival } from "@/lib/navigation/origin-server"
import { useCallback, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { FolderPlus, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PostConfirmDialog } from "@/components/queue/post-confirm-dialog"
import { AddToClaimContext, ClaimPill, useCanCreateClaims, DESKTOP_HINT } from "@/components/queue/claim-card"
import { AddToClaimDialog, type ClaimCandidate } from "@/components/queue/add-to-claim-dialog"
import type { AddToClaimResult } from "@/lib/claims/facts"
import { CLAIM_STATUS_LABELS, claimName } from "@/lib/claims/labels"
import { toast } from "sonner"
import { QueueScreen, type QueueColumn, type QueueControls, type SortOption } from "@/components/queue/queue-screen"
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
    // #258/#281: the five processing states plus the ledger's own fact, same two-section shape
    // Invoices' Status facet uses (spec.md §5) — value/label renamed alongside Invoices' in build
    // step 4.
    param: "status", label: "Status",
    sections: [
      { label: "Processing state", options: PROCESSING_STATES.map((value) => ({ value, label: PROCESSING_STATE_LABELS[value] })) },
      { label: "Ledger", options: [
        { value: "posting", label: "Posting…" }, { value: "posted", label: "Posted" }, { value: "failed", label: "Post failed" },
      ] },
    ],
  },
  // #273: Unclaimed + the four claim statuses, words from the one label map.
  { param: "claim", label: "Claim", options: [{ value: "unclaimed", label: "Unclaimed" }, ...(Object.keys(CLAIM_STATUS_LABELS) as Array<keyof typeof CLAIM_STATUS_LABELS>).map((value) => ({ value, label: CLAIM_STATUS_LABELS[value] }))] },
  { param: "touchless", label: "Touchless", kind: "toggle", options: [{ value: "1", label: "Touchless only" }] },
]

const SORTS: SortOption<ReceiptRow>[] = [
  { key: "newest", label: "Newest first", compare: () => 0 },
  { key: "date", label: "Purchase date", compare: (a, b) => (b.purchaseDate?.getTime() ?? -Infinity) - (a.purchaseDate?.getTime() ?? -Infinity) },
  { key: "amount", label: "Amount, high to low", compare: (a, b) => (b.total ?? -Infinity) - (a.total ?? -Infinity) },
  { key: "merchant", label: "Merchant A–Z", compare: (a, b) => (a.merchant ?? "￿").localeCompare(b.merchant ?? "￿") },
]

export function ReceiptQueue({ workspaceId, basePath, receipts, claimsEnabled = false, currentUserId = null, minConfidencePercent, views, viewsPhone, stat, initialSelectedId, fieldTable = null, workspaceDocumentCount, todayOutcome, arrival, connectionId = null }: {
  workspaceId: string
  basePath: string
  receipts: ReceiptRow[]
  /** #273: `expense-approvals` capability, computed server-side — gates column, facet, actions, tab section. */
  claimsEnabled?: boolean
  /** #273: the Claim cell's subtitle is the claim's name for my claims, the claimant for others'. */
  currentUserId?: string | null
  minConfidencePercent: number
  views?: ReactNode
  /** #261: the phone filter row's Views select. */
  viewsPhone?: ReactNode
  stat?: ReactNode
  initialSelectedId?: string | null
  /** #252: Admin › Configuration › Fields for receipts, when one has been saved. */
  fieldTable?: FieldTable | null
  /** #264: has the workspace ever held a document (any type) — decides first-use vs. done. */
  workspaceDocumentCount: number
  /** #264: the done state's "n approved today, m posted." sentence. */
  todayOutcome: { approvedToday: number; postedToday: number }
  /** #268: the Origin strip's model + the missing-row notice, from `queueArrival` on the server. */
  arrival?: QueueArrival
  /** #281: the workspace's active ledger connection id, or null with none/inactive — the bulk
   * Post button still shows (§3 never hides it); every row reads ineligible and the confirm
   * dialog's Post stays disabled until a connection exists. */
  connectionId?: string | null
}) {
  const [needsAttention, setNeedsAttention] = useState<Set<string>>(new Set())
  const [posting, setPosting] = useState<string[] | null>(null)
  const router = useRouter()
  const canCreateClaims = useCanCreateClaims()
  // #273 S2: one dialog for every opener; its state lives here (Radix unmount contract).
  const [claimDialog, setClaimDialog] = useState<{ ids: string[]; forceNew: boolean } | null>(null)
  const [controls, setControls] = useState<QueueControls | null>(null)
  const onControls = useCallback((next: QueueControls) => setControls(next), [])
  const openAddDialog = useCallback((opts: { documentId: string; forceNew: boolean }) => setClaimDialog({ ids: [opts.documentId], forceNew: opts.forceNew }), [])
  const minConfidence = minConfidenceFromPercent(minConfidencePercent)
  const byId = new Map(receipts.map((receipt) => [receipt.documentId, receipt]))
  const toRecord = (id: string): ItemizedRecord => {
    const receipt = byId.get(id)
    return { id, type: "Receipt", vendor: receipt?.merchant ?? null, number: receipt?.receiptNumber ?? null, amount: receipt?.total ?? null, currencyCode: receipt?.currencyCode ?? null, dateLabel: "Date", date: receipt?.purchaseDate ?? null }
  }
  // #281 spec.md §2: the client's eligibility guess (never the gate — the server re-resolves at
  // confirm time). Receipts have no cancel concept, so status is the only signal this row carries.
  const postEligible = (receipt: ReceiptRow) => receipt.status === "reviewed"

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

  const toCandidate = (id: string): ClaimCandidate | null => {
    const receipt = byId.get(id)
    if (!receipt) return null
    return { documentId: id, merchant: receipt.merchant, amount: receipt.total, currencyCode: receipt.currencyCode, date: receipt.purchaseDate, eligibility: receipt.claimEligibility }
  }
  const onClaimAdded = (result: AddToClaimResult) => {
    setClaimDialog(null)
    const n = result.added.length
    const held = result.heldBack.length
    toast.success(`Added ${n} receipt${n === 1 ? "" : "s"} to ${result.name}${held > 0 ? ` and ${held} held back` : ""}`)
    // B2: rows re-read server-side, the open pane's Approval tab re-reads its facts, and the
    // selection is scoped to what still needs the operator (tour #11).
    controls?.select(result.heldBack.map((h) => h.id))
    controls?.refresh()
    router.refresh()
  }
  const claimCell = (receipt: ReceiptRow) => {
    if (!receipt.claim) return <span className="text-slate-400">—</span>
    const subtitle = receipt.claim.claimantId === currentUserId ? claimName(receipt.claim) : receipt.claim.claimantName
    return <div className="min-w-0">
      <ClaimPill status={receipt.claim.status} />
      {subtitle && <div className="mt-0.5 max-w-[14rem] truncate text-xs text-slate-600" title={subtitle}>{subtitle}</div>}
    </div>
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
    // #273: the card shows the Claim pill only when a claim exists; the table cell adds the name/claimant.
    ...(claimsEnabled ? [{ key: "claim", label: "Claim", priority: "low" as const, phone: "pill" as const, phoneRender: (receipt: ReceiptRow) => receipt.claim ? <ClaimPill status={receipt.claim.status} /> : null, render: claimCell }] : []),
  ]

  const exportAll = async () => {
    const result = await bulkExportDocumentsAction(workspaceId, receipts.map((receipt) => receipt.documentId))
    if (!result.success || !result.data) { toast.error(result.error || "Export failed"); return }
    downloadCsv(result.data.csv, "receipts.csv")
    toast.success(`Exported ${receipts.length} receipts`)
  }

  return <AddToClaimContext.Provider value={claimsEnabled ? openAddDialog : null}><QueueScreen<ReceiptRow>
    onControls={onControls}
    origin={arrival?.origin ?? null}
    initialMissing={arrival?.initialMissing}
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
      claimsEnabled && receipt.claim ? `claim ${CLAIM_STATUS_LABELS[receipt.claim.status]}` : null,
    ].filter(Boolean).join(", ") }}
    empty={{
      firstUse: { title: "No receipts yet.", body: "Receipts appear here once one is extracted from an upload or an inbound email." },
      done: { body: `${todayOutcome.approvedToday} approved today, ${todayOutcome.postedToday} posted.` },
    }}
    workspaceDocumentCount={workspaceDocumentCount}
    loadDetail={(documentId) => getQueueDetailAction(workspaceId, documentId, { queueTitle: "Receipts" })}
    bulkActions={({ selectedIds, clear }) => <DocumentBulkActions
      workspaceId={workspaceId} noun="receipt" selectedIds={selectedIds} clear={clear} toRecord={toRecord}
      eligibleIds={selectedIds.filter((id) => !byId.get(id)?.blockedByCheck)} exportFilename="receipts.csv"
      extra={<>
        {claimsEnabled && canCreateClaims && (() => {
          const claimable = selectedIds.filter((id) => byId.get(id)?.claimEligibility.status === "ready").length
          return <>
            {claimable === 0 && <span className="w-full text-xs text-slate-600 sm:w-auto" id="bulk-claim-reason">None of these can be claimed</span>}
            <Button type="button" size="sm" variant="outline" disabled={claimable === 0} aria-describedby={claimable === 0 ? "bulk-claim-reason" : undefined}
              onClick={() => setClaimDialog({ ids: selectedIds, forceNew: false })}><FolderPlus className="h-3.5 w-3.5" aria-hidden />Add to claim</Button>
          </>
        })()}
        {/* #281 (#248): Post — bulk-bar order Approve · Post · Export | Delete; enabled whenever
            the selection is non-empty, never gated on the client's eligibility guess (spec.md §3). */}
        <Button type="button" size="sm" variant="outline" disabled={selectedIds.length === 0} onClick={() => setPosting(selectedIds)}>
          <Send className="h-3.5 w-3.5" aria-hidden />Post
        </Button>
      </>}
      onHeldBack={(heldBack, approved) => setNeedsAttention((prev) => { const next = new Set(prev); for (const id of heldBack) next.add(id); for (const id of approved) next.delete(id); return next })} />}
    paneActions={(receipt, { refresh }) => <DocumentPaneActions workspaceId={workspaceId} documentId={receipt.documentId} noun="receipt"
      status={receipt.status} openReviewTaskId={receipt.openReviewTaskId} onDone={refresh} />}
    paneMenu={(receipt) => <>
      {claimsEnabled && !(receipt.claim && receipt.claim.status !== "rejected") && <PaneMenuItem disabled={!canCreateClaims} hint={canCreateClaims ? undefined : DESKTOP_HINT}
        onClick={() => setClaimDialog({ ids: [receipt.documentId], forceNew: false })}>Add to claim</PaneMenuItem>}
    </>} />
    {claimsEnabled && <AddToClaimDialog open={claimDialog !== null} workspaceId={workspaceId} forceNew={claimDialog?.forceNew ?? false}
      candidates={(claimDialog?.ids ?? []).map(toCandidate).filter((c): c is ClaimCandidate => c !== null)}
      onClose={() => setClaimDialog(null)} onAdded={onClaimAdded} />}
    <PostConfirmDialog open={posting !== null} onClose={() => setPosting(null)} workspaceId={workspaceId} connectionId={connectionId}
      records={(posting ?? []).map(toRecord)} eligibleIds={(posting ?? []).filter((id) => { const receipt = byId.get(id); return receipt && postEligible(receipt) })}
      onPosted={() => router.refresh()} />
  </AddToClaimContext.Provider>
}
