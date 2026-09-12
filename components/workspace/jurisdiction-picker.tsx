"use client"

import { setJurisdictionAction } from "@/app/(app)/workspaces/[workspaceId]/jurisdiction-actions"
import type { JurisdictionCode } from "@/lib/jurisdictions"
import { useState } from "react"
import { toast } from "sonner"

export type JurisdictionOption = { code: JurisdictionCode; name: string; packVersion: string }

/** Two states, per #49:
 *  - No current pick: big "Choose a jurisdiction" primary CTA that expands into the picker.
 *  - Picked: read-only summary + "Change" affordance that re-opens the picker inline.
 * The picker only ever lists codes with a resolved pack file (server-side filtering, see
 * lib/jurisdictions/index.ts's listAvailableJurisdictions). */
export function JurisdictionPicker({ workspaceId, options, current }: {
  workspaceId: string
  options: JurisdictionOption[]
  current: { code: JurisdictionCode; packVersion: string | null } | null
}) {
  const [editing, setEditing] = useState(!current)
  const [selected, setSelected] = useState<JurisdictionCode | null>(current?.code ?? options[0]?.code ?? null)
  const [pending, setPending] = useState(false)

  const save = async () => {
    if (!selected) return
    setPending(true)
    try {
      const result = await setJurisdictionAction(workspaceId, selected)
      if (!result.success) { toast.error(result.error || "Could not change the jurisdiction"); return }
      toast.success(`Jurisdiction set to ${options.find((o) => o.code === selected)?.name || selected}`)
      setEditing(false)
    } catch {
      toast.error("Could not reach the server — the setting was not changed")
    } finally { setPending(false) }
  }

  if (current && !editing) {
    const currentOption = options.find((o) => o.code === current.code)
    return <div className="flex flex-wrap items-start justify-between gap-4 rounded border p-4">
      <div className="space-y-1 text-sm">
        <p><span className="font-medium">Jurisdiction:</span> {currentOption?.name ?? current.code} <span className="text-muted-foreground">({current.code})</span></p>
        {current.packVersion && <p className="text-muted-foreground">Pack version: <code className="rounded bg-slate-100 px-1.5 py-0.5">{current.packVersion}</code></p>}
      </div>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
      >
        Change
      </button>
    </div>
  }

  if (!current && !editing) {
    // Reachable only after a Change is cancelled with no prior pick — never on first render.
    return <button type="button" onClick={() => setEditing(true)} className="rounded-md bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800">
      Choose a jurisdiction
    </button>
  }

  return <div className="space-y-3">
    {!current && <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      <p className="font-medium">Jurisdiction required</p>
      <p>AP inbound (email-in, upload, API) is refused for this workspace until a jurisdiction is picked.</p>
    </div>}
    <div className="flex flex-wrap items-center gap-3">
      <select
        aria-label="Jurisdiction"
        className="rounded-md border px-3 py-2 text-sm"
        value={selected ?? ""}
        disabled={pending || options.length === 0}
        onChange={(event) => setSelected(event.target.value as JurisdictionCode)}
      >
        {options.map((option) => <option key={option.code} value={option.code}>{option.name} ({option.code})</option>)}
      </select>
      <button
        type="button"
        disabled={pending || !selected || selected === current?.code}
        onClick={() => void save()}
        className="rounded-md bg-emerald-700 px-3.5 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
      >
        Save
      </button>
      {current && <button type="button" onClick={() => { setEditing(false); setSelected(current.code) }} className="text-sm text-muted-foreground hover:underline">
        Cancel
      </button>}
    </div>
    {options.length === 0 && <p className="text-sm text-muted-foreground">No jurisdiction packs are registered yet. Ship a pack under <code>lib/jurisdictions/&lt;code&gt;/</code> to unlock this picker.</p>}
  </div>
}
