"use client"

import { useEffect, useId, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { estimateTouchlessImpactAction, updateAutomationConfigAction } from "@/app/(app)/workspaces/[workspaceId]/automation/settings/actions"
import { Panel } from "@/components/automation/automation-ui"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { SettingToggle } from "@/components/settings/setting-toggle"
import type { TouchlessImpactEstimate } from "@/lib/analytics/workspace-analytics"

type Level = "suggest" | "auto" | "touchless"

export type AutomationConfigInitial = {
  level: Level
  minConfidence: number
  qaSampleRate: number
  requirePolicyPass: boolean
  blockOnWarnChecks: boolean
  policyText: string | null
  amountBands: Array<{ min: number; max: number | null; minConfidence: number; requireVerifiedSupplier?: boolean }>
}

/** The three rungs, in the order they hand work over. Presented as a ladder rather than a list of
 * radios: the position on the track is the setting, so how far the workspace has gone is legible
 * before any of the labels are read. */
const LEVELS: { value: Level; name: string; blurb: string }[] = [
  { value: "suggest", name: "Suggest", blurb: "The engine codes a document and stops. Every one waits for a reviewer." },
  { value: "auto", name: "Auto with approval", blurb: "Coding is applied for you. A reviewer confirms it with a single click." },
  { value: "touchless", name: "Touchless", blurb: "Documents the engine is confident about publish themselves. The rest still route to review." },
]

/** Clamp to [0, 1] — the domain every confidence-shaped field in this form shares. Applied on
 * blur rather than on every keystroke so a workspace can still type "0." while composing a
 * decimal without the field fighting them for each character. */
const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

/** A comparable fingerprint of everything the form can change, so "has this been edited since
 * the last save" doesn't need a field-by-field diff. Settings used to have a single Save at the
 * bottom of a long form with nothing telling a reviewer they had unsaved edits if they scrolled
 * away or navigated off. */
type SnapshotInput = {
  level: Level
  minConfidence: number
  qaSampleRate: number
  requirePolicyPass: boolean
  blockOnWarnChecks: boolean
  policyText: string
  amountBands: AutomationConfigInitial["amountBands"]
}
const snapshot = (v: SnapshotInput) => JSON.stringify(v)

function AmountBandRow({ band, onChange, onRemove }: {
  band: { min: number; max: number | null; minConfidence: number; requireVerifiedSupplier?: boolean }
  onChange: (patch: Partial<typeof band>) => void
  onRemove: () => void
}) {
  const minId = useId()
  const maxId = useId()
  const confId = useId()
  const trustedId = useId()
  const invertedRange = band.max !== null && band.max < band.min
  return <div className="rounded-md border border-[#e6ebf1] p-4">
    <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_1fr_1fr_auto_auto]">
      <div>
        <Label htmlFor={minId} className="text-xs text-slate-500">From</Label>
        <Input id={minId} type="number" min={0} step="0.01" value={band.min} onChange={(e) => onChange({ min: Number(e.target.value) })} className="mt-1 tabular-nums" />
      </div>
      <div>
        <Label htmlFor={maxId} className="text-xs text-slate-500">Up to</Label>
        <Input
          id={maxId}
          type="number"
          min={0}
          step="0.01"
          value={band.max ?? ""}
          placeholder="No cap"
          onChange={(e) => onChange({ max: e.target.value === "" ? null : Number(e.target.value) })}
          aria-invalid={invertedRange || undefined}
          className={`mt-1 tabular-nums ${invertedRange ? "border-red-400 focus-visible:ring-red-400" : ""}`}
        />
      </div>
      <div>
        <Label htmlFor={confId} className="text-xs text-slate-500">Confidence needed</Label>
        <Input
          id={confId}
          type="number"
          min={0}
          max={1}
          step={0.01}
          value={band.minConfidence}
          onChange={(e) => onChange({ minConfidence: Number(e.target.value) })}
          onBlur={(e) => onChange({ minConfidence: clamp01(Number(e.target.value)) })}
          className="mt-1 tabular-nums"
        />
      </div>
      <SettingToggle
        id={trustedId}
        variant="inline"
        label="Trusted suppliers only"
        explanation="Only a supplier you've already verified qualifies for this band's lower confidence bar."
        checked={band.requireVerifiedSupplier ?? false}
        onChange={(checked) => onChange({ requireVerifiedSupplier: checked || undefined })}
      />
      <button type="button" onClick={onRemove} className="pb-2.5 text-[13px] font-medium text-red-700 hover:underline">
        Remove
      </button>
    </div>
    {invertedRange && <p className="mt-2 text-xs text-red-600">&ldquo;Up to&rdquo; must be at least &ldquo;From&rdquo;.</p>}
  </div>
}

