"use client"

import { setPoMismatchPolicyAction } from "@/app/(app)/workspaces/[workspaceId]/actions"
import { AdminSaveBar } from "@/components/admin/admin-save-bar"
import { Consequence } from "@/components/admin/admin-ui"
import { Panel } from "@/components/automation/automation-ui"
import { Input } from "@/components/ui/input"
import { useRouter } from "next/navigation"
import { useCallback, useId, useMemo, useState } from "react"

export type MismatchApproverOption = { id: string; name: string; email: string; role: "owner" | "member" }

/** Beyond this many members a flat chip row stops being scannable — the same threshold the stage
 * approver picker uses, so the two pickers behave identically (critique H4). */
const APPROVER_SEARCH_THRESHOLD = 5

/** #253: Admin › PO Mismatch Flows' two decided panels — Tolerances and Who approves a mismatch —
 * as ONE form under ONE save bar.
 *
 * Two sticky save bars on a page is the exact H4 defect #252 closed on the Tax and Companies
 * pages; the panels are separate *headings*, not separate save grammars. Nothing applies on blur
 * or on toggle: an owner must not have half a policy in force.
 *
 * The quantity tolerance is the field that moved here from Settings › Workspace; the match
 * variance is #228's percent, stored 0–1 on WorkspaceAutomationConfig.matchTolerance.percent and
 * shown 0–100 here. Both are the knobs the View PO row (#250) already honours. */
