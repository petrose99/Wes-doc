// Deliberately NOT a "use server" module: these are internal data-access helpers that trust
// their caller-supplied arguments (acceptWorkspaceInvitation takes the user to attach). The
// directive would publish every export as a callable endpoint, letting a client pass a forged
// user. Server actions live in app/(app)/workspaces/[workspaceId]/actions.ts and do the auth.
import { auditEventData, getRequestAuditContext, recordDocumentAudit } from "@/lib/audit"
import { recordAdminAudit } from "@/lib/auth-audit"
import { archiveWorkspaceAuditEvents } from "@/lib/audit-archive"
import { deleteDocumentSource } from "@/lib/document-storage"
import { prisma } from "@/lib/db"
import { companyCountryAndCurrency } from "@/lib/geo/company-currency"
import { unscoped } from "@/lib/workspace-scope"
import { deleteFiles } from "@/models/files"
import { User } from "@/prisma/client"
import crypto, { randomBytes } from "crypto"
import { cache } from "react"

export type WorkspaceRole = "owner" | "reviewer" | "member"
/** "personal" is the implicit one-member workspace every user gets; "team" is the shared kind
 * any member may create — there is no plan gate on this anymore. */
export type WorkspaceKind = "personal" | "team"

const invitationHash = (value: string) => crypto.createHash("sha256").update(value).digest("hex")

const parseRole = (value: unknown): WorkspaceRole => (value === "owner" ? "owner" : value === "reviewer" ? "reviewer" : "member")

/** Every invariant a mutation depends on has to be read through this, never through
 * getWorkspaceMembership/getWorkspacesForUser/getWorkspaceMembers: those are React-`cache`d, so
 * within one request they would hand back the snapshot from *before* the mutation that is
 * currently running and happily wave through demoting or removing the last owner. */
const countOwners = (workspaceId: string) => prisma.workspaceMember.count({ where: { workspaceId, role: "owner" } })

/* ------------------------------------------------------------- workspace mode (#41) --- */

export type WorkspaceMode = "firm" | "smb"

/** Same fresh-read discipline as countOwners: mode/reviewer-count are the invariants the role
 * mutations below diff against, so any snapshot would race the write that is running right now. */
const countReviewers = (workspaceId: string) => prisma.workspaceMember.count({ where: { workspaceId, role: "reviewer" } })

/** Workspace mode is derived, not stored: firm when at least one member holds the reviewer role,
 * else smb. Owners do not implicitly count as reviewers — the two roles are separate strings on
 * WorkspaceMember, and a firm's owner isn't necessarily its signer of record. Decision #41. */
export async function getWorkspaceMode(workspaceId: string): Promise<WorkspaceMode> {
  return (await countReviewers(workspaceId)) > 0 ? "firm" : "smb"
}

const modeFromReviewerCount = (count: number): WorkspaceMode => (count > 0 ? "firm" : "smb")

const reviewerDelta = (prevRole: string | null, nextRole: string | null) => (nextRole === "reviewer" ? 1 : 0) - (prevRole === "reviewer" ? 1 : 0)

/** Build the audit-event $transaction rows for a role-diff that touched reviewer capability, so
 * every mutation below emits the same three events (reviewer.added/.removed/mode.changed) from
 * one place. `prevReviewers` is the count BEFORE the mutation, `delta` is the reviewer change
 * this mutation carries (−1 lost a reviewer, +1 gained one, 0 unchanged — but reviewer role may
 * still have moved between users, hence the `targetUserId` on the payload).
 *
 * All three ride on DocumentAuditEvent (freeform `type: String`), matching the existing
 * workspace_* lifecycle events. writeAuditEvent's typed catalog is for gate/close events. */
