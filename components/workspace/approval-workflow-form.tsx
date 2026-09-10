"use client"

import { createApprovalWorkflowAction } from "@/app/(app)/workspaces/[workspaceId]/approval-actions"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

export type ApprovalFormMember = { id: string; name: string; email: string; role: "owner" | "member" }

type StageRow = {
  key: number
  name: string
  requireOwner: boolean
  approverIds: string[]
  minAmount: string
}

let nextKey = 0
const emptyStage = (): StageRow => ({ key: nextKey++, name: "", requireOwner: false, approverIds: [], minAmount: "" })

/** Stage rows are plain component state, not uncontrolled `<input defaultValue>`s — the form
 * submits by array position (`stageName_0`, `stageName_1`, ...), so removing a row has to
 * reindex everything after it, which only a controlled array can do cleanly.
 *
 * WP-AP2: `approverIds` and `minAmount` are optional per-stage settings. Empty approver list ⇒
 * role-only gating (the historic behavior). Blank minAmount ⇒ the stage applies at every amount.
 * The engine's canDecideStage / applicableStages honor both — see lib/approvals/engine.ts. */
export function ApprovalWorkflowForm({ workspaceId, members }: { workspaceId: string; members: ApprovalFormMember[] }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [stages, setStages] = useState<StageRow[]>([emptyStage(), emptyStage()])

  const updateStage = (index: number, patch: Partial<StageRow>) => setStages((previous) => previous.map((stage, i) => (i === index ? { ...stage, ...patch } : stage)))
  const removeStage = (index: number) => setStages((previous) => previous.filter((_, i) => i !== index))
  const addStage = () => setStages((previous) => [...previous, emptyStage()])
  const toggleApprover = (index: number, memberId: string) => setStages((previous) => previous.map((stage, i) => {
    if (i !== index) return stage
    const has = stage.approverIds.includes(memberId)
    return { ...stage, approverIds: has ? stage.approverIds.filter((id) => id !== memberId) : [...stage.approverIds, memberId] }
  }))

  const submit = async (formData: FormData) => {
    setPending(true)
    try {
      formData.set("stageCount", String(stages.length))
      stages.forEach((stage, index) => {
        formData.set(`stageName_${index}`, stage.name)
        if (stage.requireOwner) formData.set(`stageRequireOwner_${index}`, "on")
        for (const id of stage.approverIds) formData.append(`stageApproverIds_${index}`, id)
        if (stage.minAmount.trim()) formData.set(`stageMinAmount_${index}`, stage.minAmount.trim())
      })
      const result = await createApprovalWorkflowAction(workspaceId, formData)
      if (!result.success) { toast.error(result.error || "Could not create the workflow"); return }
      toast.success("Workflow created")
      setStages([emptyStage(), emptyStage()])
      router.refresh()
    } catch {
      toast.error("Could not reach the server")
    } finally { setPending(false) }
  }

  return <form action={submit} className="space-y-3 rounded border p-4">
    <div>
      <label className="block text-xs font-medium text-slate-500">Workflow name</label>
      <input name="name" required className="mt-1 w-full rounded-md border px-2.5 py-1.5 text-sm" placeholder="e.g. Two-step finance approval" />
    </div>
    <div>
      <label className="block text-xs font-medium text-slate-500">Stages, in order</label>
      <div className="mt-1.5 space-y-3">
        {stages.map((stage, index) => (
          <div key={stage.key} className="rounded-md border border-slate-200 bg-slate-50/40 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-5 shrink-0 text-right text-xs text-slate-400">{index + 1}.</span>
              <input value={stage.name} onChange={(event) => updateStage(index, { name: event.target.value })} className="flex-1 rounded-md border px-2.5 py-1.5 text-sm" placeholder="e.g. Bookkeeper check" />
              <label className="flex shrink-0 items-center gap-1.5 text-xs text-slate-600">
                <input type="checkbox" checked={stage.requireOwner} onChange={(event) => updateStage(index, { requireOwner: event.target.checked })} disabled={stage.approverIds.length > 0} /> Owner only
              </label>
              <button type="button" disabled={stages.length <= 1} onClick={() => removeStage(index)} className="shrink-0 rounded-md border px-2 py-1 text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-40">Remove</button>
            </div>
            <div className="grid gap-2 pl-7 md:grid-cols-[minmax(0,1fr)_180px]">
              <div>
                <label className="block text-[11px] font-medium uppercase tracking-wide text-slate-500">Named approvers (optional)</label>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {members.length === 0 && <span className="text-xs text-slate-400">No workspace members to name yet.</span>}
                  {members.map((member) => {
                    const on = stage.approverIds.includes(member.id)
                    return <button
                      key={member.id}
                      type="button"
                      onClick={() => toggleApprover(index, member.id)}
                      className={`rounded-full border px-2.5 py-0.5 text-xs ${on ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-slate-200 text-slate-600 hover:bg-slate-100"}`}
                    >
                      {member.name || member.email}{member.role === "owner" ? " · owner" : ""}
                    </button>
                  })}
                </div>
                {stage.approverIds.length > 0 && <p className="mt-1 text-[11px] text-slate-500">Only these {stage.approverIds.length === 1 ? "person" : "people"} can decide this stage. Owner-only is superseded.</p>}
              </div>
              <div>
                <label className="block text-[11px] font-medium uppercase tracking-wide text-slate-500">Amount threshold</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={stage.minAmount}
                  onChange={(event) => updateStage(index, { minAmount: event.target.value })}
                  className="mt-1 w-full rounded-md border px-2.5 py-1.5 text-sm"
                  placeholder="e.g. 10000"
                />
                <p className="mt-1 text-[11px] text-slate-500">Skip this stage below this amount. Blank = always applies.</p>
              </div>
            </div>
          </div>
        ))}
      </div>
      <button type="button" onClick={addStage} className="mt-2 rounded-md border px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50">+ Add stage</button>
    </div>
    <button type="submit" disabled={pending} className="rounded-md bg-emerald-700 px-3.5 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">Create workflow</button>
  </form>
}
