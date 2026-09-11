"use client"

import { useId, useMemo, useState } from "react"
import { createApprovalWorkflowAction } from "@/app/(app)/workspaces/[workspaceId]/approval-actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useRouter } from "next/navigation"
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

/** Beyond this many members, a flat row of toggle chips stops being scannable — one chip per
 * person, unbounded, is how a 12-person workspace turned "pick approvers" into a wall of buttons.
 * Past the threshold each stage gets its own filter box over the same chip list instead. */
const APPROVER_SEARCH_THRESHOLD = 5

/** One stage's editable row: name + remove up front, approvers/threshold behind disclosure so a
 * workspace that only cares about role-gating never has to look at either. Matches the rest of
 * the Automation section's rule-not-card language — a border-t and a label, not a bordered box
 * inside a bordered box. */
function StageEditor({ index, stage, members, onChange, onRemove, canRemove, nameError }: {
  index: number
  stage: StageRow
  members: ApprovalFormMember[]
  onChange: (patch: Partial<StageRow>) => void
  onRemove: () => void
  canRemove: boolean
  nameError: boolean
}) {
  const nameId = useId()
  const thresholdId = useId()
  const [approverFilter, setApproverFilter] = useState("")

  const toggleApprover = (memberId: string) => {
    const has = stage.approverIds.includes(memberId)
    onChange({ approverIds: has ? stage.approverIds.filter((id) => id !== memberId) : [...stage.approverIds, memberId] })
  }

  const visibleMembers = useMemo(() => {
    if (members.length <= APPROVER_SEARCH_THRESHOLD || !approverFilter.trim()) return members
    const needle = approverFilter.trim().toLowerCase()
    return members.filter((m) => (m.name || m.email).toLowerCase().includes(needle))
  }, [members, approverFilter])

  return <div className="border-t border-[#e6ebf1] py-4 first:border-t-0 first:pt-0">
    <div className="flex items-center gap-2.5">
      <span className="w-5 shrink-0 text-right text-xs tabular-nums text-slate-400">{index + 1}.</span>
      <div className="flex-1">
        <Label htmlFor={nameId} className="sr-only">Stage {index + 1} name</Label>
        <Input
          id={nameId}
          value={stage.name}
          onChange={(event) => onChange({ name: event.target.value })}
          placeholder="e.g. Bookkeeper check"
          aria-invalid={nameError || undefined}
          className={nameError ? "border-red-400 focus-visible:ring-red-400" : undefined}
        />
      </div>
      <button type="button" disabled={!canRemove} onClick={onRemove} className="shrink-0 text-[13px] font-medium text-slate-500 hover:text-red-700 disabled:opacity-40">
        Remove
      </button>
    </div>
    {nameError && <p className="mt-1 pl-7 text-xs text-red-600">Every stage needs a name.</p>}

    <details className="mt-2 pl-7 [&_summary::-webkit-details-marker]:hidden">
      <summary className="cursor-pointer text-[13px] font-medium text-emerald-700 underline underline-offset-4 hover:text-emerald-800">
        {stage.approverIds.length > 0 || stage.minAmount.trim()
          ? `Approvers & threshold — ${stage.approverIds.length > 0 ? `${stage.approverIds.length} named` : "any member"}${stage.minAmount.trim() ? `, ≥ ${stage.minAmount}` : ""}`
          : "Add named approvers or an amount threshold (optional)"}
      </summary>
      <div className="mt-3 grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
        <div>
          <span className="block text-xs font-medium text-slate-500">Named approvers</span>
          {members.length === 0
            ? <p className="mt-1 text-xs text-slate-400">No workspace members to name yet.</p>
            : <>
              {members.length > APPROVER_SEARCH_THRESHOLD && <input
                type="search"
                value={approverFilter}
                onChange={(e) => setApproverFilter(e.target.value)}
                placeholder="Filter members"
                aria-label="Filter approvers"
                className="mt-1 mb-1.5 w-full rounded-md border border-[#e6ebf1] px-2.5 py-1 text-xs focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
              />}
              <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
                {visibleMembers.length === 0 && <span className="text-xs text-slate-400">No member matches &ldquo;{approverFilter}&rdquo;.</span>}
                {visibleMembers.map((member) => {
                  const on = stage.approverIds.includes(member.id)
                  return <button
                    key={member.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleApprover(member.id)}
                    className={`rounded-full border px-2.5 py-0.5 text-xs ${on ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-slate-200 text-slate-600 hover:bg-slate-100"}`}
                  >
                    {member.name || member.email}{member.role === "owner" ? " · owner" : ""}
                  </button>
                })}
              </div>
            </>}
          {stage.approverIds.length > 0 && <p className="mt-1.5 text-[11px] text-slate-500">Only these {stage.approverIds.length === 1 ? "person" : "people"} can decide this stage. Owner-only is superseded.</p>}
          {stage.approverIds.length === 0 && <label className="mt-2 flex items-center gap-1.5 text-xs text-slate-600">
            <input type="checkbox" checked={stage.requireOwner} onChange={(event) => onChange({ requireOwner: event.target.checked })} className="h-3.5 w-3.5 accent-emerald-700" />
            Owner only
          </label>}
        </div>
        <div>
          <Label htmlFor={thresholdId} className="text-xs font-medium text-slate-500">Amount threshold</Label>
          <Input
            id={thresholdId}
            type="number"
            step="0.01"
            min="0"
            value={stage.minAmount}
            onChange={(event) => onChange({ minAmount: event.target.value })}
            placeholder="e.g. 10000"
            className="mt-1"
          />
          <p className="mt-1 text-[11px] text-slate-500">Skip this stage below this amount. Blank = always applies.</p>
        </div>
      </div>
    </details>
  </div>
}