function reviewerAuditEventRows(input: {
  workspaceId: string
  actorId: string | null
  targetUserId: string
  prevReviewers: number
  delta: -1 | 0 | 1
  reason?: string
}, context: Awaited<ReturnType<typeof getRequestAuditContext>>) {
  const rows: ReturnType<typeof auditEventData>[] = []
  if (input.delta === 1) {
    rows.push(auditEventData(
      { workspaceId: input.workspaceId, actorId: input.actorId, type: "workspace.reviewer.added", detail: { targetUserId: input.targetUserId, reason: input.reason } },
      context,
    ))
  } else if (input.delta === -1) {
    rows.push(auditEventData(
      { workspaceId: input.workspaceId, actorId: input.actorId, type: "workspace.reviewer.removed", detail: { targetUserId: input.targetUserId, reason: input.reason } },
      context,
    ))
  }
  const before = modeFromReviewerCount(input.prevReviewers)
  const after = modeFromReviewerCount(input.prevReviewers + input.delta)
  if (before !== after) {
    rows.push(auditEventData(
      { workspaceId: input.workspaceId, actorId: input.actorId, type: "workspace.mode.changed", detail: { from: before, to: after, triggeredBy: input.targetUserId } },
      context,
    ))
  }
  return { rows, before, after }
}

/** Fire retroactive gate work AFTER commit, on the same after-commit shape the other retroactive
 * reeval sweeps in lib/gates/* use (see models/automation-config.ts:136). Lazy-imported so the
 * stub in lib/gates/smb-ceiling.ts (filled in by #76) doesn't get pulled onto every caller's
 * dependency graph. */
async function afterModeFlip(workspaceId: string, before: WorkspaceMode, after: WorkspaceMode) {
  if (before === "smb" && after === "firm") {
    const { resolveOpenSmbCeilingGatesForWorkspace } = await import("@/lib/gates/smb-ceiling")
    await resolveOpenSmbCeilingGatesForWorkspace(workspaceId, "workspace_added_reviewer")
  } else if (before === "firm" && after === "smb") {
    const { reevaluateOpenSmbCeilingGatesForWorkspace } = await import("@/lib/gates/smb-ceiling")
    await reevaluateOpenSmbCeilingGatesForWorkspace(workspaceId)
  }
}

export async function createWorkspaceForUser(user: Pick<User, "id" | "name" | "email">, options: { name?: string; kind?: WorkspaceKind; country?: string; baseCurrency?: string; timezone?: string; fiscalYearStart?: string } = {}) {
  const workspace = await prisma.workspace.create({
    data: {
      name: options.name?.trim() || `${user.name || user.email}'s workspace`,
      kind: options.kind || "personal",
      industry: "finance",
      ...companyCountryAndCurrency(options),
      timezone: options.timezone || "UTC",
      fiscalYearStart: options.fiscalYearStart || "january",
      members: { create: { userId: user.id, role: "owner" } },
    },
  })
  // #329: every workspace starts Not connected — no provider is auto-provisioned on creation.
  // Connecting an accounting provider is purely the owner's Connect click on Admin › Integrations
  // (see components/integrations/integrations-manager.tsx).
  await recordDocumentAudit({ workspaceId: workspace.id, actorId: user.id, type: "workspace_created", detail: { kind: workspace.kind, name: workspace.name } })
  return workspace
}

/** Lido's Workspace nav item: a shared team. There is no plan gate on creating one anymore. */
export async function createTeamWorkspace(user: Pick<User, "id" | "name" | "email" | "role">, name: string) {
  return createWorkspaceForUser(user, { name, kind: "team" })
}

export const getWorkspacesForUser = cache(async (userId: string) => prisma.workspace.findMany({
  where: { members: { some: { userId } } },
  include: {
    members: { where: { userId }, select: { role: true } },
    organization: { select: { id: true, name: true } },
  },
  orderBy: { createdAt: "asc" },
}))

export async function getOrCreateWorkspaceForUser(user: Pick<User, "id" | "name" | "email">) {
  const memberships = await getWorkspacesForUser(user.id)
  return memberships[0] || createWorkspaceForUser(user)
}

export const getWorkspaceMembership = cache(async (workspaceId: string, userId: string) => prisma.workspaceMember.findUnique({
  where: { workspaceId_userId: { workspaceId, userId } },
  include: { workspace: true },
}))

