"use client"

import { useEffect, useId, useMemo, useRef, useState } from "react"
import { createApprovalWorkflowAction } from "@/app/(app)/workspaces/[workspaceId]/approval-actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { setUnsaved } from "@/lib/client/unsaved-changes"
import { useRouter } from "next/navigation"

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

/** What Duplicate hands the form: the flow's name and stages, ready to rename. */
export type ApprovalFlowDraft = { name: string; stages: { name: string; requireOwner: boolean; approverIds: string[]; minAmount: string }[] }
const fromDraft = (draft: ApprovalFlowDraft): StageRow[] => draft.stages.map((stage) => ({ key: nextKey++, ...stage }))

/** Beyond this many members, a flat row of toggle chips stops being scannable — one chip per
 * person, unbounded, is how a 12-person workspace turned "pick approvers" into a wall of buttons.
 * Past the threshold each stage gets its own filter box over the same chip list instead. */
const APPROVER_SEARCH_THRESHOLD = 5

/** One stage's editable row: name + remove up front, approvers/threshold behind disclosure so a
 * workspace that only cares about role-gating never has to look at either. Matches the rest of
 * the Automation section's rule-not-card language — a border-t and a label, not a bordered box
 * inside a bordered box. */
function StageEditor({ index, count, stage, members, onChange, onRemove, onMove, canRemove, nameError, thresholdError }: {
  index: number
  count: number
  stage: StageRow
  members: ApprovalFormMember[]
  onChange: (patch: Partial<StageRow>) => void
  onRemove: () => void
  onMove: (direction: -1 | 1) => void
  canRemove: boolean
  nameError: boolean
  thresholdError: boolean
}) {
  const nameId = useId()
  const thresholdId = useId()
  const detailsId = useId()
  const [approverFilter, setApproverFilter] = useState("")
  // Starts open when the stage already carries either setting: a stage whose approvers are named
  // should not hide that fact behind a closed disclosure the reader has to guess at.
  const [open, setOpen] = useState(stage.approverIds.length > 0 || stage.minAmount.trim() !== "" || stage.requireOwner)

  const toggleApprover = (memberId: string) => {
    const has = stage.approverIds.includes(memberId)
    onChange({ approverIds: has ? stage.approverIds.filter((id) => id !== memberId) : [...stage.approverIds, memberId] })
  }

  const visibleMembers = useMemo(() => {
    if (members.length <= APPROVER_SEARCH_THRESHOLD || !approverFilter.trim()) return members
    const needle = approverFilter.trim().toLowerCase()
    return members.filter((m) => (m.name || m.email).toLowerCase().includes(needle))
  }, [members, approverFilter])

  return <div className="border-t border-hairline py-4 first:border-t-0 first:pt-0">
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
      {/* Order is the flow: a stage that lands in the wrong place is moved, not deleted and retyped. */}
      <button type="button" disabled={index === 0} onClick={() => onMove(-1)} aria-label={`Move stage ${index + 1} up`} className="shrink-0 text-[13px] font-medium text-slate-500 hover:text-slate-900 disabled:opacity-40">↑</button>
      <button type="button" disabled={index === count - 1} onClick={() => onMove(1)} aria-label={`Move stage ${index + 1} down`} className="shrink-0 text-[13px] font-medium text-slate-500 hover:text-slate-900 disabled:opacity-40">↓</button>
      <button type="button" disabled={!canRemove} onClick={onRemove} className="shrink-0 text-[13px] font-medium text-slate-500 hover:text-red-700 disabled:opacity-40">
        Remove
      </button>
    </div>
    {nameError && <p className="mt-1 pl-7 text-xs text-red-600">Every stage needs a name.</p>}

    {/* #253: was a native <details>. The disclosure is the same, but the content is unmounted
      * while closed rather than hidden with CSS — the in-page detector read the CSS-hidden
      * subtree as occluded text on every render, and the <summary> carried the page's smallest
      * type. A button with aria-expanded also announces its state, which a styled <summary> with
      * its marker removed did not. */}
    <div className="mt-2 pl-7">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={detailsId}
        onClick={() => setOpen((previous) => !previous)}
        className="text-left text-[13px] font-medium text-emerald-700 underline underline-offset-4 hover:text-emerald-800"
      >
        {stage.approverIds.length > 0 || stage.minAmount.trim()
          ? `Approvers & threshold — ${stage.approverIds.length > 0 ? `${stage.approverIds.length} named` : stage.requireOwner ? "owner only" : "any member"}${stage.minAmount.trim() ? `, ≥ ${stage.minAmount}` : ""}`
          : stage.requireOwner ? "Approvers & threshold — owner only" : "Add named approvers or an amount threshold (optional)"}
      </button>
      {open && <div id={detailsId} className="mt-3 grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
        <div>
          <span className="block text-[13px] font-medium text-slate-500">Named approvers</span>
          {members.length === 0
            ? <p className="mt-1 text-[13px] text-slate-600">No workspace members to name yet.</p>
            : <>
              {members.length > APPROVER_SEARCH_THRESHOLD && <Input
                type="search"
                value={approverFilter}
                onChange={(e) => setApproverFilter(e.target.value)}
                placeholder="Filter members"
                aria-label="Filter approvers"
                className="mt-1 mb-1.5 max-w-xs"
              />}
              <div className="flex flex-wrap gap-1.5">
                {visibleMembers.length === 0 && <span className="text-[13px] text-slate-600">No member matches &ldquo;{approverFilter}&rdquo;.</span>}
                {visibleMembers.map((member) => {
                  const on = stage.approverIds.includes(member.id)
                  return <button
                    key={member.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleApprover(member.id)}
                    className={`rounded-full border px-2.5 py-1 text-[13px] ${on ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-slate-200 text-slate-600 hover:bg-slate-100"}`}
                  >
                    {member.name || member.email}{member.role === "owner" ? " · owner" : ""}
                  </button>
                })}
              </div>
            </>}
          {stage.approverIds.length > 0 && <p className="mt-1.5 max-w-[48ch] text-[13px] text-slate-500">Only {stage.approverIds.length === 1 ? "this person" : "these people"} can decide this stage, whatever their role.</p>}
          {stage.approverIds.length === 0 && <label className="mt-2 flex items-center gap-1.5 text-[13px] text-slate-600">
            <input type="checkbox" checked={stage.requireOwner} onChange={(event) => onChange({ requireOwner: event.target.checked })} className="h-3.5 w-3.5 accent-emerald-700" />
            Owner only
          </label>}
        </div>
        <div>
          <Label htmlFor={thresholdId} className="text-[13px] font-medium text-slate-500">Amount threshold</Label>
          <Input
            id={thresholdId}
            type="number"
            step="0.01"
            min="0"
            value={stage.minAmount}
            onChange={(event) => onChange({ minAmount: event.target.value })}
            placeholder="e.g. 10000"
            className="mt-1"
            aria-invalid={thresholdError || undefined}
          />
          {thresholdError
            ? <p className="mt-1 text-xs text-red-600">The threshold must be 0 or more.</p>
            : <p className="mt-1 text-[13px] text-slate-500">Skip this stage below this amount. Blank = always applies.</p>}
        </div>
      </div>}
    </div>
  </div>
}

