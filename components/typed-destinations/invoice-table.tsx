"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useRef, useState } from "react"
import { toast } from "sonner"
import { CheckCircle2, Download, Loader2, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ListScreenBulkActionBar } from "@/components/list-screen/list-screen-shell"
import { InlineDocumentPanel } from "@/components/list-screen/inline-document-panel"
import { SelectionAuditPanel } from "@/components/list-screen/selection-audit-panel"
import { OverrideModeBar, useOverrideMode } from "@/components/list-screen/override-mode"
import { bulkExportDocumentsAction, deletePipelineDocumentsAction, moveDocumentsToStageAction } from "@/app/(app)/workspaces/[workspaceId]/pipeline-actions"
import { cancelInvoiceAction, getInlineDocumentDetailAction, getSelectionAuditPanelDataAction, overrideGateAction } from "@/app/(app)/workspaces/[workspaceId]/actions"
import { downloadCsv } from "@/lib/client/download-csv"
import { ConfidenceField, StatusGlyph, TouchlessPill } from "@/components/typed-destinations/row-signals"
import { DueDateCountdownBadge, ReviewSlaCountdownBadge } from "@/components/documents/countdown-badge"
import { DEFAULT_REVIEW_SLA_HOURS } from "@/lib/documents/countdown"
import { BulkApproveReceiptModal, EligibilityStrip, ItemizedRecapTable, type ItemizedRecord } from "@/components/typed-destinations/bulk-approve-receipt"
import type { BillRow } from "@/models/bills"
import type { ReactNode } from "react"

/** #213: Invoices row-selection + bulk action bar (Approve / Export / Prepare payment run /
 * Delete — #179 point 3). Selection state lives here, one level above the table rows, since the
 * bulk bar and the checkboxes both need it. #215 adds in-place split-pane row expansion — clicking
 * a row's supplier link toggles the inline panel instead of navigating away; the standalone
 * `/documents/[documentId]` route is untouched underneath for deep links and back/forward. */