export async function requireWorkspaceRole(workspaceId: string, userId: string, allowed: WorkspaceRole[] = ["owner", "reviewer", "member"]) {
  const membership = await getWorkspaceMembership(workspaceId, userId)
  if (!membership || !allowed.includes(membership.role as WorkspaceRole)) throw new Error("workspace_access_denied")
  return membership
}

export const getWorkspaceMembers = cache(async (workspaceId: string) => prisma.workspaceMember.findMany({
  where: { workspaceId },
  include: { user: { select: { id: true, name: true, email: true } } },
  orderBy: [{ role: "asc" }, { createdAt: "asc" }],
}))

/** There is no plan/quota system anymore — every workspace is unlimited. This stub keeps the
 * upload flow's usage meter (components/extract/extract-panel.tsx) working without threading a
 * removal through every caller in one pass; `documentsLimit`/`aiLimit` of -1 renders as
 * "N used" rather than "N of limit". */
export async function getWorkspaceUsage(_workspaceId: string) {
  return { planName: "Unlimited", documentsUsed: 0, documentsLimit: -1, aiUsed: 0, aiLimit: -1 }
}

/* ---------------------------------------------------------------- workspace lifecycle --- */

export async function renameWorkspace(workspaceId: string, name: string, actorId: string) {
  const trimmed = name.trim()
  if (trimmed.length < 2 || trimmed.length > 80) throw new Error("invalid_workspace_name")
  const workspace = await prisma.workspace.update({ where: { id: workspaceId }, data: { name: trimmed } })
  await recordDocumentAudit({ workspaceId, actorId, type: "workspace_renamed", detail: { name: trimmed } })
  return workspace
}

/** Deliberately does NOT re-check any seat limit: there is none anymore, and this exists purely
 * so the owner can reorganise roles.
 *
 * `confirmLastReviewerRemoval` gates the SMB-mode flip (#41): a role change that drops the last
 * reviewer throws `last_reviewer_removal_requires_confirmation` unless the caller has already
 * shown the admin the warning and asserted `confirmLastReviewerRemoval: true`. Prevents an
 * accidental double-click from silently re-gating every open bill over the ceiling. */
export async function updateWorkspaceMemberRole(input: { workspaceId: string; actorId: string; memberUserId: string; role: WorkspaceRole; confirmLastReviewerRemoval?: boolean }) {
  const role = parseRole(input.role)
  const member = await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.memberUserId } } })
  if (!member) throw new Error("member_not_found")
  if (member.role === "owner" && role !== "owner" && (await countOwners(input.workspaceId)) <= 1) throw new Error("last_owner_required")

  const delta = reviewerDelta(member.role, role) as -1 | 0 | 1
  const prevReviewers = delta === 0 ? 0 : await countReviewers(input.workspaceId)
  if (delta === -1 && prevReviewers <= 1 && !input.confirmLastReviewerRemoval) throw new Error("last_reviewer_removal_requires_confirmation")

  const context = await getRequestAuditContext()
  const audit = reviewerAuditEventRows({ workspaceId: input.workspaceId, actorId: input.actorId, targetUserId: input.memberUserId, prevReviewers, delta }, context)
  const [updated] = await prisma.$transaction([
    prisma.workspaceMember.update({ where: { id: member.id }, data: { role } }),
    prisma.documentAuditEvent.create({
      data: auditEventData(
        { workspaceId: input.workspaceId, actorId: input.actorId, type: "workspace_member_role_changed", detail: { targetUserId: input.memberUserId, from: member.role, to: role } },
        context
      ),
    }),
    ...audit.rows.map((data) => prisma.documentAuditEvent.create({ data })),
  ])
  await afterModeFlip(input.workspaceId, audit.before, audit.after)
  return updated
}

/** Removing someone also drops the per-email file shares they hold in this workspace.
 * getFileAccess resolves DocumentFileShare independently of membership, so a removed member who
 * had ever been added to a Share dialog would otherwise keep edit access to those files.
 *
 * `reviewerAudit` optionally piggybacks the reviewer.removed / mode.changed audit rows onto the
 * same transaction — used when the detached member held reviewer role, so #41's three events
 * fire atomically with the delete. */
