"use client"

import { assertInstitutionAction } from "@/app/(app)/workspaces/[workspaceId]/actions"
import { Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

/** #217: the bank-statement sibling of the document-type control just above it in the Details
 * tab (split-pane.tsx) — same compact-when-confirmed / prominent-when-not shape as that control,
 * same "user asserts, assertion is authoritative" rule (#178), no AI classification. A statement
 * has nothing for the layout-drift check (#207) to compare against until this is asserted — see
 * StatementDriftBanner's "not applicable" state just below this pane. */
export function InstitutionAssert({ workspaceId, documentId, institutions, institutionId, institutionName }: {
  workspaceId: string
  documentId: string
  institutions: Array<{ id: string; name: string }>
  institutionId: string | null
  institutionName: string | null
}) {
  const router = useRouter()
  const [changing, setChanging] = useState(!institutionId)
  const [mode, setMode] = useState<"pick" | "new">(institutions.length > 0 ? "pick" : "new")
  const [selected, setSelected] = useState("")
  const [newName, setNewName] = useState("")
  const [saving, setSaving] = useState(false)

  const assert = async () => {
    if (mode === "new" && !newName.trim()) { toast.error("Name the institution first"); return }
    if (mode === "pick" && !selected) { toast.error("Choose an institution first"); return }
    setSaving(true)
    try {
      const result = await assertInstitutionAction(workspaceId, documentId, mode === "new" ? { newInstitutionName: newName } : { institutionId: selected })
      if (!result.success) { toast.error(result.error || "Could not save the institution"); return }
      toast.success("Institution saved")
      setChanging(false)
      setNewName("")
      router.refresh()
    } catch {
      toast.error("Could not reach the server")
    } finally {
      setSaving(false)
    }
  }

  if (institutionId && !changing) {
    return <div className="flex items-center gap-2 text-sm">
      <span className="text-xs text-slate-500">Institution:</span>
      <span className="font-medium text-slate-800">{institutionName ?? "—"}</span>
      <button type="button" onClick={() => setChanging(true)} className="text-xs text-slate-400 hover:text-slate-600">Change</button>
    </div>
  }

  return <div>
    <p className="mb-1.5 text-sm font-medium text-slate-800">Which institution is this statement from?</p>
    <p className="mb-1.5 text-xs text-slate-500">Needed once per institution — later statements get checked against this one&apos;s saved layout.</p>
    <div className="flex flex-wrap items-center gap-1.5">
      {mode === "pick" ? (
        <select value={selected} onChange={(event) => setSelected(event.target.value)}
          className="h-8 rounded border border-slate-200 bg-white px-2 text-sm text-slate-700 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100">
          <option value="">Select institution&hellip;</option>
          {institutions.map((institution) => <option key={institution.id} value={institution.id}>{institution.name}</option>)}
        </select>
      ) : (
        <input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Institution name" maxLength={120}
          className="h-8 rounded border border-slate-200 bg-white px-2 text-sm text-slate-700 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100" />
      )}
      <button type="button" disabled={saving} onClick={() => void assert()}
        className="inline-flex items-center gap-1.5 rounded border border-emerald-300 bg-white px-2.5 py-1 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-50 disabled:pointer-events-none disabled:opacity-40">
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Save
      </button>
      {institutions.length > 0 && <button type="button" onClick={() => setMode(mode === "new" ? "pick" : "new")} className="text-xs text-slate-400 hover:text-slate-600">
        {mode === "new" ? "Choose existing instead" : "+ New institution"}
      </button>}
      {institutionId && <button type="button" onClick={() => setChanging(false)} className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>}
    </div>
  </div>
}