export function PoMismatchPolicy({ workspaceId, quantityPercent, matchVariancePercent, members, approverIds, readOnly = false }: {
  workspaceId: string
  quantityPercent: number
  /** 0–100, already converted from the stored 0–1 by the page. */
  matchVariancePercent: number
  members: MismatchApproverOption[]
  approverIds: string[]
  readOnly?: boolean
}) {
  const router = useRouter()
  const quantityId = useId()
  const varianceId = useId()

  const [savedQuantity, setSavedQuantity] = useState(quantityPercent)
  const [savedVariance, setSavedVariance] = useState(matchVariancePercent)
  const [savedApprovers, setSavedApprovers] = useState<string[]>(approverIds)

  const [quantity, setQuantity] = useState(String(quantityPercent))
  const [variance, setVariance] = useState(String(matchVariancePercent))
  const [approvers, setApprovers] = useState<string[]>(approverIds)

  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [filter, setFilter] = useState("")

  const quantityValue = Number(quantity)
  const varianceValue = Number(variance)
  const quantityValid = quantity.trim() !== "" && Number.isFinite(quantityValue) && quantityValue >= 0 && quantityValue <= 100
  const varianceValid = variance.trim() !== "" && Number.isFinite(varianceValue) && varianceValue >= 0 && varianceValue <= 100

  const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((id) => b.includes(id))
  const dirty =
    (quantityValid ? quantityValue !== savedQuantity : quantity !== String(savedQuantity)) ||
    (varianceValid ? varianceValue !== savedVariance : variance !== String(savedVariance)) ||
    !sameSet(approvers, savedApprovers)

  const blocker = !quantityValid
    ? "Quantity tolerance must be a number between 0 and 100."
    : !varianceValid
      ? "Match variance must be a number between 0 and 100."
      : null

  const clearSaved = useCallback(() => setSavedAt(null), [])

  const visibleMembers = useMemo(() => {
    if (members.length <= APPROVER_SEARCH_THRESHOLD || !filter.trim()) return members
    const needle = filter.trim().toLowerCase()
    return members.filter((member) => (member.name || member.email).toLowerCase().includes(needle))
  }, [members, filter])

  const toggle = (id: string) =>
    setApprovers((previous) => (previous.includes(id) ? previous.filter((other) => other !== id) : [...previous, id]))

  const save = async () => {
    if (blocker) return
    setPending(true); setError(null)
    try {
      const result = await setPoMismatchPolicyAction(workspaceId, {
        quantityPercent: quantityValue,
        matchVariancePercent: varianceValue,
        approverIds: approvers,
      })
      if (!result.success) {
        setError(`Couldn't save — ${result.error || "the server didn't say why"}. Your changes are still here.`)
        return
      }
      setSavedQuantity(quantityValue); setSavedVariance(varianceValue); setSavedApprovers(approvers)
      setSavedAt(Date.now())
      router.refresh()
    } catch {
      setError("Couldn't reach the server. Your changes are still here.")
    } finally { setPending(false) }
  }

  const discard = () => {
    setQuantity(String(savedQuantity)); setVariance(String(savedVariance)); setApprovers(savedApprovers)
    setError(null)
  }

  const namedApprovers = savedApprovers
    .map((id) => members.find((member) => member.id === id))
    .filter((member): member is MismatchApproverOption => Boolean(member))

  return <div className="space-y-10">
    <Panel title="Tolerances" note="How far an invoice may differ from its purchase order before the row shows a mismatch.">
      <div className="divide-y divide-hairline-soft">
        <ToleranceRow
          id={quantityId}
          label="Quantity tolerance"
          description="How far a purchase order's cumulative invoiced quantity may exceed what was ordered before the line shows ≠ and the consumption check holds the invoice."
          value={quantity}
          onChange={setQuantity}
          invalid={!quantityValid}
          disabled={pending || readOnly}
        />
        <ToleranceRow
          id={varianceId}
          label="Match variance"
          description="How far an invoice's unit price and total may differ from the order before the Total carries the match-variance gate and the invoice waits for someone to override it."
          value={variance}
          onChange={setVariance}
          invalid={!varianceValid}
          disabled={pending || readOnly}
        />
      </div>
      <div className="mt-4">
        <Consequence>
          A line inside both tolerances shows = on the invoice row and needs nobody. Over the quantity
          tolerance, the consumption check holds the invoice for its stage&rsquo;s approver. Over the
          match variance, the invoice waits for an override by whoever is named below.
        </Consequence>
      </div>
    </Panel>

    <Panel title="Who approves a mismatch" note="The people who may override a blocked PO mismatch and let the invoice through.">
      {members.length === 0
        ? <p className="text-sm text-slate-600">Nobody to name yet. Invite people under Admin &rsaquo; Users first.</p>
        : <>
            {members.length > APPROVER_SEARCH_THRESHOLD && <Input
              type="search"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filter members"
              aria-label="Filter people who can approve a mismatch"
              disabled={pending || readOnly}
              className="mb-3 max-w-xs"
            />}
            <div className="flex flex-wrap gap-2">
              {visibleMembers.length === 0 && <span className="text-[13px] text-slate-600">No member matches &ldquo;{filter}&rdquo;.</span>}
              {visibleMembers.map((member) => {
                const on = approvers.includes(member.id)
                return <button
                  key={member.id}
                  type="button"
                  aria-pressed={on}
                  disabled={pending || readOnly}
                  onClick={() => toggle(member.id)}
                  className={`rounded-full border px-3 py-1 text-[13px] disabled:opacity-60 ${on ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-slate-200 text-slate-600 hover:bg-slate-100"}`}
                >
                  {member.name || member.email}{member.role === "owner" ? " · owner" : ""}
                </button>
              })}
            </div>
          </>}
      <div className="mt-4">
        <Consequence>
          {namedApprovers.length === 0
            ? <>Nobody is named, so a mismatch is decided by <span className="font-medium text-slate-900">the current stage&rsquo;s approver</span> — whoever the invoice&rsquo;s approval flow has it with. That is what is in force now.</>
            : <>Only <span className="font-medium text-slate-900">{namedApprovers.map((member) => member.name || member.email).join(", ")}</span> can override a PO mismatch. Anyone else who tries is told to ask {namedApprovers.length === 1 ? "them" : "one of them"}.</>}
        </Consequence>
      </div>
    </Panel>

    <AdminSaveBar
      dirty={dirty} pending={pending} error={error} savedAt={savedAt} blocker={blocker} disabled={readOnly}
      onSave={() => void save()} onDiscard={discard} onSavedShown={clearSaved} />
  </div>
}

/** One ruled tolerance: its name and sentence on the left, its number right-aligned. A rule, not a
 * box — the Admin ledger grammar. */
function ToleranceRow({ id, label, description, value, onChange, invalid, disabled }: {
  id: string
  label: string
  description: string
  value: string
  onChange: (value: string) => void
  invalid: boolean
  disabled: boolean
}) {
  return <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-3 py-4 first:pt-0">
    <div className="min-w-0 max-w-[56ch]">
      <label htmlFor={id} className="block text-sm text-slate-900">{label}</label>
      <p className="mt-0.5 max-w-[52ch] text-xs leading-relaxed text-slate-500">{description}</p>
    </div>
    <div className="flex items-center gap-2">
      <Input
        id={id} type="number" min={0} max={100} step={1} inputMode="numeric"
        className="w-20 text-right tabular-nums" value={value} disabled={disabled}
        aria-invalid={invalid || undefined}
        onChange={(event) => onChange(event.target.value)} />
      <span className="text-sm text-slate-600">%</span>
    </div>
  </div>
}