async function detachMember(workspaceId: string, memberId: string, email: string, actorId: string | null, type: string, reviewerAudit?: ReturnType<typeof auditEventData>[]) {
  const normalized = email.toLowerCase()
  const context = await getRequestAuditContext()
  await prisma.$transaction([
    prisma.workspaceMember.delete({ where: { id: memberId } }),
    prisma.documentFileShare.deleteMany({ where: { email: normalized, file: { workspaceId } } }),
    prisma.workspaceInvitation.deleteMany({ where: { workspaceId, email: normalized, acceptedAt: null } }),
    prisma.documentAuditEvent.create({ data: auditEventData({ workspaceId, actorId, type }, context) }),
    ...(reviewerAudit ?? []).map((data) => prisma.documentAuditEvent.create({ data })),
  ])
}

export async function removeWorkspaceMember(input: { workspaceId: string; actorId: string; memberUserId: string; confirmLastReviewerRemoval?: boolean }) {
  if (input.actorId === input.memberUserId) throw new Error("use_leave_workspace")
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.memberUserId } },
    include: { user: { select: { email: true } } },
  })
  if (!member) throw new Error("member_not_found")
  if (member.role === "owner" && (await countOwners(input.workspaceId)) <= 1) throw new Error("last_owner_required")

  const wasReviewer = member.role === "reviewer"
  const prevReviewers = wasReviewer ? await countReviewers(input.workspaceId) : 0
  if (wasReviewer && prevReviewers <= 1 && !input.confirmLastReviewerRemoval) throw new Error("last_reviewer_removal_requires_confirmation")

  const context = await getRequestAuditContext()
  const audit = wasReviewer
    ? reviewerAuditEventRows({ workspaceId: input.workspaceId, actorId: input.actorId, targetUserId: input.memberUserId, prevReviewers, delta: -1 }, context)
    : { rows: [], before: "smb" as WorkspaceMode, after: "smb" as WorkspaceMode }
  await detachMember(input.workspaceId, member.id, member.user.email, input.actorId, "workspace_member_removed", audit.rows)
  await afterModeFlip(input.workspaceId, audit.before, audit.after)
}

/** Leaving a personal workspace is refused rather than handled: it is the user's own default
 * space, and getOrCreateWorkspaceForUser would simply mint a replacement on their next visit. */
export async function leaveWorkspace(workspaceId: string, userId: string, options: { confirmLastReviewerRemoval?: boolean } = {}) {
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    include: { user: { select: { email: true } }, workspace: { select: { kind: true } } },
  })
  if (!member) throw new Error("member_not_found")
  if (member.workspace.kind === "personal") throw new Error("cannot_leave_personal_workspace")
  if (member.role === "owner" && (await countOwners(workspaceId)) <= 1) {
    const members = await prisma.workspaceMember.count({ where: { workspaceId } })
    throw new Error(members > 1 ? "transfer_ownership_before_leaving" : "delete_workspace_instead")
  }

  const wasReviewer = member.role === "reviewer"
  const prevReviewers = wasReviewer ? await countReviewers(workspaceId) : 0
  if (wasReviewer && prevReviewers <= 1 && !options.confirmLastReviewerRemoval) throw new Error("last_reviewer_removal_requires_confirmation")

  const context = await getRequestAuditContext()
  const audit = wasReviewer
    ? reviewerAuditEventRows({ workspaceId, actorId: userId, targetUserId: userId, prevReviewers, delta: -1, reason: "left_workspace" }, context)
    : { rows: [], before: "smb" as WorkspaceMode, after: "smb" as WorkspaceMode }
  await detachMember(workspaceId, member.id, member.user.email, userId, "workspace_member_left", audit.rows)
  await afterModeFlip(workspaceId, audit.before, audit.after)
}

