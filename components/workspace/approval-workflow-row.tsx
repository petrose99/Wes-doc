"use client"

import { deleteApprovalWorkflowAction, setApprovalWorkflowActiveAction } from "@/app/(app)/workspaces/[workspaceId]/approval-actions"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

export function ApprovalWorkflowRowControls({ workspaceId, workflowId, workflowName, active }: { workspaceId: string; workflowId: string; workflowName: string; active: boolean }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  // Optimistic: the toggle used to only ever show its old state until router.refresh() finished
  // a full round trip, so on a slow connection a click looked like it did nothing. This flips the
  // label immediately and rolls back on failure instead.
  const [optimisticActive, setOptimisticActive] = useState(active)

  const toggle = async () => {
    const next = !optimisticActive
    setOptimisticActive(next)
    setPending(true)
    try {
      const result = await setApprovalWorkflowActiveAction(workspaceId, workflowId, next)
      if (!result.success) {
        setOptimisticActive(!next)
        toast.error(result.error || "Could not update the workflow")
        return
      }
      toast.success(next ? `"${workflowName}" is active` : `"${workflowName}" is inactive`)
      router.refresh()
    } catch {
      setOptimisticActive(!next)
      toast.error("Could not reach the server")
    } finally { setPending(false) }
  }

  const remove = async () => {
    setPending(true)
    try {
      const result = await deleteApprovalWorkflowAction(workspaceId, workflowId)
      if (!result.success) { toast.error(result.error || "Could not delete the workflow"); return }
      toast.success("Workflow deleted")
      router.refresh()
    } catch {
      toast.error("Could not reach the server")
    } finally { setPending(false); setConfirmOpen(false) }
  }

  return <div className="flex items-center gap-2">
    <button type="button" disabled={pending} onClick={() => void toggle()} aria-pressed={optimisticActive}
      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold disabled:opacity-70 ${optimisticActive ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>
      {optimisticActive ? "Active" : "Inactive"}
    </button>
    <button type="button" disabled={pending} onClick={() => setConfirmOpen(true)} className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50">Delete</button>
    <ConfirmDialog
      open={confirmOpen}
      destructive
      busy={pending}
      title="Delete this workflow?"
      description={`Tasks already using "${workflowName}" keep their progress, but they'll no longer show it as their workflow. This cannot be undone.`}
      confirmLabel={pending ? "Deleting…" : "Delete"}
      onConfirm={() => void remove()}
      onCancel={() => setConfirmOpen(false)} />
  </div>
}
