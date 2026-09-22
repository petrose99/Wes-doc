// Deliberately NOT a "use server" module, matching models/approval-workflows.ts: trusts the
// workspaceId it is handed. The server action does the auth + owner gate first.
import { auditEventData, getRequestAuditContext } from "@/lib/audit"
import { prisma } from "@/lib/db"
import { cache } from "react"

export type MismatchApprover = { id: string; name: string; email: string }

/** #253 (#227 decision 4): who may override a blocked `match-variance` gate.
 *
 * An empty list is a policy, not a blank: it means "the current stage's approver", which is the
 * any-member rule the override path already applied before this setting existed. That is why this
 * returns `[]` rather than null — a caller must not be able to confuse "nobody" with "not set".
 *
 * Members who have since left the workspace are filtered out here rather than at write time: a
 * stale id in the column would otherwise silently name a person who can no longer act, and the
 * settings page would list an id it cannot render a name for. */
export const listMismatchApprovers = cache(async (workspaceId: string): Promise<MismatchApprover[]> => {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { poMismatchApproverIds: true },
  })
  const ids = workspace?.poMismatchApproverIds ?? []
  if (!ids.length) return []
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId, userId: { in: ids } },
    select: { user: { select: { id: true, name: true, email: true } } },
  })
  const byId = new Map(members.map((member) => [member.user.id, member.user]))
  // Preserve the stored order so the list does not reshuffle between renders.
  return ids
    .map((id) => byId.get(id))
    .filter((user): user is NonNullable<typeof user> => Boolean(user))
    .map((user) => ({ id: user.id, name: user.name ?? "", email: user.email ?? "" }))
})

/** Replaces the named-approver list. Passing `[]` restores the in-force default. Every id must be
 * a current member of this workspace — naming someone who cannot open the workspace would produce
 * a gate nobody can override, which is a lock with no key. */
export async function setMismatchApprovers(input: {
  workspaceId: string
  userIds: string[]
  actorId: string
}) {
  const unique = [...new Set(input.userIds)]
  if (unique.length) {
    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId: input.workspaceId, userId: { in: unique } },
      select: { userId: true },
    })
    if (members.length !== unique.length) throw new Error("mismatch_approver_not_a_member")
  }
  const context = await getRequestAuditContext()
  const [updated] = await prisma.$transaction([
    prisma.workspace.update({
      where: { id: input.workspaceId },
      data: { poMismatchApproverIds: unique },
    }),
    prisma.documentAuditEvent.create({
      data: auditEventData({
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        type: "po_mismatch_approvers_set",
        detail: { userIds: unique },
      }, context),
    }),
  ])
  return updated
}

/** The enforcement read, used by overrideGateAction for a `match-variance` gate.
 *
 * Returns `{ allowed: true }` when the list is empty (the in-force default defers to whoever the
 * override path already allowed) or when the actor is named. A refusal carries the names, not just
 * a "no" — a person told they cannot act must be told who can, or the refusal is a dead end. */
export async function canOverrideMismatch(input: { workspaceId: string; actorId: string }): Promise<
  { allowed: true } | { allowed: false; approverNames: string[] }
> {
  const approvers = await listMismatchApprovers(input.workspaceId)
  if (!approvers.length) return { allowed: true }
  if (approvers.some((approver) => approver.id === input.actorId)) return { allowed: true }
  return { allowed: false, approverNames: approvers.map((approver) => approver.name || approver.email) }
}
