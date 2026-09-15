"use client"

import { useRouter } from "next/navigation"
import { useState, type ReactNode } from "react"
import { toast } from "sonner"
import { CheckCircle2, Download, Loader2, Trash2, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { bulkExportDocumentsAction, deletePipelineDocumentsAction, moveDocumentsToStageAction } from "@/app/(app)/workspaces/[workspaceId]/pipeline-actions"
import { updateReviewTaskStatusAction } from "@/app/(app)/workspaces/[workspaceId]/review-actions"
import { downloadCsv } from "@/lib/client/download-csv"
import { BulkApproveReceiptModal, EligibilityStrip, ItemizedRecapTable, type ItemizedRecord } from "@/components/typed-destinations/bulk-approve-receipt"

/** The bulk bar's Approve / Export / Delete for any document queue (#213's actions, #204's
 * eligibility strip and recap), shared by Invoices, Receipts, Purchase Orders and Bank
 * Statements. Renders its own confirm dialogs (portalled) so the caller only supplies the row
 * facts. `extra` slots a surface-specific action between Export and Delete — Invoices' "Prepare
 * payment run". The "Needs attention" client state after a held-back approve is reported through
 * `onHeldBack` so the surface can badge those rows for the session. */
export function DocumentBulkActions({ workspaceId, noun, selectedIds, clear, toRecord, eligibleIds, exportFilename, extra, onHeldBack }: {
  workspaceId: string
  /** Singular, lower-case: "invoice", "receipt", "purchase order", "bank statement". */
  noun: string
  selectedIds: string[]
  clear: () => void
  toRecord: (id: string) => ItemizedRecord
  /** Ids the pre-action strip counts as eligible for Approve (not blocked by a check). */
  eligibleIds: string[]
  exportFilename: string
  extra?: ReactNode
  onHeldBack?: (heldBackIds: string[], approvedIds: string[]) => void
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState<"approve" | "delete" | null>(null)
  const [receipt, setReceipt] = useState<{ approved: ItemizedRecord[]; heldBack: ItemizedRecord[] } | null>(null)
  const plural = selectedIds.length === 1 ? noun : `${noun}s`
  const Noun = noun.replace(/\b\w/g, (c) => c.toUpperCase())

  const approve = async () => {
    setConfirming(null)
    setBusy(true)
    try {
      const result = await moveDocumentsToStageAction(workspaceId, selectedIds, "approved")
      if (!result.success) { toast.error(result.error || "Approve failed"); return }
      const approvedIds = result.data?.approvedIds ?? []
      const heldBackIds = selectedIds.filter((id) => !approvedIds.includes(id))
      onHeldBack?.(heldBackIds, approvedIds)
      setReceipt({ approved: approvedIds.map(toRecord), heldBack: heldBackIds.map(toRecord) })
      clear()
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
      downloadCsv(result.data.csv, exportFilename)
      toast.success(`Exported ${selectedIds.length} ${plural}`)
    } catch {
      toast.error("Could not reach the server")
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setConfirming(null)
    setBusy(true)
    try {
      const result = await deletePipelineDocumentsAction(workspaceId, selectedIds)
      if (!result.success) { toast.error(result.error || "Delete failed"); return }
      toast.success(`Deleted ${result.data?.deleted ?? selectedIds.length} ${plural}`)
      clear()
      router.refresh()
    } catch {
      toast.error("Could not reach the server")
    } finally {
      setBusy(false)
    }
  }

  const disabled = busy || selectedIds.length === 0

  return <>
    <Button type="button" size="sm" disabled={disabled} onClick={() => setConfirming("approve")}>
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />}Approve
    </Button>
    <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => void exportCsv()}>
      <Download className="h-3.5 w-3.5" aria-hidden />Export
    </Button>
    {extra}
    <Button type="button" size="sm" variant="destructive" disabled={disabled} onClick={() => setConfirming("delete")}>
      <Trash2 className="h-3.5 w-3.5" aria-hidden />Delete
    </Button>

    <ConfirmDialog
      open={confirming === "delete"}
      destructive
      busy={busy}
      title={`Delete ${selectedIds.length} ${plural}?`}
      description="This removes their extracted rows and the uploaded sources behind them. This cannot be undone."
      confirmLabel={busy ? "Deleting…" : `Delete ${selectedIds.length} ${plural}`}
      onConfirm={() => void remove()}
      onCancel={() => setConfirming(null)} />

    <ConfirmDialog
      open={confirming === "approve"}
      busy={busy}
      title={`Approve ${selectedIds.length} ${plural}?`}
      confirmLabel={busy ? "Approving…" : `Approve ${Noun}${selectedIds.length === 1 ? "" : "s"} (${eligibleIds.length})`}
      onConfirm={() => void approve()}
      onCancel={() => setConfirming(null)}>
      <div className="space-y-2">
        <EligibilityStrip eligible={eligibleIds.length} total={selectedIds.length} />
        <ItemizedRecapTable records={selectedIds.map(toRecord)} />
      </div>
    </ConfirmDialog>

    <BulkApproveReceiptModal open={receipt !== null} onClose={() => setReceipt(null)} approved={receipt?.approved ?? []} heldBack={receipt?.heldBack ?? []} />
  </>
}

/** The Detail pane's sticky bottom bar for a document row: Reject and Approve, the surface's
 * primary decision (#225 addendum 2, Vic's batch-detail sheet and mobile approval screen). With an
 * open ReviewTask the decision is recorded on it; without one, Approve moves the document to the
 * approved stage the way the standalone page's Approve did, and Reject has nothing to reject —
 * it stays visible and says why. */
export function DocumentPaneActions({ workspaceId, documentId, noun, status, openReviewTaskId, cancelled, onDone }: {
  workspaceId: string
  documentId: string
  noun: string
  status: string
  openReviewTaskId: string | null
  cancelled?: boolean
  onDone: () => void
}) {
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null)
  const [confirmingReject, setConfirmingReject] = useState(false)
  const approved = status === "reviewed" && !openReviewTaskId
  const canApprove = !cancelled && !approved && status !== "queued" && status !== "failed"
  const canReject = !cancelled && !!openReviewTaskId

  const approve = async () => {
    setBusy("approve")
    try {
      const result = openReviewTaskId
        ? await updateReviewTaskStatusAction(workspaceId, openReviewTaskId, "approved")
        : await moveDocumentsToStageAction(workspaceId, [documentId], "approved")
      if (!result.success) { toast.error(result.error || `Could not approve this ${noun}`); return }
      if (!openReviewTaskId && ((result as { data?: { heldBack?: number } }).data?.heldBack ?? 0) > 0) {
        toast.warning("Not approved yet. Fill in the missing required fields and pick a document type first.")
        onDone()
        return
      }
      toast.success("Approved")
      onDone()
    } catch {
      toast.error("Could not reach the server")
    } finally {
      setBusy(null)
    }
  }

  const reject = async () => {
    if (!openReviewTaskId) return
    setConfirmingReject(false)
    setBusy("reject")
    try {
      const result = await updateReviewTaskStatusAction(workspaceId, openReviewTaskId, "rejected")
      if (!result.success) { toast.error(result.error || `Could not reject this ${noun}`); return }
      toast.success("Rejected")
      onDone()
    } catch {
      toast.error("Could not reach the server")
    } finally {
      setBusy(null)
    }
  }

  const hint = cancelled ? `This ${noun} is cancelled.` : approved ? `Approved. Nothing left to decide.` : !openReviewTaskId ? "No approval is open on this document, so there is nothing to reject." : null

  return <>
    {hint && <span className="w-full text-xs text-slate-600 sm:mr-auto sm:w-auto">{hint}</span>}
    <Button type="button" size="sm" variant="outline" disabled={!canReject || busy !== null} onClick={() => setConfirmingReject(true)}>
      {busy === "reject" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <XCircle className="h-3.5 w-3.5" aria-hidden />}Reject
    </Button>
    <Button type="button" size="sm" disabled={!canApprove || busy !== null} onClick={() => void approve()}>
      {busy === "approve" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />}Approve
    </Button>
    <ConfirmDialog
      open={confirmingReject}
      destructive
      busy={busy === "reject"}
      title={`Reject this ${noun}?`}
      description="The open approval is closed as rejected and the decision is recorded on the audit trail. The document itself stays in the workspace."
      confirmLabel={busy === "reject" ? "Rejecting…" : "Reject"}
      onConfirm={() => void reject()}
      onCancel={() => setConfirmingReject(false)} />
  </>
}
