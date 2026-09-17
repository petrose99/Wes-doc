"use server"

import { z } from "zod"
import { revalidatePath } from "next/cache"
import type { ActionState } from "@/lib/actions"
import { getCurrentUser } from "@/lib/auth"
import config from "@/lib/config"
import { isEmailConfigured, sendWorkspaceInvitationEmail } from "@/lib/email"
import { adminPaths } from "@/lib/admin/paths"
import { prisma } from "@/lib/db"
import { unscoped } from "@/lib/workspace-scope"
import type { UserRole, UserRow } from "@/lib/admin/users"
import { loadUserRow } from "@/models/admin-users"
import {
  addExistingUserToWorkspace,
  createWorkspaceInvitation,
  getPendingInvitationWithGrants,
  getWorkspaceMembership,
  leaveWorkspace,
  removeWorkspaceMember,
  revokeWorkspaceInvitation,
  setWorkspaceMemberBankDetails,
  updateWorkspaceMemberRole,
  type MemberBankDetails,
} from "@/models/workspaces"

/** #286 spec §2: every mutating action authorises here — the model functions authorise nothing.
 * Failures return a *named code* (`owner_required[:company]`, `not_found`, …) that
 * `lib/admin/users.ts` `actionErrorText` maps to the sentence the UI shows, so the client never
 * parses prose. Each action revalidates the Users page so `router.refresh()` re-reads the rows. */

const ROLE = z.enum(["owner", "reviewer", "member"])
const inviteUrlFor = (token: string) => `${config.app.baseURL}/invite/${token}`

const code = (error: unknown, fallback: string): string => (error instanceof Error && error.message ? error.message : fallback)

async function isOwner(workspaceId: string, userId: string): Promise<boolean> {
  const membership = await unscoped(() => getWorkspaceMembership(workspaceId, userId))
  return membership?.role === "owner"
}

async function workspaceName(workspaceId: string): Promise<string> {
  const workspace = await unscoped(() => prisma.workspace.findUnique({ where: { id: workspaceId }, select: { name: true } }))
  return workspace?.name ?? "this company"
}

async function currentFor(workspaceId: string) {
  return unscoped(() => prisma.workspace.findUnique({ where: { id: workspaceId }, select: { id: true, name: true, kind: true, organizationId: true } }))
}

async function deliver(input: { email: string; workspaceName: string; inviterName: string; token: string; expiresAt: Date }) {
  if (!isEmailConfigured()) return false
  try {
    await sendWorkspaceInvitationEmail({ email: input.email, workspaceName: input.workspaceName, inviterName: input.inviterName, inviteUrl: inviteUrlFor(input.token), expiresAt: input.expiresAt })
    return true
  } catch { return false }
}

const revalidate = (workspaceId: string) => revalidatePath(adminPaths(workspaceId).users)

/* ------------------------------------------------------------------------------- read --- */

/** The pane's row. `not_found` when the viewer shares no company with the target. */
export async function loadUserDetailAction(workspaceId: string, key: string): Promise<ActionState<UserRow>> {
  const user = await getCurrentUser()
  const current = await currentFor(workspaceId)
  if (!current) return { success: false, error: "not_found" }
  const membership = await unscoped(() => getWorkspaceMembership(workspaceId, user.id))
  if (!membership) return { success: false, error: "owner_required" }
  const row = await loadUserRow(current, user, key)
  if (!row) return { success: false, error: "not_found" }
  return { success: true, data: row }
}

/* ----------------------------------------------------------------------------- invite --- */