export async function transferWorkspaceOwnership(input: { workspaceId: string; actorId: string; targetUserId: string; stepDown?: boolean; confirmLastReviewerRemoval?: boolean }) {
  if (input.actorId === input.targetUserId) throw new Error("cannot_transfer_to_self")
  const target = await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.targetUserId } } })
  if (!target) throw new Error("member_not_found")
  const stepDown = input.stepDown !== false

  // Target's promotion to owner overwrites their previous role, so a reviewer being promoted
  // silently drops from the reviewer count. Diff before the write so #41's events cover this.
  const targetWasReviewer = target.role === "reviewer"
  const prevReviewers = targetWasReviewer ? await countReviewers(input.workspaceId) : 0
  if (targetWasReviewer && prevReviewers <= 1 && !input.confirmLastReviewerRemoval) throw new Error("last_reviewer_removal_requires_confirmation")

  const context = await getRequestAuditContext()
  const audit = targetWasReviewer
    ? reviewerAuditEventRows({ workspaceId: input.workspaceId, actorId: input.actorId, targetUserId: input.targetUserId, prevReviewers, delta: -1, reason: "promoted_to_owner" }, context)
    : { rows: [], before: "smb" as WorkspaceMode, after: "smb" as WorkspaceMode }
  await prisma.$transaction([
    prisma.workspaceMember.update({ where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.targetUserId } }, data: { role: "owner" } }),
    ...(stepDown ? [prisma.workspaceMember.update({ where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.actorId } }, data: { role: "member" } })] : []),
    prisma.documentAuditEvent.create({
      data: auditEventData(
        { workspaceId: input.workspaceId, actorId: input.actorId, type: "workspace_ownership_transferred", detail: { targetUserId: input.targetUserId, stepDown } },
        context
      ),
    }),
    ...audit.rows.map((data) => prisma.documentAuditEvent.create({ data })),
  ])
  await afterModeFlip(input.workspaceId, audit.before, audit.after)
}

/** The cascade on Workspace drops every child row, but nothing in the database knows about the
 * blob store — so the source objects have to be swept first or every upload this workspace ever
 * made is orphaned under data/document-sources (or the S3 bucket) forever.
 *
 * deleteFiles truncates its id list to 100, so this pages rather than passing every id at once;
 * a single call would silently leave the 101st file's blobs behind. There is no directory-level
 * delete in lib/document-storage.ts, so per-object is the only correct approach. */
export async function deleteWorkspace(input: { workspaceId: string; actorId: string }) {
  const workspace = await prisma.workspace.findUnique({ where: { id: input.workspaceId }, select: { name: true, kind: true } })
  // Written first, to AdminAuditEvent rather than DocumentAuditEvent: the workspace cascade below
  // would destroy a DocumentAuditEvent row, and this record — "who deleted which workspace" — must
  // survive the workspace it describes.
  await recordAdminAudit({ actorId: input.actorId, type: "workspace_deleted", targetWorkspaceId: input.workspaceId, detail: { name: workspace?.name, kind: workspace?.kind } })

  for (;;) {
    const batch = await prisma.documentFile.findMany({ where: { workspaceId: input.workspaceId }, select: { id: true }, take: 100 })
    if (!batch.length) break
    const result = await deleteFiles(input.workspaceId, batch.map((file) => file.id), input.actorId)
    // Nothing deleted means the next page would be identical; stop rather than spin forever.
    if (!result.deleted) throw new Error("workspace_files_not_deletable")
  }

  // Document.fileId is non-nullable, so the sweep above should have reached every blob. Assert
  // it rather than trust it: a straggler here is a permanently orphaned object.
  const strays = await prisma.document.findMany({ where: { workspaceId: input.workspaceId }, select: { storageKey: true } })
  const seenKeys = new Set<string>()
  for (const stray of strays) if (stray.storageKey && !seenKeys.has(stray.storageKey)) { seenKeys.add(stray.storageKey); await deleteDocumentSource(stray.storageKey).catch(() => {}) }

  // The workspace -> DocumentAuditEvent relation is onDelete: Restrict (HIPAA §164.316(b) requires
  // 6-year retention, so deleting a workspace must not be a way to destroy the evidence of what
  // happened inside it). Archiving to cold storage first, then clearing the rows, is what makes
  // the delete below succeed while keeping the record.
  await archiveWorkspaceAuditEvents(input.workspaceId)

  await prisma.workspace.delete({ where: { id: input.workspaceId } })
}