/** Stage rows are plain component state, not uncontrolled `<input defaultValue>`s — the form
 * submits by array position (`stageName_0`, `stageName_1`, ...), so removing a row has to
 * reindex everything after it, which only a controlled array can do cleanly.
 *
 * WP-AP2: `approverIds` and `minAmount` are optional per-stage settings. Empty approver list ⇒
 * role-only gating (the historic behavior). Blank minAmount ⇒ the stage applies at every amount.
 * The engine's canDecideStage / applicableStages honor both — see lib/approvals/engine.ts. */
export function ApprovalWorkflowForm({ workspaceId, members, draft, onTypedChange }: {
  workspaceId: string
  members: ApprovalFormMember[]
  /** Set by Duplicate on a row above; the form takes it as its new content and moves focus to the name. */
  draft?: ApprovalFlowDraft | null
  /** Tells the owner of `draft` whether the form holds typed work, so Duplicate asks before replacing it. */
  onTypedChange?: (typed: boolean) => void
}) {
  const router = useRouter()
  const nameId = useId()
  const formKey = useId()
  const nameRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState(false)
  const [name, setName] = useState(draft?.name ?? "")
  const [stages, setStages] = useState<StageRow[]>(draft ? fromDraft(draft) : [emptyStage(), emptyStage()])
  const [showErrors, setShowErrors] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<string | null>(null)

  useEffect(() => {
    if (!draft) return
    setName(draft.name); setStages(fromDraft(draft)); setShowErrors(false); setError(null); setCreated(null)
    nameRef.current?.focus(); nameRef.current?.select()
  }, [draft])

  // A half-built flow is unsaved work: the Admin leave guard asks before it is lost, the same as
  // a dirty save bar elsewhere in Admin.
  const typed = name.trim() !== "" || stages.some((stage) => stage.name.trim() !== "" || stage.approverIds.length > 0 || stage.minAmount.trim() !== "")
  useEffect(() => {
    setUnsaved(formKey, typed ? "You have a flow that hasn't been created yet." : null)
    onTypedChange?.(typed)
    return () => setUnsaved(formKey, null)
  }, [formKey, typed, onTypedChange])

  const moveStage = (index: number, direction: -1 | 1) => setStages((previous) => {
    const target = index + direction
    if (target < 0 || target >= previous.length) return previous
    const next = [...previous]
    ;[next[index], next[target]] = [next[target], next[index]]
    return next
  })
  const updateStage = (index: number, patch: Partial<StageRow>) => setStages((previous) => previous.map((stage, i) => (i === index ? { ...stage, ...patch } : stage)))
  const removeStage = (index: number) => setStages((previous) => previous.filter((_, i) => i !== index))
  const addStage = () => setStages((previous) => [...previous, emptyStage()])

  const blankStageIndexes = new Set(stages.map((s, i) => (s.name.trim() ? -1 : i)).filter((i) => i >= 0))
  const badThresholdIndexes = new Set(stages.map((s, i) => (s.minAmount.trim() === "" || (Number.isFinite(Number(s.minAmount)) && Number(s.minAmount) >= 0) ? -1 : i)).filter((i) => i >= 0))
  const formInvalid = !name.trim() || blankStageIndexes.size > 0 || badThresholdIndexes.size > 0

  const submit = async () => {
    if (formInvalid) {
      setShowErrors(true)
      // The first problem gets focus, so a keyboard or screen-reader user lands on it rather than
      // hunting five red lines from the button.
      window.requestAnimationFrame(() => document.querySelector<HTMLElement>("[aria-invalid=true]")?.focus())
      return
    }
    setPending(true); setError(null); setCreated(null)
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
      if (!result.success) { setError(`Couldn't create the flow — ${result.error || "the server didn't say why"}. What you typed is still here.`); return }
      setCreated(name.trim())
      setName("")
      setStages([emptyStage(), emptyStage()])
      setShowErrors(false)
      router.refresh()
    } catch {
      setError("Couldn't reach the server. What you typed is still here.")
    } finally { setPending(false) }
  }

  return <div>
    <div>
      <Label htmlFor={nameId} className="text-[13px]">Flow name</Label>
      <Input ref={nameRef} id={nameId} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Two-step finance approval" className="mt-1.5" aria-invalid={(showErrors && !name.trim()) || undefined} />
      {showErrors && !name.trim() && <p className="mt-1 text-xs text-red-600">Name the flow.</p>}
    </div>

    <div className="mt-5">
      <span className="block text-[13px] font-medium text-slate-700">Stages, in order</span>
      <div className="mt-1">
        {stages.map((stage, index) => (
          <StageEditor
            key={stage.key}
            index={index}
            count={stages.length}
            stage={stage}
            members={members}
            onChange={(patch) => updateStage(index, patch)}
            onRemove={() => removeStage(index)}
            onMove={(direction) => moveStage(index, direction)}
            canRemove={stages.length > 1}
            nameError={showErrors && blankStageIndexes.has(index)}
            thresholdError={showErrors && badThresholdIndexes.has(index)}
          />
        ))}
      </div>
      <button type="button" onClick={addStage} className="mt-3 text-sm font-medium text-emerald-700 underline underline-offset-4 hover:text-emerald-800">
        + Add stage
      </button>
    </div>

    <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-hairline pt-5">
      <Button onClick={() => void submit()} disabled={pending}>{pending ? "Creating…" : "Create flow"}</Button>
      {/* The refusal sits beside the action with the form intact, where AdminSaveBar puts its own —
        * not a toast that vanishes before it is read. */}
      {error && <span role="alert" className="text-xs text-red-700">{error}</span>}
      {/* Success is said where the reader is, and the flow itself appears in the list above. */}
      {created && !error && <span role="status" className="text-xs font-medium text-emerald-800">&ldquo;{created}&rdquo; is in the list above.</span>}
    </div>
  </div>
}
