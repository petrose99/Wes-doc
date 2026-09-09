"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { updateAutomationConfigAction } from "@/app/(app)/workspaces/[workspaceId]/automation/settings/actions"
import { Panel } from "@/components/automation/automation-ui"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

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

  const addBand = () => setAmountBands([...amountBands, { min: 0, max: null, minConfidence: 0.85 }])
  const removeBand = (i: number) => setAmountBands(amountBands.filter((_, idx) => idx !== i))
  const updateBand = (i: number, patch: Partial<typeof amountBands[number]>) =>
    setAmountBands(amountBands.map((b, idx) => (idx === i ? { ...b, ...patch } : b)))

  const submit = async () => {
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
        toast.success("Automation settings saved")
        router.refresh()
      }
    } finally {
      setPending(false)
    }
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
                  className="sr-only"
                />
                <span className={`text-sm font-semibold ${selected ? "text-emerald-900" : "text-slate-900"}`}>{option.name}</span>
                {selected && <span className="text-xs font-medium text-emerald-700">In force</span>}
              </span>
              <span className="mt-1 block text-[13px] leading-relaxed text-slate-600">{option.blurb}</span>
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
            <Label htmlFor="minConfidence" className="text-[13px]">Minimum confidence</Label>
            <Input
              id="minConfidence"
              type="number"
              min={0}
              max={1}
              step={0.01}
              value={minConfidence}
              onChange={(e) => setMinConfidence(Number(e.target.value))}
              className="mt-1.5 tabular-nums"
            />
            <p className="mt-1.5 text-xs text-slate-500">Between 0 and 1. Most workspaces settle near 0.90.</p>
          </div>
          <div>
            <Label htmlFor="qaSampleRate" className="text-[13px]">QA sample rate</Label>
            <Input
              id="qaSampleRate"
              type="number"
              min={0}
              max={1}
              step={0.01}
              value={qaSampleRate}
              onChange={(e) => setQaSampleRate(Number(e.target.value))}
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
          <label htmlFor="requirePolicyPass" className="flex cursor-pointer items-start gap-3 py-3 first:pt-0">
            <input
              id="requirePolicyPass"
              type="checkbox"
              checked={requirePolicyPass}
              onChange={(e) => setRequirePolicyPass(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-emerald-700"
            />
            <span>
              <span className="block text-sm text-slate-900">The policy check has to pass</span>
              <span className="block text-xs text-slate-500">A document the policy rejects, or that the check could not evaluate, goes to a person.</span>
            </span>
          </label>
          <label htmlFor="blockOnWarnChecks" className="flex cursor-pointer items-start gap-3 py-3">
            <input
              id="blockOnWarnChecks"
              type="checkbox"
              checked={blockOnWarnChecks}
              onChange={(e) => setBlockOnWarnChecks(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-emerald-700"
            />
            <span>
              <span className="block text-sm text-slate-900">Any warning stops it, not just a failure</span>
              <span className="block text-xs text-slate-500">Stricter: arithmetic and duplicate warnings hold the document back too.</span>
            </span>
          </label>
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
                <div key={i} className="grid grid-cols-1 items-end gap-3 rounded-md border border-[#e6ebf1] p-4 sm:grid-cols-[1fr_1fr_1fr_auto_auto]">
                  <div>
                    <Label className="text-xs text-slate-500">From</Label>
                    <Input type="number" min={0} step="0.01" value={band.min} onChange={(e) => updateBand(i, { min: Number(e.target.value) })} className="mt-1 tabular-nums" />
                  </div>
                  <div>
                    <Label className="text-xs text-slate-500">Up to</Label>
                    <Input type="number" min={0} step="0.01" value={band.max ?? ""} placeholder="No cap" onChange={(e) => updateBand(i, { max: e.target.value === "" ? null : Number(e.target.value) })} className="mt-1 tabular-nums" />
                  </div>
                  <div>
                    <Label className="text-xs text-slate-500">Confidence needed</Label>
                    <Input type="number" min={0} max={1} step={0.01} value={band.minConfidence} onChange={(e) => updateBand(i, { minConfidence: Number(e.target.value) })} className="mt-1 tabular-nums" />
                  </div>
                  <label className="flex items-center gap-2 pb-2.5 text-[13px] text-slate-700">
                    <input type="checkbox" checked={band.requireVerifiedSupplier ?? false} onChange={(e) => updateBand(i, { requireVerifiedSupplier: e.target.checked || undefined })} className="h-4 w-4 accent-emerald-700" />
                    <span>Trusted suppliers only</span>
                  </label>
                  <button type="button" onClick={() => removeBand(i)} className="pb-2.5 text-[13px] font-medium text-red-700 hover:underline">
                    Remove
                  </button>
                </div>
              ))}
              <button type="button" onClick={addBand} className="text-sm font-medium text-emerald-700 underline underline-offset-4 hover:text-emerald-800">
                Add a band
              </button>
            </div>}
      </Panel>
    </div>

    <div className="border-t border-[#e6ebf1] pt-5">
      <Button onClick={() => void submit()} disabled={pending}>{pending ? "Saving" : "Save changes"}</Button>
    </div>
  </div>
}
