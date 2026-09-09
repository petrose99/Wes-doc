"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { updateAutomationConfigAction } from "@/app/(app)/workspaces/[workspaceId]/(chrome)/settings/automation/actions"
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

const LEVEL_DESCRIPTIONS: Record<Level, string> = {
  suggest: "Every document waits for a reviewer to click Approve.",
  auto: "Documents are auto-coded; a reviewer confirms with one click.",
  touchless: "High-confidence documents publish themselves without a click.",
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

  return <div className="space-y-6">
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Autonomy level</legend>
      <div className="grid gap-2">
        {(["suggest", "auto", "touchless"] as const).map((option) => (
          <label key={option} className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-slate-50">
            <input
              type="radio"
              name="level"
              value={option}
              checked={level === option}
              onChange={() => setLevel(option)}
              className="mt-1"
            />
            <div>
              <div className="font-medium capitalize">{option === "auto" ? "Auto with approval" : option}</div>
              <div className="text-sm text-slate-500">{LEVEL_DESCRIPTIONS[option]}</div>
            </div>
          </label>
        ))}
      </div>
    </fieldset>

    <div className={`space-y-4 ${level === "touchless" ? "" : "opacity-60"}`}>
      <p className="text-xs text-slate-500">Advanced settings — only apply when the workspace is at <strong>Touchless</strong>.</p>

      <div>
        <Label htmlFor="minConfidence">Minimum confidence to publish (0–1)</Label>
        <Input
          id="minConfidence"
          type="number"
          min={0}
          max={1}
          step={0.01}
          value={minConfidence}
          onChange={(e) => setMinConfidence(Number(e.target.value))}
        />
      </div>

      <div>
        <Label htmlFor="qaSampleRate">QA sample rate (0–1)</Label>
        <Input
          id="qaSampleRate"
          type="number"
          min={0}
          max={1}
          step={0.01}
          value={qaSampleRate}
          onChange={(e) => setQaSampleRate(Number(e.target.value))}
        />
        <p className="mt-1 text-xs text-slate-500">Fraction of touchless-eligible documents routed to a non-blocking QA review.</p>
      </div>

      <div className="flex items-center gap-2">
        <input
          id="requirePolicyPass"
          type="checkbox"
          checked={requirePolicyPass}
          onChange={(e) => setRequirePolicyPass(e.target.checked)}
        />
        <Label htmlFor="requirePolicyPass" className="!m-0">Require policy check to pass before publish</Label>
      </div>

      <div className="flex items-center gap-2">
        <input
          id="blockOnWarnChecks"
          type="checkbox"
          checked={blockOnWarnChecks}
          onChange={(e) => setBlockOnWarnChecks(e.target.checked)}
        />
        <Label htmlFor="blockOnWarnChecks" className="!m-0">Block on any warn-level check</Label>
      </div>

      <div>
        <Label htmlFor="policyText">Policy text (optional)</Label>
        <Textarea
          id="policyText"
          rows={4}
          value={policyText}
          onChange={(e) => setPolicyText(e.target.value)}
          placeholder="e.g. Expenses over $1000 need a receipt attached."
        />
      </div>
    </div>

    <div>
      <Button onClick={() => void submit()} disabled={pending}>{pending ? "Saving..." : "Save"}</Button>
    </div>
  </div>
}
