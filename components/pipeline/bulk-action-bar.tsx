"use client"

import {
  deletePipelineDocumentsAction,
  mergeDocumentsAction, moveDocumentsToStageAction,
} from "@/app/(app)/workspaces/[workspaceId]/pipeline-actions"
import { reextractAdaptivelyAction } from "@/app/(app)/workspaces/[workspaceId]/actions"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import type { PipelineStage } from "@/lib/documents/stages"
import { CheckCircle2, Combine, Loader2, Sparkles, Table2, Trash2 } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
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
   * claiming a success the tab counts immediately contradict. */
  const approve = async () => {
    setBusy(true)
    try {
      const result = await moveDocumentsToStageAction(workspaceId, selectedIds, "approved")
      if (!result.success) { toast.error(result.error || "Approve failed"); return }
      const approved = result.data?.approved ?? 0
      const heldBack = result.data?.heldBack ?? 0
      // No undo action here: markDocumentsReviewed has no server-side counterpart, so a reliable
      // "Send back to Review" bulk move would need a new action first. Recovery today is opening
      // the individual document — the ConfirmDialog above is what makes the bulk safe.
      if (approved > 0 && heldBack === 0) toast.success(`Approved ${approved}`)
      else if (approved > 0) toast.warning(`Approved ${approved} — ${heldBack} held back (missing required fields or document type)`)
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

    <Button type="button" size="sm" variant="outline" disabled={dis}
      className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
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

    <SheetChoiceDialog
      open={showSheetChoice && Boolean(sheetsHref)}
      count={selectedIds.length}
      combinedHref={sheetsHref ? `${sheetsHref}&mode=combined` : ""}
      separateHref={sheetsHref ? `${sheetsHref}&mode=separate` : ""}
      onClose={() => setShowSheetChoice(false)} />
  </div>
}

/** A proper accessible dialog for the two-way "Open in Sheets" choice — replaces the earlier
 * hand-rolled overlay that had no role, no Escape handler, and no focus trap. The two options
 * are navigation, not a destructive confirmation, so it wants a plain dialog rather than
 * ConfirmDialog's alertdialog + destructive primary. Focus is trapped inside the panel while
 * open and returned to the opener on close (same portal-to-body pattern as ConfirmDialog so it
 * is never clipped by whichever grid container invoked it). */
function SheetChoiceDialog({ open, count, combinedHref, separateHref, onClose }: {
  open: boolean
  count: number
  combinedHref: string
  separateHref: string
  onClose: () => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    openerRef.current = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    const focusables = panel?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')
    focusables?.[0]?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return }
      if (event.key !== "Tab" || !panel) return
      const items = panel.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("keydown", onKey)
      openerRef.current?.focus()
    }
  }, [open, onClose])

  if (!open || typeof document === "undefined") return null

  return createPortal(
    <div role="presentation" className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-6" onClick={onClose}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="sheet-choice-title" aria-describedby="sheet-choice-desc"
        className="w-full max-w-sm overflow-hidden rounded-xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="px-5 pb-4 pt-5">
          <h2 id="sheet-choice-title" className="text-base font-semibold text-slate-900">Open {count} documents in Sheets</h2>
          <p id="sheet-choice-desc" className="mt-1.5 text-sm text-slate-500">How would you like to view them?</p>
        </div>
        <div className="flex flex-col gap-2 px-5 pb-5">
          <Button asChild variant="outline"><Link href={combinedHref} onClick={onClose}>Combined into one sheet</Link></Button>
          <Button asChild variant="outline"><Link href={separateHref} onClick={onClose}>Separate sheet per document</Link></Button>
        </div>
        <div className="flex justify-end border-t bg-slate-50 px-5 py-3">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
