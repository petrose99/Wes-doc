"use client"

import {
  deletePipelineDocumentsAction,
  mergeDocumentsAction, moveDocumentsToStageAction,
  sendDocumentsBackToReviewAction,
} from "@/app/(app)/workspaces/[workspaceId]/pipeline-actions"
import { reextractAdaptivelyAction } from "@/app/(app)/workspaces/[workspaceId]/actions"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Dialog } from "@/components/ui/dialog"
import type { PipelineStage } from "@/lib/documents/stages"
import { CheckCircle2, Combine, Loader2, Sparkles, Table2, Trash2 } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

/** The N-selected action bar. Which actions make sense depends on the stage being viewed: you
 * can't "Move to Ready" from Archive (restore is the equivalent there), and Merge only ever
 * applies to exactly two rows. */
export function BulkActionBar({ workspaceId, stage, selectedIds, selectedFileId, selectedRows = [], onDone }: { workspaceId: string; stage: PipelineStage; selectedIds: string[]; selectedFileId?: string; selectedRows?: { id: string; fileId: string }[]; onDone: () => void }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  /** Guard the bulk Approve: approving N invoices at the Review stage authorises downstream
   * sync/payment, and the previous one-click path had neither confirm nor undo. The dialog reuses
   * ConfirmDialog (same focus trap, Esc, opener-restore, alertdialog semantics as Delete). */
  const [confirmingApprove, setConfirmingApprove] = useState(false)
  const [showSheetChoice, setShowSheetChoice] = useState(false)

  const sheetsHref = selectedFileId ? `/workspaces/${workspaceId}/files/${selectedFileId}/sheet?docs=${selectedIds.join(",")}` : null

  const run = async (label: string, action: () => Promise<{ success: boolean; error?: string }>) => {
    setBusy(true)
    try {
      const result = await action()
      if (!result.success) { toast.error(result.error || `${label} failed`); return }
      toast.success(label)
      onDone()
      router.refresh()
    } catch {
      toast.error("Could not reach the server")
    } finally {
      setBusy(false)
    }
  }

  /** Re-extract with adaptive line-item discovery. Previously reachable only from the upload
   * modal's staged-file list, which meant a document that didn't arrive through that modal — an
   * emailed one, or anything from a past session — could never be repaired when its template's
   * fixed line-item columns didn't fit it. Runs per document because the underlying action is
   * single-document; a document already queued/processing rejects, so those are counted rather
   * than surfaced as N separate error toasts. */
  const reextract = async () => {
    setBusy(true)
    try {
      const results = await Promise.all(selectedRows.map((row) =>
        reextractAdaptivelyAction(workspaceId, row.fileId, row.id).catch(() => ({ success: false as const }))))
      const queued = results.filter((result) => result.success).length
      if (!queued) { toast.error("Could not re-extract — already processing, or the document has no template"); return }
      toast.success(queued === results.length ? `Re-extracting ${queued}` : `Re-extracting ${queued} of ${results.length}`)
      onDone()
      router.refresh()
    } catch {
      toast.error("Could not reach the server")
    } finally {
      setBusy(false)
    }
  }

  /** Bulk Approve with an honest outcome: a document that still fails validation (missing
   * required fields, no document type) stays on Review, and the toast says so rather than
   * claiming a success the tab counts immediately contradict. Successful moves are undoable
   * via sendDocumentsBackToReviewAction — the pipeline counterpart to the review-inbox undo. */
  const approve = async () => {
    setBusy(true)
    try {
      const result = await moveDocumentsToStageAction(workspaceId, selectedIds, "approved")
      if (!result.success) { toast.error(result.error || "Approve failed"); return }
      const approved = result.data?.approved ?? 0
      const heldBack = result.data?.heldBack ?? 0
      const approvedIds = result.data?.approvedIds ?? []
      const undoAction = approvedIds.length ? {
        action: {
          label: "Undo",
          onClick: () => {
            void sendDocumentsBackToReviewAction(workspaceId, approvedIds).then((revert) => {
              if (!revert.success) { toast.error(revert.error || "Could not undo the approve"); return }
              toast.success(`Sent ${revert.data?.updated ?? approvedIds.length} back to Review`)
              router.refresh()
            })
          },
        },
      } : undefined
      if (approved > 0 && heldBack === 0) toast.success(`Approved ${approved}`, undoAction)
      else if (approved > 0) toast.warning(`Approved ${approved} — ${heldBack} held back (missing required fields or document type)`, undoAction)
      else toast.warning(`Nothing approved — ${heldBack} still missing required fields or a document type. Open the document to fill them in.`)
      onDone()
      router.refresh()
    } catch {
      toast.error("Could not reach the server")
    } finally {
      setBusy(false)
    }
  }

  const none = selectedIds.length === 0
  const dis = busy || none

  return <div className="flex flex-wrap items-center gap-2 border-b bg-slate-50 px-6 py-2.5 text-sm">
    {!none && <span className="font-medium text-slate-700">{selectedIds.length} selected</span>}

    {stage === "review" && <Button type="button" size="sm" disabled={dis} onClick={() => setConfirmingApprove(true)}>
      <CheckCircle2 className="h-3.5 w-3.5" />Approve
    </Button>}

    {stage === "approved" && <>
      {!none && sheetsHref ? (selectedIds.length === 1
        ? <Button asChild size="sm" variant="outline">
            <Link href={sheetsHref}><Table2 className="h-3.5 w-3.5" />Open in Sheets</Link>
          </Button>
        : <Button type="button" size="sm" variant="outline" onClick={() => setShowSheetChoice(true)}>
            <Table2 className="h-3.5 w-3.5" />Open in Sheets
          </Button>
      ) : <Button type="button" size="sm" variant="outline" disabled aria-disabled="true">
        <Table2 className="h-3.5 w-3.5" />Open in Sheets
      </Button>}

      {selectedIds.length === 2 && <Button type="button" size="sm" variant="outline" disabled={dis}
        onClick={() => run("Merged", () => mergeDocumentsAction(workspaceId, selectedIds))}>
        <Combine className="h-3.5 w-3.5" />Merge
      </Button>}
    </>}

    <Button type="button" size="sm" variant="outline" disabled={dis || selectedRows.length === 0}
      title="Re-extract with adaptive line-item discovery — for a document whose line items came out empty or wrong under its worksheet's fixed columns"
      onClick={() => void reextract()}>
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}Re-extract
    </Button>

    <Button type="button" size="sm" variant="destructive" disabled={dis}
      onClick={() => setConfirmingDelete(true)}>
      <Trash2 className="h-3.5 w-3.5" />Delete
    </Button>


    <ConfirmDialog
      open={confirmingDelete}
      destructive
      busy={busy}
      title={`Delete ${selectedIds.length} document${selectedIds.length === 1 ? "" : "s"}?`}
      description="This removes their extracted rows and the uploaded sources behind them. This cannot be undone."
      confirmLabel={busy ? "Deleting…" : "Delete"}
      onConfirm={() => { setConfirmingDelete(false); void run("Deleted", () => deletePipelineDocumentsAction(workspaceId, selectedIds)) }}
      onCancel={() => setConfirmingDelete(false)} />

    <ConfirmDialog
      open={confirmingApprove}
      busy={busy}
      title={`Approve ${selectedIds.length} document${selectedIds.length === 1 ? "" : "s"}?`}
      description="Approved documents can auto-publish and sync to accounting. Any that still need required fields or a document type are held back."
      confirmLabel={busy ? "Approving…" : "Approve all"}
      onConfirm={() => { setConfirmingApprove(false); void approve() }}
      onCancel={() => setConfirmingApprove(false)} />

    {/* Reuses the DS <Dialog> primitive instead of a hand-rolled overlay — one modal shape in the
        app, and the choices below are Links so <Dialog>'s built-in focus trap/restore is enough. */}
    <Dialog
      open={showSheetChoice && Boolean(sheetsHref)}
      title={`Open ${selectedIds.length} documents in Sheets`}
      description="How would you like to view them?"
      width="max-w-sm"
      onClose={() => setShowSheetChoice(false)}>
      <div className="flex flex-col gap-2 p-5">
        <Button asChild variant="outline"><Link href={sheetsHref ? `${sheetsHref}&mode=combined` : ""} onClick={() => setShowSheetChoice(false)}>Combined into one sheet</Link></Button>
        <Button asChild variant="outline"><Link href={sheetsHref ? `${sheetsHref}&mode=separate` : ""} onClick={() => setShowSheetChoice(false)}>Separate sheet per document</Link></Button>
      </div>
    </Dialog>
  </div>
}