/** Returns the workspace name alongside the token so the caller can compose the invitation
 * email without a second query for something it just read. There is no seat limit anymore. */
/** `additionalGrants`: #254/#286 — extra (workspaceId, role) pairs beyond the primary workspace,
 * so one invitation can add a user to several companies in an organization at once. The caller
 * (Users' invite form, #286) is responsible for checking the inviter has "owner" on each extra
 * workspace too; this function only enforces it for the primary one, matching every existing
 * single-company caller unchanged. */
export async function createWorkspaceInvitation(input: { workspaceId: string; ownerId: string; email: string; role?: WorkspaceRole; additionalGrants?: { workspaceId: string; role?: WorkspaceRole }[] }) {
  await requireWorkspaceRole(input.workspaceId, input.ownerId, ["owner"])
  const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: input.workspaceId } })
  const email = input.email.trim().toLowerCase()
  const owner = await prisma.user.findUnique({ where: { id: input.ownerId }, select: { email: true } })
  if (owner && owner.email.toLowerCase() === email) throw new Error("self_invite")
  if (await prisma.workspaceMember.findFirst({ where: { workspaceId: input.workspaceId, user: { email } } })) throw new Error("member_already_exists")
  const token = randomBytes(32).toString("base64url")
  await prisma.workspaceInvitation.deleteMany({ where: { workspaceId: input.workspaceId, email, acceptedAt: null } })
  const additionalGrants = (input.additionalGrants ?? []).filter((grant) => grant.workspaceId !== input.workspaceId)
  const invitation = await prisma.workspaceInvitation.create({
    data: {
      workspaceId: input.workspaceId,
      sentById: input.ownerId,
      email,
      role: parseRole(input.role || "member"),
      tokenHash: invitationHash(token),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      additionalGrants: additionalGrants.length ? { create: additionalGrants.map((grant) => ({ workspaceId: grant.workspaceId, role: parseRole(grant.role || "member") })) } : undefined,
    },
  })
  await recordDocumentAudit({ workspaceId: input.workspaceId, actorId: input.ownerId, type: "invitation_created", detail: { email, role: invitation.role } })
  return { token, invitation, workspaceName: workspace.name }
}

/** Expired invitations are included so the table can badge them rather than have them silently
 * vanish; the owner still needs a Revoke button for a row they can see. */
export const listWorkspaceInvitations = cache(async (workspaceId: string) => prisma.workspaceInvitation.findMany({
  where: { workspaceId, acceptedAt: null },
  orderBy: { createdAt: "desc" },
  take: 200,
}))

export async function revokeWorkspaceInvitation(workspaceId: string, invitationId: string, actorId: string) {
  // Scoped by workspaceId as well as id: the id alone is a caller-supplied uuid, and matching on
  // it by itself would let an owner of one workspace revoke another workspace's invitation.
  const invitation = await prisma.workspaceInvitation.findFirst({ where: { id: invitationId, workspaceId }, select: { email: true } })
  const result = await prisma.workspaceInvitation.deleteMany({ where: { id: invitationId, workspaceId } })
  if (result.count && invitation) {
    await recordDocumentAudit({ workspaceId, actorId, type: "invitation_revoked", detail: { email: invitation.email } })
  }
  return result
}

/** Deliberately NOT cache()-wrapped, unlike its neighbours. This runs on the auth request path
 * (the sign-up gate) outside any React render, where a stale hit would not be a rendering quirk
 * but a security bug: a just-revoked invitation still admitting an account. */
