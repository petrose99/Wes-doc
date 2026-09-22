"use client"

import { deleteApprovalWorkflowAction, setApprovalWorkflowActiveAction } from "@/app/(app)/workspaces/[workspaceId]/approval-actions"
import { Pill } from "@/components/automation/automation-ui"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useRouter } from "next/navigation"
import { useState } from "react"

/** #253: a flow's row actions on Admin › Approval Flows. The status is a `Pill` (a word, never a
 * control) and each action is a named link beside it — "Deactivate", "Duplicate", "Delete" — so
 * nothing on the row looks like a status but behaves like a switch. Row actions apply at once (they
 * are not part of the page's save bar) and say so in place: a refusal renders on the row with
 * nothing changed, not in a toast that leaves before it is read.
 *
 * Deactivating the *default* flow is the one toggle with a consequence beyond the row — nothing
 * starts on its own until another default is chosen — so that case confirms and names it. */
export function ApprovalWorkflowRowControls({ workspaceId, workflowId, workflowName, active, isDefault, onDuplicate }: {
  workspaceId: string
  workflowId: string
  workflowName: string
  active: boolean
  isDefault: boolean
  /** Pre-fills the Add a flow form from this flow, so a variant is a rename rather than a retype. */
  onDuplicate?: () => void
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [confirm, setConfirm] = useState<"delete" | "deactivate" | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Optimistic: the pill flips at once and rolls back on failure, so a slow round trip never
  // looks like a click that did nothing.
  const [optimisticActive, setOptimisticActive] = useState(active)

  const setActive = async (next: boolean) => {
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
    } finally { setPending(false); setConfirm(null) }
  }

  const remove = async () => {
    setPending(true); setError(null)
    try {
      const result = await deleteApprovalWorkflowAction(workspaceId, workflowId)
      if (!result.success) { setError(result.error ? `Couldn't delete the flow — ${result.error} Nothing changed.` : "Couldn't delete the flow — the server didn't say why. Nothing changed."); return }
      router.refresh()
    } catch {
      setError("Couldn't reach the server. Nothing changed.")
    } finally { setPending(false); setConfirm(null) }
  }

  const action = "text-xs font-medium underline-offset-2 hover:underline disabled:opacity-50"

  return <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
    {error && <span role="alert" className="basis-full text-right text-xs text-red-700 sm:basis-auto">{error}</span>}
    <Pill state={optimisticActive ? "auto" : "idle"}>{optimisticActive ? "Active" : "Inactive"}</Pill>
    <button type="button" disabled={pending} className={`${action} text-slate-600`}
      onClick={() => (optimisticActive && isDefault ? setConfirm("deactivate") : void setActive(!optimisticActive))}>
      {optimisticActive ? "Deactivate" : "Activate"}
    </button>
    {onDuplicate && <button type="button" disabled={pending} onClick={onDuplicate} className={`${action} text-slate-600`}>Duplicate</button>}
    <button type="button" disabled={pending} onClick={() => setConfirm("delete")} className={`${action} text-red-600 hover:text-red-700`}>Delete</button>
    <ConfirmDialog
      open={confirm === "delete"}
      destructive
      busy={pending}
      title="Delete this flow?"
      description={`Tasks already using "${workflowName}" keep their progress, but they'll no longer show it as their flow.${isDefault ? " It is the default flow, so nothing starts on its own until another is chosen." : ""} This cannot be undone.`}
      confirmLabel={pending ? "Deleting…" : "Delete"}
      onConfirm={() => void remove()}
      onCancel={() => setConfirm(null)} />
    <ConfirmDialog
      open={confirm === "deactivate"}
      busy={pending}
      title={`Deactivate "${workflowName}"?`}
      description="It is the default flow. While it is inactive nothing starts on its own — approvals start by hand from the Invoices bulk bar until it is active again or another default is chosen. Invoices already being reviewed are left as they are."
      confirmLabel={pending ? "Deactivating…" : "Deactivate"}
      onConfirm={() => void setActive(false)}
      onCancel={() => setConfirm(null)} />
  </div>
}
