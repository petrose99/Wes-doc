"use client"

import { useEffect, useId, useState } from "react"
import { NativeSelect } from "@/components/ui/native-select"
import { useOnlineStatus } from "@/lib/client/use-online-status"
import { getRailWidthAction, setRailWidthAction } from "@/app/(app)/workspaces/[workspaceId]/actions"
import { type RailWidth, isRailWidth, toRailWidth, RAIL_WIDTH_LABEL } from "@/lib/rail-width"

/** #342 spec §4 — the three-state rail-width control (icons only / full labels / auto),
 * replacing the old localStorage pin. Two homes, like Approval emails: the Account page field
 * (`RailWidthControl`, full state machine) and a compact inline select in the account-menu
 * (`RailWidthMenuSelect`) — no dialog, a select has no destructive consequence to confirm.
 * `RailWidth`/`isRailWidth`/`toRailWidth` moved to lib/rail-width.ts — see that file's comment. */

export { type RailWidth, isRailWidth, toRailWidth, RAIL_WIDTH_LABEL } from "@/lib/rail-width"
export const RAIL_WIDTH_SAVE_ERROR = "Couldn't save this. Check your connection and try again."

function useRailWidthSave(workspaceId: string, initial: RailWidth, onSaved?: (value: RailWidth) => void) {
  const [value, setValue] = useState<RailWidth>(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const online = useOnlineStatus()
  useEffect(() => { setValue(initial) }, [initial])

  const change = async (next: RailWidth) => {
    if (saving) return
    const previous = value
    setValue(next)
    setError(null)
    setSaving(true)
    try {
      const result = await setRailWidthAction(workspaceId, next)
      if (!result.success || !result.data) throw new Error(result.error || "save_failed")
      setValue(result.data.railWidth)
      onSaved?.(result.data.railWidth)
    } catch {
      setValue(previous)
      setError(RAIL_WIDTH_SAVE_ERROR)
    } finally {
      setSaving(false)
    }
  }

  return { value, saving, error, online, change }
}

/** Account page field, mirroring `ApprovalEmailsControl`'s state machine exactly. */
export function RailWidthControl({ workspaceId, initial, onSaved, selectId = "rail-width-select-panel" }: {
  workspaceId: string
  initial: RailWidth
  onSaved?: (value: RailWidth) => void
  selectId?: string
}) {
  const { value, saving, error, online, change } = useRailWidthSave(workspaceId, initial, onSaved)
  const statusId = useId()

  return <div>
    <div className="flex min-h-11 items-center justify-between gap-4">
      <label htmlFor={selectId} className="text-sm font-medium text-slate-800">Rail width</label>
      <NativeSelect id={selectId} className="w-40" value={value} disabled={!online || saving}
        aria-describedby={statusId} onChange={(event) => { if (isRailWidth(event.target.value)) void change(event.target.value) }}>
        <option value="auto">Auto</option>
        <option value="icons">Icons only</option>
        <option value="labels">Full labels</option>
      </NativeSelect>
    </div>
    <p id={statusId} role="status" aria-live="polite" className="mt-1 min-h-5 text-[13px] text-slate-500">
      {saving ? "Saving…" : !online ? "You're offline — the change can't be saved yet" : ""}
    </p>
    {error && <p role="alert" className="text-[13px] text-red-700">{error}</p>}
  </div>
}

/** Compact inline select for the account-menu — no dialog, and no arrow-key hijack from the
 * menu's own keydown listener (that listener skips a focused `select`, per its own doc). */
export function RailWidthMenuSelect({ workspaceId, initial, onSaved, selectId = "rail-width-select" }: {
  workspaceId: string
  initial: RailWidth
  onSaved?: (value: RailWidth) => void
  selectId?: string
}) {
  const { value, saving, change } = useRailWidthSave(workspaceId, initial, onSaved)

  // Not role="menuitem": that role forbids a nested interactive widget (ARIA APG), and the
  // select needs its own native Tab/Arrow-key behavior rather than the menu's roving-item one.
  // Account-menu's keydown listener explicitly skips a focused select for the same reason.
  return <div className="flex w-full items-center justify-between gap-2 px-3 py-2 text-sm text-slate-700">
    <label htmlFor={selectId} className="flex-1">Rail width</label>
    <NativeSelect id={selectId} className="h-8 w-32" value={value} disabled={saving}
      onChange={(event) => { if (isRailWidth(event.target.value)) void change(event.target.value) }}>
      <option value="auto">Auto</option>
      <option value="icons">Icons only</option>
      <option value="labels">Full labels</option>
    </NativeSelect>
  </div>
}
