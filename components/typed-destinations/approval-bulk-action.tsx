"use client"

import { useState } from "react"
import { toast } from "sonner"
import { ChevronDown, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { EligibilityStrip, ItemizedRecapTable, type ItemizedRecord } from "@/components/typed-destinations/bulk-approve-receipt"
import { bulkCancelApprovalsAction, bulkStartApprovalsAction } from "@/app/(app)/workspaces/[workspaceId]/(queue)/approvals/actions"

export type ApprovalWorkflowOption = { id: string; name: string; stageCount: number }

/** Decision #7: "Start Approval" lives on the *Invoices* bulk-action bar (not Approvals' own —
 * every row there is already a submitted Approval, nothing left to Start), `Approval ▾ → Start /
 * Cancel`, with #185's eligibility-before/itemized-receipt-after shape. Estimating eligibility
 * client-side from `BillRow.approvalStatus` only ever narrows the confirm dialog's count — the
 * server's own per-document refusal (already in flight, already past stage 0, …) is what actually
 * decides, and lands each document in `started`/`skipped` on the receipt. No auto-start setting
 * yet (#231): Start is always a deliberate click here. */
export function ApprovalBulkAction({ workspaceId, selectedIds, startEligibleIds, cancelEligibleIds, workflows, toRecord, clear }: {
  workspaceId: string
  selectedIds: string[]
  /** Rows with no Approval currently in flight (or a previously resolved one) — Start's rough
   * pre-action eligibility count. */
  startEligibleIds: string[]
  /** Rows with an Approval currently in flight — Cancel's rough pre-action eligibility count;
   * the server still refuses one that has already had a stage decided. */
  cancelEligibleIds: string[]
  workflows: ApprovalWorkflowOption[]
  toRecord: (id: string) => ItemizedRecord
  clear: () => void
}) {
  const [confirming, setConfirming] = useState<"start" | "cancel" | null>(null)
  const [workflowId, setWorkflowId] = useState(workflows[0]?.id ?? "")
  const [busy, setBusy] = useState(false)
  const [receipt, setReceipt] = useState<{ action: "start" | "cancel"; done: string[]; skipped: string[] } | null>(null)

  if (workflows.length === 0 || selectedIds.length === 0) return null

  const start = async () => {
    setBusy(true)
    try {
      const result = await bulkStartApprovalsAction(workspaceId, selectedIds, workflowId)
      if (!result.success || !result.data) { toast.error(result.error || "Could not start these Approvals"); return }
      setReceipt({ action: "start", done: result.data.started, skipped: result.data.skipped })
      setConfirming(null)
      clear()
    } catch {
      toast.error("Could not reach the server")
    } finally {
      setBusy(false)
    }
  }

  const cancel = async () => {
    setBusy(true)
    try {
      const result = await bulkCancelApprovalsAction(workspaceId, selectedIds)
      if (!result.success || !result.data) { toast.error(result.error || "Could not cancel these Approvals"); return }
      setReceipt({ action: "cancel", done: result.data.cancelled, skipped: result.data.skipped })
      setConfirming(null)
      clear()
    } catch {
      toast.error("Could not reach the server")
    } finally {
      setBusy(false)
    }
  }

  return <>
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" size="sm" variant="outline">Approval<ChevronDown className="h-3.5 w-3.5" aria-hidden /></Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-1">
        <button type="button" onClick={() => setConfirming("start")} className="flex w-full flex-col items-start rounded-sm px-2.5 py-2 text-left hover:bg-slate-100">
          <span className="text-sm font-medium text-slate-800">Start…</span>
          <span className="text-xs text-slate-600">Begin an approval workflow on the selected invoices.</span>
        </button>
        <button type="button" onClick={() => setConfirming("cancel")} className="flex w-full flex-col items-start rounded-sm px-2.5 py-2 text-left hover:bg-slate-100">
          <span className="text-sm font-medium text-slate-800">Cancel…</span>
          <span className="text-xs text-slate-600">Withdraw an approval that hasn&apos;t had a stage decided yet.</span>
        </button>
      </PopoverContent>
    </Popover>

    <Dialog open={confirming === "start"} title={`Start Approval for ${selectedIds.length} invoice${selectedIds.length === 1 ? "" : "s"}?`} onClose={() => { if (!busy) setConfirming(null) }}>
      <div className="space-y-3 px-5 py-4">
        <EligibilityStrip eligible={startEligibleIds.length} total={selectedIds.length} />
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Workflow</span>
          <select value={workflowId} onChange={(event) => setWorkflowId(event.target.value)} className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm">
            {workflows.map((workflow) => <option key={workflow.id} value={workflow.id}>{workflow.name} ({workflow.stageCount} stage{workflow.stageCount === 1 ? "" : "s"})</option>)}
          </select>
        </label>
        <ItemizedRecapTable records={selectedIds.map(toRecord)} />
        <div className="flex justify-end gap-2">
          <button type="button" className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100" disabled={busy} onClick={() => setConfirming(null)}>Cancel</button>
          <button type="button" className="inline-flex items-center gap-1.5 rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-40" disabled={busy || !workflowId} onClick={() => void start()}>
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}Start Approval
          </button>
        </div>
      </div>
    </Dialog>

    <Dialog open={confirming === "cancel"} title={`Cancel Approval for ${selectedIds.length} invoice${selectedIds.length === 1 ? "" : "s"}?`} description="Only Approvals that haven't had a stage decided yet can be cancelled — the rest are skipped." onClose={() => { if (!busy) setConfirming(null) }}>
      <div className="space-y-3 px-5 py-4">
        <EligibilityStrip eligible={cancelEligibleIds.length} total={selectedIds.length} />
        <ItemizedRecapTable records={selectedIds.map(toRecord)} />
        <div className="flex justify-end gap-2">
          <button type="button" className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100" disabled={busy} onClick={() => setConfirming(null)}>Back</button>
          <button type="button" className="inline-flex items-center gap-1.5 rounded-md bg-amber-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-40" disabled={busy} onClick={() => void cancel()}>
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}Cancel Approval
          </button>
        </div>
      </div>
    </Dialog>

    <Dialog open={receipt !== null} title={receipt?.action === "start" ? "Start Approval" : "Cancel Approval"} width="max-w-lg"
      description={receipt ? (receipt.skipped.length === 0
        ? `${receipt.done.length} ${receipt.action === "start" ? "started" : "cancelled"}.`
        : `${receipt.done.length} ${receipt.action === "start" ? "started" : "cancelled"}, ${receipt.skipped.length} skipped.`) : ""}
      onClose={() => setReceipt(null)}>
      <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-4">
        {receipt && receipt.done.length > 0 && <section>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-700">{receipt.action === "start" ? "Started" : "Cancelled"} ({receipt.done.length})</h3>
          <ItemizedRecapTable records={receipt.done.map(toRecord)} />
        </section>}
        {receipt && receipt.skipped.length > 0 && <section>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700">Skipped ({receipt.skipped.length})</h3>
          <p className="mb-1.5 text-xs text-slate-500">Already has an Approval in flight, or a stage has already been decided. See the row&apos;s Approval tab for its current state.</p>
          <ItemizedRecapTable records={receipt.skipped.map(toRecord)} />
        </section>}
      </div>
      <div className="flex justify-end border-t bg-slate-50 px-5 py-3">
        <Button type="button" size="sm" onClick={() => setReceipt(null)}>Done</Button>
      </div>
    </Dialog>
  </>
}
