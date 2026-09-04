"use client"

import {
  archiveDocumentsAction, deletePipelineDocumentsAction,
  mergeDocumentsAction,
} from "@/app/(app)/workspaces/[workspaceId]/pipeline-actions"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import type { PipelineStage } from "@/lib/documents/stages"
import { Archive, Combine, Loader2, Table2, Trash2 } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

/** The N-selected action bar. Which actions make sense depends on the stage being viewed: you
 * can't "Move to Ready" from Archive (restore is the equivalent there), and Merge only ever
 * applies to exactly two rows. */
export function BulkActionBar({ workspaceId, stage, selectedIds, selectedFileId, onDone }: { workspaceId: string; stage: PipelineStage; selectedIds: string[]; selectedFileId?: string; onDone: () => void }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
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

  const none = selectedIds.length === 0
  const dis = busy || none

  return <div className="flex flex-wrap items-center gap-2 border-b bg-slate-50 px-6 py-2.5 text-sm">
    {!none && <span className="font-medium text-slate-700">{selectedIds.length} selected</span>}

    {stage === "ready" && <>
      <button type="button" disabled={dis} className="inline-flex items-center gap-1.5 rounded-md border bg-white px-2.5 py-1 font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
        onClick={() => run("Stored to Docu Library", () => archiveDocumentsAction(workspaceId, selectedIds, true))}>
        <Archive className="h-3.5 w-3.5" />Store to Library
      </button>

      {!none && sheetsHref ? (selectedIds.length === 1
        ? <Link href={sheetsHref} className="inline-flex items-center gap-1.5 rounded-md border bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50">
            <Table2 className="h-3.5 w-3.5" />Open in Sheets
          </Link>
        : <button type="button" className="inline-flex items-center gap-1.5 rounded-md border bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50" onClick={() => setShowSheetChoice(true)}>
            <Table2 className="h-3.5 w-3.5" />Open in Sheets
          </button>
      ) : <span className="inline-flex items-center gap-1.5 rounded-md border bg-white px-2.5 py-1 font-medium text-slate-400 opacity-50">
        <Table2 className="h-3.5 w-3.5" />Open in Sheets
      </span>}

      {selectedIds.length === 2 && <button type="button" disabled={dis} className="inline-flex items-center gap-1.5 rounded-md border bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        onClick={() => run("Merged", () => mergeDocumentsAction(workspaceId, selectedIds))}>
        <Combine className="h-3.5 w-3.5" />Merge
      </button>}
    </>}

    <button type="button" disabled={dis} className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-white px-2.5 py-1 font-medium text-red-600 hover:bg-red-50 disabled:opacity-50" onClick={() => setConfirmingDelete(true)}>
      <Trash2 className="h-3.5 w-3.5" />Delete
    </button>


    <ConfirmDialog
      open={confirmingDelete}
      destructive
      busy={busy}
      title={`Delete ${selectedIds.length} document${selectedIds.length === 1 ? "" : "s"}?`}
      description="This removes their extracted rows and the uploaded sources behind them. This cannot be undone."
      confirmLabel={busy ? "Deleting…" : "Delete"}
      onConfirm={() => { setConfirmingDelete(false); void run("Deleted", () => deletePipelineDocumentsAction(workspaceId, selectedIds)) }}
      onCancel={() => setConfirmingDelete(false)} />

    {showSheetChoice && sheetsHref && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowSheetChoice(false)}>
      <div className="w-80 rounded-lg bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-1 text-sm font-semibold text-slate-900">Open {selectedIds.length} documents in Sheets</h3>
        <p className="mb-4 text-xs text-slate-500">How would you like to view them?</p>
        <div className="flex flex-col gap-2">
          <Link href={`${sheetsHref}&mode=combined`} className="rounded-md border px-3 py-2 text-center text-sm font-medium text-slate-700 hover:bg-emerald-50 hover:text-emerald-800" onClick={() => setShowSheetChoice(false)}>
            Combined into one sheet
          </Link>
          <Link href={`${sheetsHref}&mode=separate`} className="rounded-md border px-3 py-2 text-center text-sm font-medium text-slate-700 hover:bg-emerald-50 hover:text-emerald-800" onClick={() => setShowSheetChoice(false)}>
            Separate sheet per document
          </Link>
          <button type="button" className="mt-1 text-xs text-slate-400 hover:text-slate-600" onClick={() => setShowSheetChoice(false)}>Cancel</button>
        </div>
      </div>
    </div>}
  </div>
}
