"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { CheckCircle2, Download, Loader2, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ListScreenBulkActionBar } from "@/components/list-screen/list-screen-shell"
import { InlineDocumentPanel } from "@/components/list-screen/inline-document-panel"
import { SelectionAuditPanel } from "@/components/list-screen/selection-audit-panel"
import { bulkExportDocumentsAction, deletePipelineDocumentsAction, moveDocumentsToStageAction } from "@/app/(app)/workspaces/[workspaceId]/pipeline-actions"
import { getInlineDocumentDetailAction, getSelectionAuditPanelDataAction } from "@/app/(app)/workspaces/[workspaceId]/actions"
import { downloadCsv } from "@/lib/client/download-csv"
import { ConfidenceField, TouchlessPill } from "@/components/typed-destinations/row-signals"
import type { ReceiptRow } from "@/models/receipts"
import type { ReactNode } from "react"

/** #213: Receipts row-selection + bulk action bar (Approve / Export / Delete — #179 point 3). No
 * "Prepare payment run" here: a receipt is already paid at purchase, same reasoning #212 used to
 * drop AP-aging controls from this surface. Same selection/bar pattern as InvoiceTable; kept as a
 * separate component rather than a shared generic one because the row shape (claim state vs.
 * aging/payment state) and the payment-run action differ enough that a shared abstraction would
 * need type-branching for a single-use case — not worth it per this project's simplicity rule.
 * #215 adds in-place split-pane row expansion, same pattern as InvoiceTable. */
export function ReceiptTable({ workspaceId, basePath, receipts, minConfidencePercent }: {
  workspaceId: string
  basePath: string
  receipts: ReceiptRow[]
  minConfidencePercent: number
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const loadDetail = (documentId: string): Promise<ReactNode> => getInlineDocumentDetailAction(workspaceId, documentId)
  const loadAuditPanelData = (documentId: string) => getSelectionAuditPanelDataAction(workspaceId, documentId)

  const selectedIds = [...selected]
  const allSelected = receipts.length > 0 && selected.size === receipts.length

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(receipts.map((receipt) => receipt.documentId)))
  const clearSelection = () => setSelected(new Set())

  const approve = async () => {
    setBusy(true)
    try {
      const result = await moveDocumentsToStageAction(workspaceId, selectedIds, "approved")
      if (!result.success) { toast.error(result.error || "Approve failed"); return }
      const approved = result.data?.approved ?? 0
      const heldBack = result.data?.heldBack ?? 0
      if (approved > 0 && heldBack === 0) toast.success(`Approved ${approved}`)
      else if (approved > 0) toast.warning(`Approved ${approved} — ${heldBack} held back (missing required fields or document type)`)
      else toast.warning(`Nothing approved — ${heldBack} still missing required fields or a document type.`)
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
      downloadCsv(result.data.csv, "receipts.csv")
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
    {selectedIds.length > 0 && <ListScreenBulkActionBar selectedCount={selectedIds.length}>
      <Button type="button" size="sm" disabled={dis} onClick={() => void approve()}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}Approve
      </Button>
      <Button type="button" size="sm" variant="outline" disabled={dis} onClick={() => void exportCsv()}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}Export
      </Button>
      <Button type="button" size="sm" variant="destructive" disabled={dis} onClick={() => setConfirmingDelete(true)}>
        <Trash2 className="h-3.5 w-3.5" />Delete
      </Button>
    </ListScreenBulkActionBar>}

    <div className="flex items-start gap-4">
      {/* #198: selection-triggered Audit/Approval panel — shown when exactly one row is
          checkbox-selected, so a single document's history has an unambiguous subject. */}
      {selectedIds.length === 1 && <SelectionAuditPanel key={selectedIds[0]} documentId={selectedIds[0]} loadData={loadAuditPanelData} onClose={clearSelection} />}

      <div className={`min-w-0 flex-1 overflow-x-auto ${selectedIds.length === 1 ? "" : "-mx-6"}`}>
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="w-9 px-4 py-2">
                <label className="flex h-6 w-6 cursor-pointer items-center justify-center">
                  <input type="checkbox" aria-label="Select all receipts" checked={allSelected} onChange={toggleAll} className="h-4 w-4 rounded border-slate-300" />
                </label>
              </th>
              <th className="px-4 py-2 font-medium">Merchant</th>
              <th className="px-4 py-2 font-medium">Receipt #</th>
              <th className="px-4 py-2 font-medium">Amount</th>
              <th className="px-4 py-2 font-medium">Purchase date</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Claim</th>
            </tr>
          </thead>
          <tbody>
            {receipts.map((receipt) => (
              <ReceiptTableRow key={receipt.documentId} basePath={basePath} receipt={receipt} selected={selected.has(receipt.documentId)}
                expanded={expandedId === receipt.documentId}
                onToggle={() => toggle(receipt.documentId)}
                onToggleExpand={() => setExpandedId((current) => (current === receipt.documentId ? null : receipt.documentId))}
                loadDetail={loadDetail} minConfidencePercent={minConfidencePercent} />
            ))}
          </tbody>
        </table>
      </div>
    </div>

    <ConfirmDialog
      open={confirmingDelete}
      destructive
      busy={busy}
      title={`Delete ${selectedIds.length} receipt${selectedIds.length === 1 ? "" : "s"}?`}
      description="This removes their extracted rows and the uploaded sources behind them. This cannot be undone."
      confirmLabel={busy ? "Deleting…" : "Delete"}
      onConfirm={() => void remove()}
      onCancel={() => setConfirmingDelete(false)} />
  </>
}