export async function getPendingInvitationForEmail(email: string) {
  const normalized = email.trim().toLowerCase()
  if (!normalized) return null
  return prisma.workspaceInvitation.findFirst({
    where: { email: normalized, acceptedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  })
}

/** Used by the login and signup pages to prefill the email an invitation was addressed to. Returns the email only —
 * the page never needs, and must never leak, anything else about the workspace. */
export async function getInvitationEmailForToken(token: string) {
  const invitation = await prisma.workspaceInvitation.findUnique({ where: { tokenHash: invitationHash(token) }, select: { email: true, acceptedAt: true, expiresAt: true } })
  if (!invitation || invitation.acceptedAt || invitation.expiresAt < new Date()) return null
  return invitation.email
}

export async function acceptWorkspaceInvitation(token: string, user: Pick<User, "id" | "email">) {
  const invitation = await prisma.workspaceInvitation.findUnique({ where: { tokenHash: invitationHash(token) }, include: { additionalGrants: true } })
  if (!invitation) throw new Error("invitation_invalid")
  if (invitation.email !== user.email.toLowerCase()) throw new Error("invitation_email_mismatch")
  // Idempotent for the person who already used it: a back button, a second tab, or a re-opened
  // email would otherwise tell an existing member their invitation is unavailable.
  if (invitation.acceptedAt) {
    if (await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: invitation.workspaceId, userId: user.id } } })) return invitation.workspaceId
    throw new Error("invitation_invalid")
  }
  if (invitation.expiresAt < new Date()) throw new Error("invitation_invalid")

  // A pre-existing membership (acceptedAt=null but member row present — the sign-up path can hit
  // this shape) means we're role-changing, not adding; diff off the current row's role.
  const existing = await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: invitation.workspaceId, userId: user.id } } })
  const nextRole = invitation.role
  const delta = reviewerDelta(existing?.role ?? null, nextRole) as -1 | 0 | 1
  const prevReviewers = delta === 0 ? 0 : await countReviewers(invitation.workspaceId)
  const context = await getRequestAuditContext()
  const audit = reviewerAuditEventRows({ workspaceId: invitation.workspaceId, actorId: user.id, targetUserId: user.id, prevReviewers, delta, reason: "invitation_accepted" }, context)

  // #254/#286: additionalGrants add the same user to further companies in one acceptance. Each
  // gets its own upsert + reviewer/mode accounting, exactly like the primary workspace above —
  // an org-wide invite is N per-workspace grants, never a shortcut around WorkspaceMember.
  const extraGrants: { workspaceId: string; role: string }[] = []
  for (const grant of invitation.additionalGrants ?? []) {
    const grantExisting = await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: grant.workspaceId, userId: user.id } } })
    const grantDelta = reviewerDelta(grantExisting?.role ?? null, grant.role) as -1 | 0 | 1
    const grantPrevReviewers = grantDelta === 0 ? 0 : await countReviewers(grant.workspaceId)
    extraGrants.push({ workspaceId: grant.workspaceId, role: grant.role })
    const grantAudit = reviewerAuditEventRows({ workspaceId: grant.workspaceId, actorId: user.id, targetUserId: user.id, prevReviewers: grantPrevReviewers, delta: grantDelta, reason: "invitation_accepted" }, context)
    await prisma.$transaction([
      prisma.workspaceMember.upsert({ where: { workspaceId_userId: { workspaceId: grant.workspaceId, userId: user.id } }, update: { role: grant.role }, create: { workspaceId: grant.workspaceId, userId: user.id, role: grant.role } }),
      prisma.documentAuditEvent.create({
        data: auditEventData({ workspaceId: grant.workspaceId, actorId: user.id, type: "invitation_accepted", detail: { role: grant.role } }, context),
      }),
      ...grantAudit.rows.map((data) => prisma.documentAuditEvent.create({ data })),
    ])
    await afterModeFlip(grant.workspaceId, grantAudit.before, grantAudit.after)
  }

  await prisma.$transaction([
    prisma.workspaceMember.upsert({ where: { workspaceId_userId: { workspaceId: invitation.workspaceId, userId: user.id } }, update: { role: invitation.role }, create: { workspaceId: invitation.workspaceId, userId: user.id, role: invitation.role } }),
    prisma.workspaceInvitation.update({ where: { id: invitation.id }, data: { acceptedAt: new Date() } }),
    prisma.documentAuditEvent.create({
      data: auditEventData({ workspaceId: invitation.workspaceId, actorId: user.id, type: "invitation_accepted", detail: { role: invitation.role } }, context),
    }),
    ...audit.rows.map((data) => prisma.documentAuditEvent.create({ data })),
  ])
  await afterModeFlip(invitation.workspaceId, audit.before, audit.after)
  return invitation.workspaceId
}

