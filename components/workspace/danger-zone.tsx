"use client"

import { deleteWorkspaceAction, leaveWorkspaceAction } from "@/app/(app)/workspaces/[workspaceId]/workspace-actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/admin/panel-card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Dialog } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { TriangleAlert } from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

/** #252: the rename moved to CompanyNameForm (one save grammar); this file is the two ways out —
 * Delete for an owner, Leave for everyone else — both behind an accessible confirmation.
 *
 * Both destructive paths end in a hard navigation rather than router.push: the membership this
 * whole segment is rendered behind has just gone, so the layout's redirect and (chrome)'s
 * requireWorkspaceRole throw would race a soft transition. Same reasoning as the sign-out. */
const escapeToWorkspaceList = () => { window.location.href = "/workspaces" }

export function WorkspaceDangerZone({ workspaceId, workspaceName, workspaceKind, viewerRole }: {
  workspaceId: string
  workspaceName: string
  workspaceKind: string
  viewerRole: string
}) {
  const [pending, startTransition] = useTransition()
  // #231 Q8: "Company" in Admin; a personal workspace is the one thing that is not a company.
  const noun = workspaceKind === "personal" ? "workspace" : "company"
  const [deleting, setDeleting] = useState(false)
  const [confirmName, setConfirmName] = useState("")
  const [leaving, setLeaving] = useState(false)
  const [confirmingLastReviewer, setConfirmingLastReviewer] = useState(false)
  const owner = viewerRole === "owner"

  const leave = (confirmLastReviewerRemoval?: boolean) => startTransition(async () => {
    const result = await leaveWorkspaceAction(workspaceId, confirmLastReviewerRemoval ? { confirmLastReviewerRemoval: true } : undefined)
    if (!result.success && result.error === "last_reviewer_removal_requires_confirmation") {
      // Two-phase: the first attempt without the flag lets a firm-mode workspace surface the
      // SMB-mode warning before the last reviewer actually walks (decision #41), via its own
      // accessible confirmation rather than a native window.confirm.
      setLeaving(false)
      setConfirmingLastReviewer(true)
      return
    }
    if (!result.success) { toast.error(result.error ? `Couldn't leave — ${result.error} Nothing changed.` : "Couldn't leave — the server didn't say why. Nothing changed."); return }
    escapeToWorkspaceList()
  })

  if (!owner) {
    return <Card>
      <CardHeader>
        <CardTitle>Leave this {noun}</CardTitle>
        <CardDescription>You lose access to every file in {workspaceName}. An owner would have to invite you back.</CardDescription>
      </CardHeader>
      <CardContent>
        <Button type="button" variant="destructive" disabled={pending || workspaceKind === "personal"} onClick={() => setLeaving(true)}>Leave this {noun}</Button>
        {workspaceKind === "personal" && <p className="mt-2 text-sm text-slate-600">A personal workspace cannot be left.</p>}
        <ConfirmDialog open={leaving} destructive busy={pending} title={`Leave this ${noun}?`} description="You lose access to its files immediately." confirmLabel="Leave"
          onCancel={() => setLeaving(false)}
          onConfirm={() => leave()} />
        <ConfirmDialog open={confirmingLastReviewer} destructive busy={pending} title="You are the last reviewer" description="Leaving drops this workspace to SMB mode. This cannot be undone from here." confirmLabel="Leave anyway"
          onCancel={() => setConfirmingLastReviewer(false)}
          onConfirm={() => leave(true)} />
      </CardContent>
    </Card>
  }

  return <div className="space-y-6">
    <Card>
      <CardHeader className="border-red-200">
        <CardTitle className="flex items-center gap-2 text-red-800"><TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />Delete this {noun}</CardTitle>
        <CardDescription>Permanently deletes every file, document, uploaded source and extraction sheet in {workspaceName}. This cannot be undone.</CardDescription>
      </CardHeader>
      <CardContent>
        <Button type="button" variant="destructive" disabled={pending} onClick={() => { setConfirmName(""); setDeleting(true) }}>Delete this {noun}</Button>
      </CardContent>
    </Card>

    {/* ConfirmDialog cannot collect text, and this is the one confirmation worth making the
        user type out — so it uses the plain Dialog with its own confirm field. */}
    <Dialog open={deleting} title={`Delete this ${noun}?`} description={`Type “${workspaceName}” to confirm. Every document and uploaded file is deleted permanently.`} onClose={() => setDeleting(false)}>
      <form className="space-y-3 px-5 py-4" onSubmit={(event) => {
        event.preventDefault()
        startTransition(async () => {
          const result = await deleteWorkspaceAction(workspaceId)
          if (!result.success) { toast.error(result.error ? `Couldn't delete — ${result.error} Nothing changed.` : "Couldn't delete — the server didn't say why. Nothing changed."); return }
          escapeToWorkspaceList()
        })
      }}>
        <Label htmlFor="confirm-workspace-name">Workspace name</Label>
        <Input id="confirm-workspace-name" value={confirmName} onChange={(event) => setConfirmName(event.target.value)} autoComplete="off" />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setDeleting(false)}>Cancel</Button>
          <Button type="submit" variant="destructive" disabled={pending || confirmName.trim() !== workspaceName}>{pending ? "Deleting…" : "Delete permanently"}</Button>
        </div>
      </form>
    </Dialog>
  </div>
}
