"use client"

import { changeWorkspaceMemberRoleAction, leaveWorkspaceAction, removeWorkspaceMemberAction, transferWorkspaceOwnershipAction } from "@/app/(app)/workspaces/[workspaceId]/workspace-actions"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { NativeSelect } from "@/components/ui/native-select"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

export type WorkspaceMemberRow = { userId: string; name: string; email: string; role: string }

// One shape per confirmable intent. `role` carries the intended `nextRole` because the select
// snaps back while the confirm is open; the rest are self-describing. Every mutation also
// accepts an `awaitedLastReviewer` retry flag — set by the retry path after the model surfaces
// `last_reviewer_removal_requires_confirmation`.
type Intent =
  | { kind: "remove"; member: WorkspaceMemberRow }
  | { kind: "transfer"; member: WorkspaceMemberRow }
  | { kind: "leave"; member: WorkspaceMemberRow }
  | { kind: "role"; member: WorkspaceMemberRow; nextRole: string }

const Avatar = ({ label }: { label: string }) => (
  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
    {label.trim().charAt(0).toUpperCase() || "?"}
  </span>
)

// #231 Q26 (#252): every pill ≥ 4.5:1 — the incumbent "Owner" pill measured 4.3:1 on the in-page detector.
const roleTagClass = (role: string) => role === "owner" ? "bg-emerald-50 text-emerald-900" : role === "reviewer" ? "bg-indigo-50 text-indigo-900" : "bg-slate-100 text-slate-700"
const RoleTag = ({ role }: { role: string }) => (
  <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium capitalize ${roleTagClass(role)}`}>{role}</span>
)

/** Built from <ul>/flex rather than a table primitive: the design system has no table, select or
 * dropdown-menu component, and the only Radix packages installed are label, popover and slot. */
export function MembersTable({ workspaceId, workspaceKind, members, viewerId, viewerRole }: {
  workspaceId: string
  workspaceKind: string
  members: WorkspaceMemberRow[]
  viewerId: string
  viewerRole: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [confirm, setConfirm] = useState<Intent | null>(null)
  // Confirmation flag on the reviewer-mode-flip retry: null on the first attempt, an Intent when
  // the last-reviewer warning is being shown. Kept separate from `confirm` so the two dialog
  // contents don't have to share state, and so cancel resets naturally on either path.
  const [lastReviewer, setLastReviewer] = useState<Intent | null>(null)
  const owner = viewerRole === "owner"
  const owners = members.filter((member) => member.role === "owner").length
  const reviewers = members.filter((member) => member.role === "reviewer").length

  const invoke = async (intent: Intent, opts: { confirmLastReviewerRemoval?: boolean }) => {
    if (intent.kind === "remove") return removeWorkspaceMemberAction(workspaceId, intent.member.userId, opts)
    if (intent.kind === "transfer") return transferWorkspaceOwnershipAction(workspaceId, intent.member.userId, opts)
    if (intent.kind === "leave") return leaveWorkspaceAction(workspaceId, opts)
    return changeWorkspaceMemberRoleAction(workspaceId, intent.member.userId, intent.nextRole, opts)
  }

  const successCopy = (intent: Intent) => {
    if (intent.kind === "remove") return "Member removed"
    if (intent.kind === "transfer") return "Ownership transferred"
    if (intent.kind === "leave") return "You left the workspace"
    return "Role updated"
  }

  const run = (intent: Intent, opts: { confirmLastReviewerRemoval?: boolean }, onDone?: () => void) => startTransition(async () => {
    const result = await invoke(intent, opts)
    if (!result.success) {
      // The model uses a marker string so the client can turn a plain error into the two-step
      // confirm. Anything else — permission denied, last owner, etc. — is a real toast.
      if (result.error === "last_reviewer_removal_requires_confirmation") {
        setConfirm(null)
        setLastReviewer(intent)
        return
      }
      toast.error(result.error ? `Couldn't do that — ${result.error}` : "Couldn't do that — the server didn't say why. Nothing changed.")
      return
    }
    toast.success(successCopy(intent))
    setConfirm(null)
    setLastReviewer(null)
    if (onDone) onDone(); else router.refresh()
  })

  // Leaving removes the membership this page is rendered behind, so the segment layout would
  // redirect and (chrome)/layout.tsx would throw mid-transition. A hard navigation instead.
  const commitLeave = (member: WorkspaceMemberRow, opts: { confirmLastReviewerRemoval?: boolean }) =>
    run({ kind: "leave", member }, opts, () => { window.location.href = "/workspaces" })

  const confirmProps = confirm?.kind === "remove"
    ? { title: `Remove ${confirm.member.name || confirm.member.email}?`, description: "They lose access to every file in this workspace, including files shared with them by email.", confirmLabel: "Remove", onConfirm: () => run(confirm, {}) }
    : confirm?.kind === "transfer"
      ? { title: `Make ${confirm.member.name || confirm.member.email} the owner?`, description: "They gain full control of this workspace, including billing. You become a regular member.", confirmLabel: "Transfer ownership", onConfirm: () => run(confirm, {}) }
      : confirm?.kind === "leave"
        ? { title: "Leave this workspace?", description: "You lose access to its files. An owner would have to invite you back.", confirmLabel: "Leave", onConfirm: () => commitLeave(confirm.member, {}) }
        : { title: "", description: "", confirmLabel: "", onConfirm: () => {} }

  // The last-reviewer dialog is a second, distinct confirm — it fires either from a direct
  // reviewer→member/owner role change (invoked without going through `confirm` at all) or from
  // the model round-tripping one of the other intents back with the confirmation marker.
  const lastReviewerConfirmProps = lastReviewer ? (() => {
    const opts = { confirmLastReviewerRemoval: true }
    const description = "This workspace will drop to SMB mode. Bills over the ceiling will re-gate for owner sign-off, and the workpaper frame will name the missing reviewer."
    if (lastReviewer.kind === "leave") return { title: "You are the last reviewer. Leave anyway?", description, confirmLabel: "Leave", onConfirm: () => commitLeave(lastReviewer.member, opts) }
    if (lastReviewer.kind === "remove") return { title: `Remove ${lastReviewer.member.name || lastReviewer.member.email} — the last reviewer?`, description, confirmLabel: "Remove", onConfirm: () => run(lastReviewer, opts) }
    if (lastReviewer.kind === "transfer") return { title: `Promote ${lastReviewer.member.name || lastReviewer.member.email} — the last reviewer — to owner?`, description, confirmLabel: "Transfer ownership", onConfirm: () => run(lastReviewer, opts) }
    return { title: `Change ${lastReviewer.member.name || lastReviewer.member.email}'s role from reviewer?`, description, confirmLabel: "Change role", onConfirm: () => run(lastReviewer, opts) }
  })() : { title: "", description: "", confirmLabel: "", onConfirm: () => {} }

  const onRoleSelect = (member: WorkspaceMemberRow, nextRole: string) => {
    // Client-side pre-check: dropping the last reviewer surfaces the warning up front rather
    // than round-tripping first. The model still enforces this — this branch is convenience.
    if (member.role === "reviewer" && nextRole !== "reviewer" && reviewers <= 1) {
      setLastReviewer({ kind: "role", member, nextRole })
      return
    }
    run({ kind: "role", member, nextRole }, {})
  }

  return <>
    <ul className="divide-y divide-hairline-soft">
      {members.map((member) => {
        const self = member.userId === viewerId
        // The sole owner may not be demoted — the model refuses it, so do not offer it either.
        const lockedRole = !owner || (member.role === "owner" && owners <= 1)
        return <li key={member.userId} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 text-sm first:pt-0">
          <Avatar label={member.name || member.email} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium text-foreground">{member.name || member.email}{self && <span className="ml-1.5 text-xs font-normal text-slate-600">you</span>}</span>
            {member.name && <span className="block truncate text-xs text-slate-600">{member.email}</span>}
          </span>

          {lockedRole
            ? <RoleTag role={member.role} />
            : <NativeSelect aria-label={`Role for ${member.email}`} className="h-8 capitalize" value={member.role} disabled={pending}
                onChange={(event) => onRoleSelect(member, event.target.value)}>
                <option value="owner">Owner</option>
                <option value="reviewer">Reviewer</option>
                <option value="member">Member</option>
              </NativeSelect>}

          {self
            // leaveWorkspace refuses a personal workspace outright, so do not offer a button
            // whose only outcome is an error toast.
            ? workspaceKind !== "personal" && <Button type="button" variant="ghost" size="sm" className="text-slate-600 hover:text-destructive" disabled={pending} onClick={() => setConfirm({ kind: "leave", member })}>Leave</Button>
            : owner && <span className="flex gap-1">
                {member.role !== "owner" && <Button type="button" variant="ghost" size="sm" className="text-slate-600 hover:text-foreground" disabled={pending} onClick={() => setConfirm({ kind: "transfer", member })}>Make owner</Button>}
                <Button type="button" variant="ghost" size="sm" className="text-slate-600 hover:text-destructive" disabled={pending} onClick={() => setConfirm({ kind: "remove", member })}>Remove</Button>
              </span>}
        </li>
      })}
    </ul>

    <ConfirmDialog open={Boolean(confirm)} destructive busy={pending} onCancel={() => setConfirm(null)} {...confirmProps} />
    <ConfirmDialog open={Boolean(lastReviewer)} destructive busy={pending} onCancel={() => setLastReviewer(null)} {...lastReviewerConfirmProps} />
  </>
}