/** Users (#286) "Add to a company": an owner grants an existing account another company without
 * an invitation round-trip. Same per-grant accounting as one `additionalGrants` entry in
 * acceptWorkspaceInvitation — create the WorkspaceMember row, reviewer-delta / mode-flip audit —
 * but refused (not upserted) when the row already exists: the surface
 * says "added", never "role changed". Authorisation is the caller's (the action checks ownership). */
export async function addExistingUserToWorkspace(input: { workspaceId: string; actorId: string; userId: string; role: WorkspaceRole }) {
  const role = parseRole(input.role)
  const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { id: true, name: true, email: true } })
  if (!user) throw new Error("user_not_found")
  const existing = await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.userId } } })
  if (existing) throw new Error("member_already_exists")
  const delta = reviewerDelta(null, role) as -1 | 0 | 1
  const prevReviewers = delta === 0 ? 0 : await countReviewers(input.workspaceId)
  const context = await getRequestAuditContext()
  const audit = reviewerAuditEventRows({ workspaceId: input.workspaceId, actorId: input.actorId, targetUserId: input.userId, prevReviewers, delta, reason: "added_by_owner" }, context)
  const [created] = await prisma.$transaction([
    prisma.workspaceMember.create({ data: { workspaceId: input.workspaceId, userId: input.userId, role } }),
    prisma.documentAuditEvent.create({
      data: auditEventData({ workspaceId: input.workspaceId, actorId: input.actorId, type: "workspace_member_added", detail: { targetUserId: input.userId, role } }, context),
    }),
    ...audit.rows.map((data) => prisma.documentAuditEvent.create({ data })),
  ])
  await afterModeFlip(input.workspaceId, audit.before, audit.after)
  return created
}

export type MemberBankDetails = { bankName: string; accountNumber: string; branchCode: string }

/** ADR 0003: bank details live on the membership (one company, one person) and are set or
 * cleared whole. The audit row records that they changed, never the values. Authorisation
 * (owner of the company or the member themself) is the caller's. */
export async function setWorkspaceMemberBankDetails(input: { workspaceId: string; actorId: string; userId: string; details: MemberBankDetails | null }) {
  const member = await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.userId } } })
  if (!member) throw new Error("member_not_found")
  let details: MemberBankDetails | null = null
  if (input.details) {
    const bankName = input.details.bankName.trim()
    const accountNumber = input.details.accountNumber.replace(/\s+/g, "")
    const branchCode = input.details.branchCode.trim()
    if (!bankName || !/^\d{6,20}$/.test(accountNumber) || branchCode.length < 3 || branchCode.length > 10) throw new Error("invalid_bank_details")
    details = { bankName, accountNumber, branchCode }
  }
  const context = await getRequestAuditContext()
  const [updated] = await prisma.$transaction([
    prisma.workspaceMember.update({
      where: { id: member.id },
      data: details
        ? { bankName: details.bankName, bankAccountNumber: details.accountNumber, bankBranchCode: details.branchCode }
        : { bankName: null, bankAccountNumber: null, bankBranchCode: null },
    }),
    prisma.documentAuditEvent.create({
      data: auditEventData({ workspaceId: input.workspaceId, actorId: input.actorId, type: "workspace_member_bank_details_changed", detail: { targetUserId: input.userId, cleared: !details } }, context),
    }),
  ])
  return updated
}

/** A pending invitation with its grants — what Resend (#286) needs to re-issue it whole. Unscoped
 * on purpose: the caller checks ownership of the primary company before acting on it. */
export async function getPendingInvitationWithGrants(invitationId: string) {
  return unscoped(() => prisma.workspaceInvitation.findFirst({
    where: { id: invitationId, acceptedAt: null },
    include: { additionalGrants: true, workspace: { select: { id: true, name: true } }, sentBy: { select: { name: true, email: true } } },
  }))
}
