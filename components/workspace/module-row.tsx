"use client"

import { disableModuleAction, enableModuleAction, requestModuleAction } from "@/app/(app)/workspaces/[workspaceId]/module-actions"
import { Button } from "@/components/ui/button"
import { useState, useTransition } from "react"
import { toast } from "sonner"

type Props = {
  workspaceId: string
  moduleKey: string
  name: string
  description: string
  /** "always" rows never render this component's controls (the catalog page filters them into
   * "Included" with no toggle at all) — this only ever renders for "default" or "optional". */
  kind: "default" | "optional"
  enabled: boolean
  owner: boolean
  activation: "enable" | "request"
  requestedBy: { name: string; email: string } | null
}

/** One row of the modules catalog. Owners see a working toggle (default: on/off; optional with
 * activation "enable": off/on). A member on an "optional"/"request" module they can't toggle gets
 * a Request button instead — optimistic, since the request itself grants nothing to roll back. */
export function ModuleRow({ workspaceId, moduleKey, name, description, kind, enabled, owner, activation, requestedBy }: Props) {
  const [checked, setChecked] = useState(enabled)
  const [requested, setRequested] = useState(Boolean(requestedBy) && !enabled)
  const [pending, startTransition] = useTransition()
  const [announce, setAnnounce] = useState("")

  const toggle = () => {
    if (!owner) return
    const next = !checked
    setChecked(next)
    startTransition(async () => {
      const result = next ? await enableModuleAction(workspaceId, moduleKey) : await disableModuleAction(workspaceId, moduleKey)
      if (!result.success) { setChecked(!next); setAnnounce(`Couldn't turn ${name} ${next ? "on" : "off"} — ${result.error || "the server didn't say why"}.`) }
      else setAnnounce(`${name} is ${next ? "on" : "off"}.`)
    })
  }

  const request = () => {
    setRequested(true)
    startTransition(async () => {
      const result = await requestModuleAction(workspaceId, moduleKey)
      if (!result.success) { setRequested(false); toast.error(result.error || "Could not send that request") }
      else toast.success("Request sent to the owner")
    })
  }

  return <div className="flex items-start justify-between gap-4 py-3 first:pt-0">
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <span className="font-medium text-slate-900">{name}</span>
        {kind === "optional" && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-700">Optional</span>}
        {requestedBy && !enabled && <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs text-indigo-800">Requested by {requestedBy.name}</span>}
      </div>
      <p className="max-w-[60ch] text-[13px] text-slate-600">{description}</p>
    </div>
    <div className="flex shrink-0 flex-col items-end gap-1">
      <span aria-live="polite" className={`text-xs ${announce.startsWith("Couldn't") ? "text-red-700" : "text-emerald-800"}`}>{announce}</span>
      {owner
        ? (kind === "default" || activation === "enable"
          ? <button type="button" role="switch" aria-checked={checked} aria-label={name} aria-busy={pending || undefined} disabled={pending} onClick={toggle}
              className={`min-w-[3.25rem] rounded-full px-2.5 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${checked ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-700/15" : "bg-slate-100 text-slate-700"}`}>
              {checked ? "On" : "Off"}
            </button>
          : <span className="text-xs text-slate-600">Request-only</span>)
        : (activation === "request"
          ? <Button size="sm" variant="outline" disabled={pending || requested} onClick={request}>{requested ? "Requested" : "Request"}</Button>
          : <span className="text-xs text-slate-600">{checked ? "On" : "Off"}</span>)}
    </div>
  </div>
}