export function InvoiceTable({ workspaceId, basePath, bills, payableDocumentIds, preparePaymentRunAction, minConfidencePercent }: {
  workspaceId: string
  basePath: string
  bills: BillRow[]
  payableDocumentIds: string[]
  preparePaymentRunAction: (formData: FormData) => Promise<void>
  minConfidencePercent: number
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [confirmingApprove, setConfirmingApprove] = useState(false)
  const [confirmingPaymentRun, setConfirmingPaymentRun] = useState(false)
  const [approveReceipt, setApproveReceipt] = useState<{ approved: ItemizedRecord[]; heldBack: ItemizedRecord[] } | null>(null)
  const [needsAttention, setNeedsAttention] = useState<Set<string>>(new Set())
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const overrideMode = useOverrideMode()
  const paymentRunFormRef = useRef<HTMLFormElement>(null)
  const loadDetail = (documentId: string): Promise<ReactNode> => getInlineDocumentDetailAction(workspaceId, documentId)
  const loadAuditPanelData = (documentId: string) => getSelectionAuditPanelDataAction(workspaceId, documentId)
  const overrideGate = async (gateId: string, formData: FormData) => {
    const result = await overrideGateAction(workspaceId, gateId, formData)
    if (result.success) router.refresh()
    return result
  }
  const cancelInvoice = async (documentId: string, formData: FormData) => {
    const result = await cancelInvoiceAction(workspaceId, documentId, formData)
    if (result.success) router.refresh()
    return result
  }

  const selectedIds = [...selected]
  const payableSelected = selectedIds.filter((id) => payableDocumentIds.includes(id))
  const allSelected = bills.length > 0 && selected.size === bills.length
  const billsById = new Map(bills.map((bill) => [bill.documentId, bill]))
  // Eligibility proxy: the actual hold-back reason (missing required fields/document type) isn't
  // exposed on BillRow, so `blockedByCheck` — the same signal `payableDocumentIds` is filtered by
  // server-side — is the best pre-action signal available without a round trip. See #204's note
  // on EligibilityStrip.
  const eligibleForApproval = selectedIds.filter((id) => !billsById.get(id)?.blockedByCheck)
  const toRecord = (id: string): ItemizedRecord => {
    const bill = billsById.get(id)
    return { id, type: "Invoice", vendor: bill?.supplier ?? null, number: bill?.invoiceNumber ?? null, amount: bill?.total ?? null, currencyCode: bill?.currencyCode ?? null, dateLabel: "Due", date: bill?.dueDate ?? null }
  }

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(bills.map((bill) => bill.documentId)))
  const clearSelection = () => setSelected(new Set())

  const runApprove = async () => {
    setConfirmingApprove(false)
    setBusy(true)
    try {
      const result = await moveDocumentsToStageAction(workspaceId, selectedIds, "approved")
      if (!result.success) { toast.error(result.error || "Approve failed"); return }
      const approvedIds = result.data?.approvedIds ?? []
      const heldBackIds = selectedIds.filter((id) => !approvedIds.includes(id))
      // #204's "Needs attention" badge: held-back documents aren't queryable server-side (the
      // hold-back reason isn't persisted anywhere), so this only lasts for the current session's
      // client state — cleared once a row is re-approved successfully, and lost on a hard reload.
      setNeedsAttention((prev) => {
        const next = new Set(prev)
        for (const id of heldBackIds) next.add(id)
        for (const id of approvedIds) next.delete(id)
        return next
      })
      setApproveReceipt({ approved: approvedIds.map(toRecord), heldBack: heldBackIds.map(toRecord) })
      clearSelection()
      router.refresh()
    } catch {
      toast.error("Could not reach the server")
    } finally {
      setBusy(false)
    }
  }

  const exportCsv = async () => {
    setBusy(true)
    try {
      const result = await bulkExportDocumentsAction(workspaceId, selectedIds)
      if (!result.success || !result.data) { toast.error(result.error || "Export failed"); return }
      downloadCsv(result.data.csv, "invoices.csv")
      toast.success(`Exported ${selectedIds.length}`)
    } catch {
      toast.error("Could not reach the server")
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setConfirmingDelete(false)
    setBusy(true)
    try {
      const result = await deletePipelineDocumentsAction(workspaceId, selectedIds)
      if (!result.success) { toast.error(result.error || "Delete failed"); return }
      toast.success(`Deleted ${result.data?.deleted ?? selectedIds.length}`)
      clearSelection()
      router.refresh()
    } catch {
      toast.error("Could not reach the server")
    } finally {
      setBusy(false)
    }
  }

  const dis = busy || selectedIds.length === 0

  return <>
    <OverrideModeBar active={overrideMode.active} onToggle={overrideMode.toggle} />

    {selectedIds.length > 0 && <ListScreenBulkActionBar selectedCount={selectedIds.length}>
      <Button type="button" size="sm" disabled={dis} onClick={() => setConfirmingApprove(true)}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}Approve
      </Button>
      <Button type="button" size="sm" variant="outline" disabled={dis} onClick={() => void exportCsv()}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}Export
      </Button>
      {payableSelected.length > 0 && (
        <>
          <form ref={paymentRunFormRef} action={preparePaymentRunAction} className="hidden">
            {payableSelected.map((id) => <input key={id} type="hidden" name="documentId" value={id} />)}
          </form>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setConfirmingPaymentRun(true)}>
            Prepare payment run ({payableSelected.length})
          </Button>
        </>
      )}
      <Button type="button" size="sm" variant="destructive" disabled={dis} onClick={() => setConfirmingDelete(true)}>
        <Trash2 className="h-3.5 w-3.5" />Delete
      </Button>
    </ListScreenBulkActionBar>}

    <div className="flex items-start gap-4">
      {/* #198: selection-triggered Audit/Approval panel — shown when exactly one row is
          checkbox-selected, so a single document's history has an unambiguous subject. */}
      {selectedIds.length === 1 && <SelectionAuditPanel key={selectedIds[0]} documentId={selectedIds[0]} loadData={loadAuditPanelData} onClose={clearSelection}
        overrideModeActive={overrideMode.active} onOverrideGate={overrideGate}
        cancelInfo={cancelInfoFor(billsById.get(selectedIds[0]))}
        onCancel={(formData) => cancelInvoice(selectedIds[0], formData)} />}

      <div className={`min-w-0 flex-1 overflow-x-auto ${selectedIds.length === 1 ? "" : "-mx-6"}`}>
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="w-9 px-4 py-2">
                <label className="flex h-6 w-6 cursor-pointer items-center justify-center">
                  <input type="checkbox" aria-label="Select all invoices" checked={allSelected} onChange={toggleAll} className="h-4 w-4 rounded border-slate-300" />
                </label>
              </th>
              <th className="w-8 px-2 py-2" aria-hidden />
              <th className="px-4 py-2 font-medium">Supplier</th>
              <th className="px-4 py-2 font-medium">Invoice #</th>
              <th className="px-4 py-2 font-medium">Amount</th>
              <th className="px-4 py-2 font-medium">Due</th>
              <th className="px-4 py-2 font-medium">Aging</th>
              <th className="px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {bills.map((bill) => (
              <BillTableRow key={bill.documentId} basePath={basePath} bill={bill} selected={selected.has(bill.documentId)}
                expanded={expandedId === bill.documentId}
                onToggle={() => toggle(bill.documentId)}
                onToggleExpand={() => setExpandedId((current) => (current === bill.documentId ? null : bill.documentId))}
                loadDetail={loadDetail} minConfidencePercent={minConfidencePercent}
                needsAttention={needsAttention.has(bill.documentId)} />
            ))}
          </tbody>
        </table>
      </div>
    </div>

    <ConfirmDialog
      open={confirmingDelete}
      destructive
      busy={busy}
      title={`Delete ${selectedIds.length} invoice${selectedIds.length === 1 ? "" : "s"}?`}
      description="This removes their extracted rows and the uploaded sources behind them. This cannot be undone."
      confirmLabel={busy ? "Deleting…" : "Delete"}
      onConfirm={() => void remove()}
      onCancel={() => setConfirmingDelete(false)} />

    {/* #204: pre-action eligibility strip + recap, Approve and Prepare payment run only, per #185. */}
    <ConfirmDialog
      open={confirmingApprove}
      busy={busy}
      title={`Approve ${selectedIds.length} invoice${selectedIds.length === 1 ? "" : "s"}?`}
      confirmLabel={busy ? "Approving…" : `Approve Invoices (${eligibleForApproval.length})`}
      onConfirm={() => void runApprove()}
      onCancel={() => setConfirmingApprove(false)}>
      <div className="space-y-2">
        <EligibilityStrip eligible={eligibleForApproval.length} total={selectedIds.length} />
        <ItemizedRecapTable records={selectedIds.map(toRecord)} />
      </div>
    </ConfirmDialog>

    <ConfirmDialog
      open={confirmingPaymentRun}
      busy={busy}
      title={`Prepare a payment run for ${payableSelected.length} invoice${payableSelected.length === 1 ? "" : "s"}?`}
      description="Downloads a payment file for the eligible invoices below."
      confirmLabel={`Prepare Payment Run (${payableSelected.length})`}
      onConfirm={() => { setConfirmingPaymentRun(false); paymentRunFormRef.current?.requestSubmit() }}
      onCancel={() => setConfirmingPaymentRun(false)}>
      <div className="space-y-2">
        <EligibilityStrip eligible={payableSelected.length} total={selectedIds.length} />
        <ItemizedRecapTable records={payableSelected.map(toRecord)} />
      </div>
    </ConfirmDialog>

    <BulkApproveReceiptModal open={approveReceipt !== null} onClose={() => setApproveReceipt(null)}
      approved={approveReceipt?.approved ?? []} heldBack={approveReceipt?.heldBack ?? []} />
  </>
}

