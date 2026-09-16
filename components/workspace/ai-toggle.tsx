"use client"

import { setWorkspaceAiAction } from "@/app/(app)/workspaces/[workspaceId]/actions"
import { SettingToggle } from "@/components/settings/setting-toggle"
import { useState } from "react"
import { toast } from "sonner"

/** #252: the AI-extraction switch on Admin › Configuration › Intake. Applies on change (one
 * switch, no form to save) through the shared SettingToggle so its consequence is a visible
 * sentence, not a tooltip. `readOnly` renders it disabled for a member. */
export function WorkspaceAiToggle({ workspaceId, enabled, readOnly = false }: { workspaceId: string; enabled: boolean; readOnly?: boolean }) {
  const [checked, setChecked] = useState(enabled)
  const [pending, setPending] = useState(false)

  const change = async (next: boolean) => {
    setChecked(next)
    setPending(true)
    try {
      const result = await setWorkspaceAiAction(workspaceId, next)
      if (!result.success) { setChecked(!next); toast.error(result.error || "Couldn't change the AI setting"); return }
      toast.success(next ? "AI extraction is on" : "AI extraction is off")
    } catch {
      setChecked(!next)
      toast.error("Couldn't reach the server — the AI setting was not changed")
    } finally { setPending(false) }
  }

  return <SettingToggle id="workspace-ai" label="Extract fields with AI"
    explanation="Off: documents are still received, stored and searchable, but nothing is extracted until it is turned back on."
    checked={checked} disabled={pending || readOnly} onChange={(next) => void change(next)} />
}
