"use client"

import { deleteWorkspaceAction, leaveWorkspaceAction } from "@/app/(app)/workspaces/[workspaceId]/workspace-actions"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Dialog } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useState, useTransition } from "react"
import { toast } from "sonner"

/** #285 spec §5.3/§4.6: the current company's card-less danger zone in the pane — the same two
 * ways out as `WorkspaceDangerZone` (Delete for an owner, Leave for everyone except the last
 * owner), refactored to sit under a company's summary instead of on its own settings page. Both
 * keep `WorkspaceDangerZone`'s hard navigation on success: the membership this pane is rendered
 * behind is gone the moment either action succeeds, so a soft transition would race the layout's
 * own redirect. The success toast rides the `?notice=…&name=…` query through that navigation
 * (`components/shell/notice-toast.tsx`) rather than firing before it, since a `toast.success`
 * called immediately before `window.location.href` never survives the full page reload. Delete's
 * server-side last-owner refusal ("delete_workspace_instead") and Leave's last-owner/last-reviewer
 * refusals are surfaced as plain server text, same as that component. */
const escapeToWorkspaceList = (notice: "deleted" | "left", name: string) => {
  window.location.href = `/workspaces?notice=${notice}&name=${encodeURIComponent(name)}`
}

export function CompanyDangerActions({ workspaceId, name, isOwner }: { workspaceId: string; name: string; isOwner: boolean }) {
  const [pending, startTransition] = useTransition()
  const [deleting, setDeleting] = useState(false)
  const [confirmName, setConfirmName] = useState("")
  const [leaving, setLeaving] = useState(false)
  const [confirmingLastReviewer, setConfirmingLastReviewer] = useState(false)

  const leave = (confirmLastReviewerRemoval?: boolean) => startTransition(async () => {
    const result = await leaveWorkspaceAction(workspaceId, confirmLastReviewerRemoval ? { confirmLastReviewerRemoval: true } : undefined)
    if (!result.success && result.error === "last_reviewer_removal_requires_confirmation") {
      setLeaving(false)
      setConfirmingLastReviewer(true)
      return
    }
    if (!result.success) { toast.error(result.error ? `Nothing was removed — ${result.error}` : "Nothing was removed — try again."); return }
    escapeToWorkspaceList("left", name)
  })

  return <div className="border-t border-slate-200 px-5 py-4">
    <h2 className="text-sm font-semibold text-slate-900">Danger zone</h2>

    {isOwner && <div className="mt-3 space-y-2">
      <p className="max-w-[60ch] text-sm leading-relaxed text-slate-600">Delete {name} — removes the company and everything in it for every member.</p>
      <Button type="button" variant="outline" className="border-red-300 text-red-700 hover:bg-red-50" disabled={pending} onClick={() => { setConfirmName(""); setDeleting(true) }}>Delete company…</Button>
    </div>}

    <div className="mt-3 space-y-2">
      <p className="max-w-[60ch] text-sm leading-relaxed text-slate-600">Leave {name} — you lose access; nothing is deleted and an owner can invite you again.</p>
      <Button type="button" variant="outline" className="border-red-300 text-red-700 hover:bg-red-50" disabled={pending} onClick={() => setLeaving(true)}>Leave company…</Button>
    </div>

    <ConfirmDialog open={leaving} destructive busy={pending} title={`Leave ${name}?`} description="You lose access to its files immediately." confirmLabel="Leave"
      onCancel={() => setLeaving(false)}
      onConfirm={() => leave()} />
    <ConfirmDialog open={confirmingLastReviewer} destructive busy={pending} title="You are the last reviewer" description="Leaving drops this company to SMB mode. This cannot be undone from here." confirmLabel="Leave anyway"
      onCancel={() => setConfirmingLastReviewer(false)}
      onConfirm={() => leave(true)} />

    {/* ConfirmDialog cannot collect text, and this is the one confirmation worth making the
        user type out — same as WorkspaceDangerZone's Delete. */}
    <Dialog open={deleting} title={`Delete company ${name}?`} description={`Type “${name}” to confirm. Every document and uploaded file is deleted permanently.`} onClose={() => setDeleting(false)} initialFocus="#confirm-company-name">
      <form className="space-y-3 px-5 py-4" onSubmit={(event) => {
        event.preventDefault()
        startTransition(async () => {
          const result = await deleteWorkspaceAction(workspaceId)
          if (!result.success) { toast.error(result.error ? `Nothing was removed — ${result.error}` : "Nothing was removed — try again."); return }
          escapeToWorkspaceList("deleted", name)
        })
      }}>
        <Label htmlFor="confirm-company-name">Company name</Label>
        <Input id="confirm-company-name" value={confirmName} onChange={(event) => setConfirmName(event.target.value)} autoComplete="off" />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setDeleting(false)}>Cancel</Button>
          <Button type="submit" variant="destructive" disabled={pending || confirmName.trim() !== name}>{pending ? "Deleting…" : "Delete company"}</Button>
        </div>
      </form>
    </Dialog>
  </div>
}
