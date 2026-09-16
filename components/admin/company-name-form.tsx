"use client"

import { renameWorkspaceAction } from "@/app/(app)/workspaces/[workspaceId]/workspace-actions"
import { AdminSaveBar } from "@/components/admin/admin-save-bar"
import { Panel } from "@/components/automation/automation-ui"
import { Input } from "@/components/ui/input"
import { useRouter } from "next/navigation"
import { useCallback, useId, useState, useTransition } from "react"

/** #252 (evaluate H4): the company's name is a setting like any other in Admin, so it saves
 * from the one sticky bar — not its own inline Save. Lives on Companies, beside Delete, because
 * it is a fact about the company, not about its people (evaluate H8). */
export function CompanyNameForm({ workspaceId, workspaceName, noun }: { workspaceId: string; workspaceName: string; noun: "company" | "workspace" }) {
  const router = useRouter()
  const id = useId()
  const [pending, startTransition] = useTransition()
  const [name, setName] = useState(workspaceName)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const dirty = name.trim() !== workspaceName
  const blocker = dirty && name.trim().length < 2 ? "A name needs at least two characters." : null

  const save = useCallback(() => {
    if (!dirty || blocker) return
    setError(null)
    startTransition(async () => {
      const result = await renameWorkspaceAction(workspaceId, name.trim())
      if (!result.success) { setError(result.error ? `Couldn't rename — ${result.error} Your change is still here.` : "Couldn't rename — the server didn't say why. Your change is still here."); return }
      setSavedAt(Date.now())
      router.refresh()
    })
  }, [dirty, blocker, name, workspaceId, router])

  return <>
    <Panel title={noun === "company" ? "Company name" : "Workspace name"} note="Shown in the sidebar switcher, in the Admin nav and on every invitation.">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id} className="text-xs font-medium text-slate-600">Name</label>
        <Input id={id} value={name} onChange={(event) => setName(event.target.value)} className="max-w-xs" minLength={2} maxLength={80} required disabled={pending} />
      </div>
    </Panel>
    <AdminSaveBar dirty={dirty} pending={pending} error={error} savedAt={savedAt} blocker={blocker} onSave={save} onDiscard={() => { setName(workspaceName); setError(null) }} onSavedShown={() => setSavedAt(null)} />
  </>
}