/** Stage rows are plain component state, not uncontrolled `<input defaultValue>`s — the form
 * submits by array position (`stageName_0`, `stageName_1`, ...), so removing a row has to
 * reindex everything after it, which only a controlled array can do cleanly.
 *
 * WP-AP2: `approverIds` and `minAmount` are optional per-stage settings. Empty approver list ⇒
 * role-only gating (the historic behavior). Blank minAmount ⇒ the stage applies at every amount.
 * The engine's canDecideStage / applicableStages honor both — see lib/approvals/engine.ts. */
export function ApprovalWorkflowForm({ workspaceId, members }: { workspaceId: string; members: ApprovalFormMember[] }) {
  const router = useRouter()
  const nameId = useId()
  const [pending, setPending] = useState(false)
  const [name, setName] = useState("")
  const [stages, setStages] = useState<StageRow[]>([emptyStage(), emptyStage()])
  const [showErrors, setShowErrors] = useState(false)

  const updateStage = (index: number, patch: Partial<StageRow>) => setStages((previous) => previous.map((stage, i) => (i === index ? { ...stage, ...patch } : stage)))
  const removeStage = (index: number) => setStages((previous) => previous.filter((_, i) => i !== index))
  const addStage = () => setStages((previous) => [...previous, emptyStage()])

  const blankStageIndexes = new Set(stages.map((s, i) => (s.name.trim() ? -1 : i)).filter((i) => i >= 0))
  const formInvalid = !name.trim() || blankStageIndexes.size > 0

  const submit = async () => {
    if (formInvalid) { setShowErrors(true); return }
    setPending(true)
    try {
      const formData = new FormData()
      formData.set("name", name)
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
      setName("")
      setStages([emptyStage(), emptyStage()])
      setShowErrors(false)
      router.refresh()
    } catch {
      toast.error("Could not reach the server")
    } finally { setPending(false) }
  }

  return <div>
    <div>
      <Label htmlFor={nameId} className="text-[13px]">Workflow name</Label>
      <Input id={nameId} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Two-step finance approval" className="mt-1.5" aria-invalid={(showErrors && !name.trim()) || undefined} />
      {showErrors && !name.trim() && <p className="mt-1 text-xs text-red-600">Name the workflow.</p>}
    </div>

    <div className="mt-5">
      <span className="block text-[13px] font-medium text-slate-700">Stages, in order</span>
      <div className="mt-1">
        {stages.map((stage, index) => (
          <StageEditor
            key={stage.key}
            index={index}
            stage={stage}
            members={members}
            onChange={(patch) => updateStage(index, patch)}
            onRemove={() => removeStage(index)}
            canRemove={stages.length > 1}
            nameError={showErrors && blankStageIndexes.has(index)}
          />
        ))}
      </div>
      <button type="button" onClick={addStage} className="mt-3 text-sm font-medium text-emerald-700 underline underline-offset-4 hover:text-emerald-800">
        + Add stage
      </button>
    </div>

    <div className="mt-6 border-t border-[#e6ebf1] pt-5">
      <Button onClick={() => void submit()} disabled={pending}>{pending ? "Creating…" : "Create workflow"}</Button>
    </div>
  </div>
}