export function AutomationConfigForm({ workspaceId, initial }: { workspaceId: string; initial: AutomationConfigInitial }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [level, setLevel] = useState<Level>(initial.level)
  const [minConfidence, setMinConfidence] = useState(initial.minConfidence)
  const [qaSampleRate, setQaSampleRate] = useState(initial.qaSampleRate)
  const [requirePolicyPass, setRequirePolicyPass] = useState(initial.requirePolicyPass)
  const [blockOnWarnChecks, setBlockOnWarnChecks] = useState(initial.blockOnWarnChecks)
  const [policyText, setPolicyText] = useState(initial.policyText ?? "")
  const [amountBands, setAmountBands] = useState(initial.amountBands)
  const minConfidenceId = useId()
  const qaSampleRateId = useId()

  // The Touchless confirm step: opened instead of saving directly when the switch is INTO
  // touchless from something else — the one change in this form that lets documents publish
  // with nobody looking at them. Toggling QA rate or editing a band doesn't need this weight;
  // this one action does.
  const [touchlessConfirm, setTouchlessConfirm] = useState<{ open: boolean; loading: boolean; estimate: TouchlessImpactEstimate | null }>({ open: false, loading: false, estimate: null })

  const [savedSnapshot, setSavedSnapshot] = useState(() => snapshot({
    level: initial.level, minConfidence: initial.minConfidence, qaSampleRate: initial.qaSampleRate,
    requirePolicyPass: initial.requirePolicyPass, blockOnWarnChecks: initial.blockOnWarnChecks,
    policyText: initial.policyText ?? "", amountBands: initial.amountBands,
  }))
  const currentSnapshot = snapshot({ level, minConfidence, qaSampleRate, requirePolicyPass, blockOnWarnChecks, policyText, amountBands })
  const dirty = currentSnapshot !== savedSnapshot

  useEffect(() => {
    if (!dirty) return
    const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = "" }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [dirty])

  const addBand = () => setAmountBands([...amountBands, { min: 0, max: null, minConfidence: 0.85 }])
  const removeBand = (i: number) => setAmountBands(amountBands.filter((_, idx) => idx !== i))
  const updateBand = (i: number, patch: Partial<typeof amountBands[number]>) =>
    setAmountBands(amountBands.map((b, idx) => (idx === i ? { ...b, ...patch } : b)))

  const bandsInvalid = amountBands.some((b) => b.max !== null && b.max < b.min)

  const persist = async () => {
    setPending(true)
    try {
      const result = await updateAutomationConfigAction({
        workspaceId,
        patch: {
          autonomyLevel: level,
          minConfidence,
          qaSampleRate,
          requirePolicyPass,
          blockOnWarnChecks,
          policyText: policyText.trim() || null,
          amountBands,
        },
      })
      if ("error" in result) {
        toast.error(result.error)
      } else {
        toast.success("Controls settings saved")
        setSavedSnapshot(currentSnapshot)
        router.refresh()
      }
    } finally {
      setPending(false)
    }
  }

  const submit = async () => {
    if (bandsInvalid) {
      toast.error("Fix the confidence-by-amount bands before saving — \"Up to\" must be at least \"From\".")
      return
    }
    if (level === "touchless" && initial.level !== "touchless") {
      setTouchlessConfirm({ open: true, loading: true, estimate: null })
      const result = await estimateTouchlessImpactAction({ workspaceId, minConfidence })
      setTouchlessConfirm({ open: true, loading: false, estimate: "ok" in result ? result.estimate : null })
      return
    }
    await persist()
  }

  const confirmTouchless = async () => {
    setTouchlessConfirm({ open: false, loading: false, estimate: null })
    await persist()
  }

  const reachedIndex = LEVELS.findIndex((l) => l.value === level)
  const touchless = level === "touchless"

  return <div className="space-y-10">
    <fieldset>
      <legend className="sr-only">Autonomy level</legend>
      <div className="grid gap-px overflow-hidden rounded-md border border-[#e6ebf1] bg-[#e6ebf1] sm:grid-cols-3">
        {LEVELS.map((option, index) => {
          const selected = level === option.value
          const reached = index <= reachedIndex
          const blurbId = `level-blurb-${option.value}`
          return (
            <label
              key={option.value}
              className={`group relative cursor-pointer p-4 transition-colors focus-within:outline focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-emerald-600 ${selected ? "bg-emerald-50" : "bg-white hover:bg-slate-50"}`}
            >
              {/* The rung marker: filled up to the level in force, so the ladder reads left to right. */}
              <span className={`mb-3 block h-1 rounded-full ${reached ? "bg-emerald-600" : "bg-slate-200"}`} aria-hidden />
              <span className="flex items-baseline gap-2">
                <input
                  type="radio"
                  name="level"
                  value={option.value}
                  checked={selected}
                  onChange={() => setLevel(option.value)}
                  aria-label={option.name}
                  aria-describedby={blurbId}
                  className="sr-only"
                />
                <span className={`text-sm font-semibold ${selected ? "text-emerald-900" : "text-slate-900"}`}>{option.name}</span>
                {selected && <span className="text-xs font-medium text-emerald-700">In force</span>}
              </span>
              <span id={blurbId} className="mt-1 block text-[13px] leading-relaxed text-slate-600">{option.blurb}</span>
            </label>
          )
        })}
      </div>
    </fieldset>

    <div className={touchless ? "space-y-10" : "space-y-10 opacity-55"}>
      {!touchless && (
        <p className="rounded-md border border-dashed border-[#dbe3ec] px-4 py-3 text-[13px] text-slate-600">
          These control what counts as confident enough to publish, so they only take effect at Touchless.
          You can set them up now and switch the level when you are ready.
        </p>
      )}

      <Panel title="Confidence to publish" note="A document has to clear this bar before it can go out without a reviewer.">
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <Label htmlFor={minConfidenceId} className="text-[13px]">Minimum confidence</Label>
            <Input
              id={minConfidenceId}
              type="number"
              min={0}
              max={1}
              step={0.01}
              value={minConfidence}
              onChange={(e) => setMinConfidence(Number(e.target.value))}
              onBlur={(e) => setMinConfidence(clamp01(Number(e.target.value)))}
              className="mt-1.5 tabular-nums"
            />
            <p className="mt-1.5 text-xs text-slate-500">Between 0 and 1. Most workspaces settle near 0.90.</p>
          </div>
          <div>
            <Label htmlFor={qaSampleRateId} className="text-[13px]">QA sample rate</Label>
            <Input
              id={qaSampleRateId}
              type="number"
              min={0}
              max={1}
              step={0.01}
              value={qaSampleRate}
              onChange={(e) => setQaSampleRate(Number(e.target.value))}
              onBlur={(e) => setQaSampleRate(clamp01(Number(e.target.value)))}
              className="mt-1.5 tabular-nums"
            />
            <p className="mt-1.5 text-xs text-slate-500">
              How much of the published work is spot-checked anyway. 0.05 sends one in twenty to a reviewer without holding it up.
            </p>
          </div>
        </div>
      </Panel>

      <Panel title="What blocks a publish" note="Conditions that send a document to review no matter how confident the coding is.">
        <div className="divide-y divide-[#f1f5f9]">
          <SettingToggle
            id="requirePolicyPass"
            label="The policy check has to pass"
            explanation="A document the policy rejects, or that the check could not evaluate, goes to a person."
            checked={requirePolicyPass}
            onChange={setRequirePolicyPass}
          />
          <SettingToggle
            id="blockOnWarnChecks"
            label="Any warning stops it, not just a failure"
            explanation="Stricter: arithmetic and duplicate warnings hold the document back too."
            checked={blockOnWarnChecks}
            onChange={setBlockOnWarnChecks}
          />
        </div>
      </Panel>

      <Panel title="Policy" note="Written in plain language and checked against every document before it publishes.">
        <Label htmlFor="policyText" className="sr-only">Policy</Label>
        <Textarea
          id="policyText"
          rows={4}
          value={policyText}
          onChange={(e) => setPolicyText(e.target.value)}
          placeholder="Expenses over $1,000 need a receipt attached."
        />
        <p className="mt-1.5 text-xs text-slate-500">Leave this empty and no policy check runs.</p>
      </Panel>

      <Panel
        title="Confidence by amount"
        note="A small invoice from a supplier you trust can clear a lower bar than a large one. Bands are read top to bottom and the first match wins."
      >
        {amountBands.length === 0
          ? <div className="rounded-md border border-dashed border-[#dbe3ec] px-4 py-6 text-center">
              <p className="text-sm text-slate-600">Every document is held to the workspace minimum above.</p>
              <button type="button" onClick={addBand} className="mt-2 text-sm font-medium text-emerald-700 underline underline-offset-4 hover:text-emerald-800">
                Add a band
              </button>
            </div>
          : <div className="space-y-3">
              {amountBands.map((band, i) => (
                <AmountBandRow key={i} band={band} onChange={(patch) => updateBand(i, patch)} onRemove={() => removeBand(i)} />
              ))}
              <button type="button" onClick={addBand} className="text-sm font-medium text-emerald-700 underline underline-offset-4 hover:text-emerald-800">
                Add a band
              </button>
            </div>}
      </Panel>
    </div>

    <div className="flex items-center gap-3 border-t border-[#e6ebf1] pt-5">
      <Button onClick={() => void submit()} disabled={pending || bandsInvalid}>{pending ? "Saving" : "Save changes"}</Button>
      {dirty && !pending && <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />
        Unsaved changes
      </span>}
      {bandsInvalid && <p className="text-xs text-red-600">Fix the confidence-by-amount bands above before saving.</p>}
    </div>

    <ConfirmDialog
      open={touchlessConfirm.open}
      busy={pending}
      title="Switch to Touchless?"
      description={`At a confidence bar of ${minConfidence.toFixed(2)}, documents the engine is that sure about will publish without a reviewer looking at them.`}
      confirmLabel={pending ? "Switching…" : "Switch to Touchless"}
      onConfirm={() => void confirmTouchless()}
      onCancel={() => setTouchlessConfirm({ open: false, loading: false, estimate: null })}
    >
      <div className="rounded-md border border-[#e6ebf1] bg-slate-50 px-3 py-2.5 text-[13px] text-slate-700">
        {touchlessConfirm.loading
          ? "Estimating from the last 30 days…"
          : touchlessConfirm.estimate
            ? touchlessConfirm.estimate.totalRecent === 0
              ? "No documents in the last 30 days to estimate from — this workspace's own history will start filling in as new ones arrive."
              : <>
                Of the last 30 days' <strong className="tabular-nums">{touchlessConfirm.estimate.totalRecent}</strong> documents,{" "}
                about <strong className="tabular-nums">{touchlessConfirm.estimate.eligible}</strong> would have cleared this bar on extraction confidence alone.
                <span className="mt-1 block text-[11px] text-slate-500">An estimate — checks, policy, and supplier cold-start can still hold a document back even past this line.</span>
              </>
            : "Couldn't estimate the impact right now — you can still switch, or cancel and try again."}
      </div>
    </ConfirmDialog>
  </div>
}