export async function inviteUserAction(workspaceId: string, input: { email: string; grants: { workspaceId: string; role: UserRole }[] }): Promise<ActionState<{ inviteUrl: string; emailed: boolean; invitationId: string; companies: number }>> {
  const user = await getCurrentUser()
  const email = input.email.trim().toLowerCase()
  if (!z.string().email().safeParse(email).success) return { success: false, error: "invalid_email" }
  if (email === user.email.toLowerCase()) return { success: false, error: "self_invite" }
  const grants = input.grants.filter((grant) => ROLE.safeParse(grant.role).success)
  if (grants.length === 0) return { success: false, error: "no_company" }
  // Owner of *every* granted company, and no existing member in any of them (spec §2: the model
  // checks the primary only; an accepted secondary grant would overwrite an existing role).
  for (const grant of grants) {
    if (!(await isOwner(grant.workspaceId, user.id))) return { success: false, error: `owner_required:${await workspaceName(grant.workspaceId)}` }
    const existing = await unscoped(() => prisma.workspaceMember.findFirst({ where: { workspaceId: grant.workspaceId, user: { email } }, select: { id: true } }))
    if (existing) return { success: false, error: `member_already_exists:${await workspaceName(grant.workspaceId)}` }
  }
  const primary = grants.find((grant) => grant.workspaceId === workspaceId) ?? grants[0]
  const others = grants.filter((grant) => grant !== primary)
  try {
    const { token, invitation, workspaceName: name } = await unscoped(() => createWorkspaceInvitation({ workspaceId: primary.workspaceId, ownerId: user.id, email, role: primary.role, additionalGrants: others }))
    const emailed = await deliver({ email, workspaceName: name, inviterName: user.name || user.email, token, expiresAt: invitation.expiresAt })
    revalidate(workspaceId)
    return { success: true, data: { inviteUrl: inviteUrlFor(token), emailed, invitationId: invitation.id, companies: grants.length } }
  } catch (error) { return { success: false, error: code(error, "invite_failed") } }
}

/** Re-issues the invitation whole — same grants — with a fresh seven-day link. Not the existing
 * `resendWorkspaceInvitationAction`, which drops `additionalGrants`. */
export async function resendInvitationAction(workspaceId: string, input: { invitationId: string }): Promise<ActionState<{ inviteUrl: string; emailed: boolean; invitationId: string }>> {
  const user = await getCurrentUser()
  const invitation = await getPendingInvitationWithGrants(input.invitationId)
  if (!invitation) return { success: false, error: "not_found" }
  if (!(await isOwner(invitation.workspaceId, user.id))) return { success: false, error: `owner_required:${invitation.workspace.name}` }
  try {
    const email = invitation.email
    for (const grant of invitation.additionalGrants) {
      const existing = await unscoped(() => prisma.workspaceMember.findFirst({ where: { workspaceId: grant.workspaceId, user: { email } }, select: { id: true } }))
      if (existing) return { success: false, error: `member_already_exists:${await workspaceName(grant.workspaceId)}` }
    }
    const { token, invitation: fresh, workspaceName: name } = await unscoped(() => createWorkspaceInvitation({
      workspaceId: invitation.workspaceId, ownerId: user.id, email, role: invitation.role as UserRole,
      additionalGrants: invitation.additionalGrants.map((grant) => ({ workspaceId: grant.workspaceId, role: grant.role as UserRole })),
    }))
    const emailed = await deliver({ email, workspaceName: name, inviterName: user.name || user.email, token, expiresAt: fresh.expiresAt })
    revalidate(workspaceId)
    return { success: true, data: { inviteUrl: inviteUrlFor(token), emailed, invitationId: fresh.id } }
  } catch (error) { return { success: false, error: code(error, "resend_failed") } }
}

export async function revokeInvitationAction(workspaceId: string, input: { invitationId: string }): Promise<ActionState<null>> {
  const user = await getCurrentUser()
  const invitation = await getPendingInvitationWithGrants(input.invitationId)
  if (!invitation) return { success: false, error: "not_found" }
  if (!(await isOwner(invitation.workspaceId, user.id))) return { success: false, error: `owner_required:${invitation.workspace.name}` }
  try {
    const { count } = await unscoped(() => revokeWorkspaceInvitation(invitation.workspaceId, invitation.id, user.id))
    if (!count) return { success: false, error: "not_found" }
    revalidate(workspaceId)
    return { success: true, data: null }
  } catch (error) { return { success: false, error: code(error, "revoke_failed") } }
}

/* ------------------------------------------------------------------------- membership --- */