/** Row height matches the 62px figure measured live from the Vic.ai tour and recorded on #182 —
 * not re-derived here. py-[19.5px] on the cells plus the 1px border below gets a 62px row. The
 * supplier link toggles the #215 inline detail panel instead of navigating; a modified click
 * (ctrl/cmd/middle-click, or "open in new tab") still follows the href to the standalone route. */
function BillTableRow({ basePath, bill, selected, expanded, onToggle, onToggleExpand, loadDetail, minConfidencePercent, needsAttention }: {
  basePath: string
  bill: BillRow
  selected: boolean
  expanded: boolean
  onToggle: () => void
  onToggleExpand: () => void
  loadDetail: (documentId: string) => Promise<ReactNode>
  minConfidencePercent: number
  needsAttention: boolean
}) {
  return (
    <>
      <tr className={`border-b border-slate-100 transition-colors hover:bg-slate-50 ${selected || expanded ? "bg-emerald-50/40" : ""}`} style={{ height: 62 }}>
        <td className="px-4 py-2.5">
          <label className="flex h-6 w-6 cursor-pointer items-center justify-center">
            <input type="checkbox" aria-label={`Select ${bill.supplier ?? "invoice"}`} checked={selected} onChange={onToggle} className="h-4 w-4 rounded border-slate-300" />
          </label>
        </td>
        <td className="px-2 py-2.5">
          <StatusGlyph bucket={bill.agingBucket} />
        </td>
        <td className="px-4 py-2.5">
          <Link href={`${basePath}/${bill.documentId}`} aria-expanded={expanded}
            className="text-slate-800 hover:text-emerald-700 hover:underline"
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button === 1) return
              e.preventDefault()
              onToggleExpand()
            }}>
            <ConfidenceField label="Supplier" value={bill.fieldConfidence.vendor ?? bill.fieldConfidence.merchant}>
              {bill.supplier ?? <span className="italic text-slate-400">unknown supplier</span>}
            </ConfidenceField>
          </Link>
          <div className="text-xs text-slate-500 truncate max-w-[240px]">{bill.filename}</div>
        </td>
        <td className="px-4 py-2.5 text-slate-600">{bill.invoiceNumber ?? "—"}</td>
        <td className="px-4 py-2.5 tabular-nums text-slate-800">
          <ConfidenceField label="Amount" value={bill.fieldConfidence.total ?? bill.fieldConfidence.amount}>
            {bill.total !== null ? formatMoney(bill.total, bill.currencyCode) : "—"}
          </ConfidenceField>
        </td>
        <td className="px-4 py-2.5 tabular-nums text-slate-600">
          {bill.dueDate ? bill.dueDate.toISOString().slice(0, 10) : "—"}
          {bill.dueDate && !bill.extractedDueDate && <span className="ml-1 text-[10px] uppercase tracking-wide text-slate-400">inferred</span>}
        </td>
        <td className="px-4 py-2.5">
          <DueDateCountdownBadge dueDate={bill.dueDate} />
        </td>
        <td className="px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {bill.cancelledAt && (
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600" title={bill.cancelledReason ?? undefined}>
                Cancelled
              </span>
            )}
            {bill.touchless && <TouchlessPill minConfidencePercent={minConfidencePercent} />}
            <ReviewSlaCountdownBadge openedAt={bill.reviewTaskOpenedAt} slaHours={DEFAULT_REVIEW_SLA_HOURS} />
            {bill.paymentStatus && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">{bill.paymentStatus}</span>
            )}
            {bill.blockedByCheck && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800" title={bill.openCheckCodes.join(", ")}>
                blocked ({bill.openCheckCodes.length})
              </span>
            )}
            {needsAttention && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800" title="Held back from a recent bulk Approve — missing required fields or a document type.">
                Needs attention
              </span>
            )}
            {!bill.cancelledAt && !bill.touchless && !bill.paymentStatus && !bill.blockedByCheck && !needsAttention && (
              <span className="text-xs text-slate-400">—</span>
            )}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={8} className="p-0">
            <InlineDocumentPanel documentId={bill.documentId} loadDetail={loadDetail} onClose={onToggleExpand} />
          </td>
        </tr>
      )}
    </>
  )
}

/** #220: an already-cancelled row hides the control entirely (nothing left to cancel, and no
 * un-cancel affordance to offer instead) — everything else routes through the disabled+explained
 * path so the constraint is always visible, not just absent. */
function cancelInfoFor(bill: BillRow | undefined): { canCancel: boolean; disabledReason: string | null } | null {
  if (!bill || bill.cancelledAt) return null
  const status = bill.paymentStatus?.toLowerCase() ?? null
  if (status === "synced") return { canCancel: false, disabledReason: "This invoice has already been synced to your ledger and can no longer be cancelled." }
  if (status === "paid" || status === "reconciled") return { canCancel: false, disabledReason: "This invoice has already been paid and can no longer be cancelled." }
  return { canCancel: true, disabledReason: null }
}

function formatMoney(amount: number, currency?: string | null): string {
  const currencyCode = currency && /^[A-Z]{3}$/.test(currency) ? currency : "USD"
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency: currencyCode, maximumFractionDigits: 0 }).format(amount)
  } catch {
    return `${amount.toFixed(0)} ${currency ?? ""}`.trim()
  }
}
