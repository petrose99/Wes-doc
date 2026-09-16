"use client"

import { deleteApprovalWorkflowAction, setApprovalWorkflowActiveAction } from "@/app/(app)/workspaces/[workspaceId]/approval-actions"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useRouter } from "next/navigation"
import { useState } from "react"

export function ApprovalWorkflowRowControls({ workspaceId, workflowId, workflowName, active }: { workspaceId: string; workflowId: string; workflowName: string; active: boolean }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  // #253: refusals are said on the row, beside the control that failed, with nothing changed —
  // the same in-place grammar as the page's save bar, not a toast that leaves before it is read.
  const [error, setError] = useState<string | null>(null)
  // Optimistic: the toggle used to only ever show its old state until router.refresh() finished
  // a full round trip, so on a slow connection a click looked like it did nothing. This flips the
  // label immediately and rolls back on failure instead.
  const [optimisticActive, setOptimisticActive] = useState(active)

  const toggle = async () => {
    const next = !optimisticActive
    setOptimisticActive(next)
    setPending(true); setError(null)
    try {
      const result = await setApprovalWorkflowActiveAction(workspaceId, workflowId, next)
      if (!result.success) {
        setOptimisticActive(!next)
        setError(result.error ? `Couldn't update the flow — ${result.error} Nothing changed.` : "Couldn't update the flow — the server didn't say why. Nothing changed.")
        return
      }
      router.refresh()
    } catch {
      setOptimisticActive(!next)
      setError("Couldn't reach the server. Nothing changed.")
    } finally { setPending(false) }
  }

  const remove = async () => {
    setPending(true); setError(null)
    try {
      const result = await deleteApprovalWorkflowAction(workspaceId, workflowId)
      if (!result.success) { setError(result.error ? `Couldn't delete the flow — ${result.error} Nothing changed.` : "Couldn't delete the flow — the server didn't say why. Nothing changed."); return }
      router.refresh()
    } catch {
      setError("Couldn't reach the server. Nothing changed.")
    } finally { setPending(false); setConfirmOpen(false) }
  }

  return <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
    {error && <span role="alert" className="basis-full text-right text-xs text-red-700 sm:basis-auto">{error}</span>}
    <button type="button" disabled={pending} onClick={() => void toggle()} aria-pressed={optimisticActive}
      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold disabled:opacity-70 ${optimisticActive ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>
      {optimisticActive ? "Active" : "Inactive"}
    </button>
    <button type="button" disabled={pending} onClick={() => setConfirmOpen(true)} className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50">Delete</button>
    <ConfirmDialog
      open={confirmOpen}
      destructive
      busy={pending}
      title="Delete this flow?"
      description={`Tasks already using "${workflowName}" keep their progress, but they'll no longer show it as their flow. If it is the default flow, nothing starts on its own until another is chosen. This cannot be undone.`}
      confirmLabel={pending ? "Deleting…" : "Delete"}
      onConfirm={() => void remove()}
      onCancel={() => setConfirmOpen(false)} />
  </div>
}