export async function addUserToCompanyAction(workspaceId: string, input: { userId: string; workspaceId: string; role: UserRole }): Promise<ActionState<null>> {
  const user = await getCurrentUser()
  if (!ROLE.safeParse(input.role).success) return { success: false, error: "invalid_role" }
  if (!(await isOwner(input.workspaceId, user.id))) return { success: false, error: `owner_required:${await workspaceName(input.workspaceId)}` }
  try {
    await unscoped(() => addExistingUserToWorkspace({ workspaceId: input.workspaceId, actorId: user.id, userId: input.userId, role: input.role }))
    revalidate(workspaceId)
    return { success: true, data: null }
  } catch (error) { return { success: false, error: code(error, "add_failed") } }
}

/** Returns the role the member had before, so the toast can say Old → New from the server's truth. */
export async function setMemberRoleAction(workspaceId: string, input: { userId: string; workspaceId: string; role: UserRole; confirmLastReviewerRemoval?: boolean }): Promise<ActionState<{ previousRole: UserRole }>> {
  const user = await getCurrentUser()
  if (!ROLE.safeParse(input.role).success) return { success: false, error: "invalid_role" }
  if (!(await isOwner(input.workspaceId, user.id))) return { success: false, error: `owner_required:${await workspaceName(input.workspaceId)}` }
  const before = await unscoped(() => getWorkspaceMembership(input.workspaceId, input.userId))
  if (!before) return { success: false, error: "not_found" }
  try {
    await unscoped(() => updateWorkspaceMemberRole({ workspaceId: input.workspaceId, actorId: user.id, memberUserId: input.userId, role: input.role, confirmLastReviewerRemoval: input.confirmLastReviewerRemoval }))
    revalidate(workspaceId)
    return { success: true, data: { previousRole: before.role as UserRole } }
  } catch (error) { return { success: false, error: code(error, "role_failed") } }
}

/** Remove (owner) or Leave (self). Returns the removed membership's role and bank details so the
 * toast's Undo can add them back whole (spec §4.4). */
export async function removeMemberAction(workspaceId: string, input: { userId: string; workspaceId: string; confirmLastReviewerRemoval?: boolean }): Promise<ActionState<{ role: UserRole; bank: MemberBankDetails | null }>> {
  const user = await getCurrentUser()
  const self = input.userId === user.id
  if (!self && !(await isOwner(input.workspaceId, user.id))) return { success: false, error: `owner_required:${await workspaceName(input.workspaceId)}` }
  const before = await unscoped(() => prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.userId } }, select: { role: true, bankName: true, bankAccountNumber: true, bankBranchCode: true } }))
  if (!before) return { success: false, error: "not_found" }
  const bank = before.bankName && before.bankAccountNumber && before.bankBranchCode ? { bankName: before.bankName, accountNumber: before.bankAccountNumber, branchCode: before.bankBranchCode } : null
  try {
    if (self) await unscoped(() => leaveWorkspace(input.workspaceId, user.id, { confirmLastReviewerRemoval: input.confirmLastReviewerRemoval }))
    else await unscoped(() => removeWorkspaceMember({ workspaceId: input.workspaceId, actorId: user.id, memberUserId: input.userId, confirmLastReviewerRemoval: input.confirmLastReviewerRemoval }))
    revalidate(workspaceId)
    if (self) revalidatePath("/workspaces/[workspaceId]", "layout")
    return { success: true, data: { role: before.role as UserRole, bank } }
  } catch (error) { return { success: false, error: code(error, "remove_failed") } }
}

/** Owner of the company or the member themself (ADR 0003). Never returns the values. */
export async function saveMemberBankDetailsAction(workspaceId: string, input: { userId: string; workspaceId: string; details: MemberBankDetails | null }): Promise<ActionState<{ bank: { bankName: string; lastFour: string } | null }>> {
  const user = await getCurrentUser()
  if (input.userId !== user.id && !(await isOwner(input.workspaceId, user.id))) return { success: false, error: `owner_required:${await workspaceName(input.workspaceId)}` }
  try {
    const updated = await unscoped(() => setWorkspaceMemberBankDetails({ workspaceId: input.workspaceId, actorId: user.id, userId: input.userId, details: input.details }))
    revalidate(workspaceId)
    return { success: true, data: { bank: updated.bankName && updated.bankAccountNumber ? { bankName: updated.bankName, lastFour: updated.bankAccountNumber.slice(-4) } : null } }
  } catch (error) { return { success: false, error: code(error, "bank_failed") } }
}