/** Row height matches the 62px figure measured live from the Vic.ai tour and recorded on #182.
 * #215: the merchant link toggles the inline detail panel instead of navigating; a modified click
 * (ctrl/cmd/middle-click) still follows the href to the standalone route. */
function ReceiptTableRow({ basePath, receipt, selected, expanded, onToggle, onToggleExpand, loadDetail, minConfidencePercent }: {
  basePath: string
  receipt: ReceiptRow
  selected: boolean
  expanded: boolean
  onToggle: () => void
  onToggleExpand: () => void
  loadDetail: (documentId: string) => Promise<ReactNode>
  minConfidencePercent: number
}) {
  return (
    <>
      <tr className={`border-b border-slate-100 transition-colors hover:bg-slate-50 ${selected || expanded ? "bg-emerald-50/40" : ""}`} style={{ height: 62 }}>
        <td className="px-4 py-2.5">
          <label className="flex h-6 w-6 cursor-pointer items-center justify-center">
            <input type="checkbox" aria-label={`Select ${receipt.merchant ?? "receipt"}`} checked={selected} onChange={onToggle} className="h-4 w-4 rounded border-slate-300" />
          </label>
        </td>
        <td className="px-4 py-2.5">
          <Link href={`${basePath}/${receipt.documentId}`} aria-expanded={expanded}
            className="text-slate-800 hover:text-emerald-700 hover:underline"
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button === 1) return
              e.preventDefault()
              onToggleExpand()
            }}>
            <ConfidenceField label="Merchant" value={receipt.fieldConfidence.merchant}>
              {receipt.merchant ?? <span className="italic text-slate-400">unknown merchant</span>}
            </ConfidenceField>
          </Link>
          <div className="text-xs text-slate-500 truncate max-w-[240px]">{receipt.filename}</div>
        </td>
        <td className="px-4 py-2.5 text-slate-600">{receipt.receiptNumber ?? "—"}</td>
        <td className="px-4 py-2.5 tabular-nums text-slate-800">
          <ConfidenceField label="Amount" value={receipt.fieldConfidence.total ?? receipt.fieldConfidence.amount}>
            {receipt.total !== null ? formatMoney(receipt.total, receipt.currencyCode) : "—"}
          </ConfidenceField>
        </td>
        <td className="px-4 py-2.5 tabular-nums text-slate-600">{receipt.purchaseDate ? receipt.purchaseDate.toISOString().slice(0, 10) : "—"}</td>
        <td className="px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {receipt.touchless && <TouchlessPill minConfidencePercent={minConfidencePercent} />}
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium capitalize text-slate-700">{receipt.status.replaceAll("_", " ")}</span>
            {receipt.blockedByCheck && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800" title={receipt.openCheckCodes.join(", ")}>
                blocked ({receipt.openCheckCodes.length})
              </span>
            )}
          </div>
        </td>
        <td className="px-4 py-2.5">
          <ClaimPill status={receipt.claimStatus} />
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={7} className="p-0">
            <InlineDocumentPanel documentId={receipt.documentId} loadDetail={loadDetail} onClose={onToggleExpand} />
          </td>
        </tr>
      )}
    </>
  )
}

function ClaimPill({ status }: { status: ReceiptRow["claimStatus"] }) {
  if (!status) return <span className="text-xs text-slate-400">Unclaimed</span>
  const cls =
    status === "approved" ? "bg-emerald-50 text-emerald-700" :
    status === "rejected" ? "bg-red-50 text-red-800" :
    status === "submitted" ? "bg-blue-50 text-blue-700" :
    "bg-slate-100 text-slate-700"
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${cls}`}>{status}</span>
}

function formatMoney(amount: number, currency?: string | null): string {
  const currencyCode = currency && /^[A-Z]{3}$/.test(currency) ? currency : "USD"
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency: currencyCode, maximumFractionDigits: 0 }).format(amount)
  } catch {
    return `${amount.toFixed(0)} ${currency ?? ""}`.trim()
  }
}
