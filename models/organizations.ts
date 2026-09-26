// Deliberately NOT a "use server" module — same reasoning as models/workspaces.ts: these trust
// caller-supplied ids, and the directive would publish them as forgeable endpoints. #285/#286/#287
// call through their own "use server" actions, which resolve the caller's identity first.
import { prisma } from "@/lib/db"
import { companyCountryAndCurrency } from "@/lib/geo/company-currency"
import { unscoped } from "@/lib/workspace-scope"
import { cache } from "react"

export type OrganizationRole = "admin" | "member"

const parseOrgRole = (value: unknown): OrganizationRole => (value === "admin" ? "admin" : "member")

/** ADR 0002: organization membership is Admin-scoped and never itself grants entity access —
 * WorkspaceMember stays the only access grant. So every "which companies is this user in" or
 * "which users does this org have" query below is written as unscoped() + an explicit
 * `workspaceId IN (...)` list derived from WorkspaceMember rows, never from OrganizationMember
 * directly. The workspace ids a user may see are exactly the ones they hold a WorkspaceMember
 * row for, whether or not they are also an OrganizationMember. */

/** The workspace ids `userId` actually has entity access to (via WorkspaceMember), restricted to
 * ones that belong to `organizationId`. This is the access list every org-wide read below joins
 * against — it is what makes "organization admin" a scope on Companies/Users/invitations, not a
 * backdoor into every company's data. */
async function accessibleWorkspaceIds(organizationId: string, userId: string): Promise<string[]> {
  return unscoped(async () => {
    const rows = await prisma.workspace.findMany({
      where: { organizationId, members: { some: { userId } } },
      select: { id: true },
    })
    return rows.map((row) => row.id)
  })
}

/** Companies (#285): every team workspace in the organization the caller has entity access to,
 * with their own WorkspaceMember role. Never returns a company the caller only reaches through
 * OrganizationMember — see accessibleWorkspaceIds. */
export const listOrganizationCompanies = cache(async (organizationId: string, userId: string) =>
  unscoped(async () => {
    const workspaceIds = await accessibleWorkspaceIds(organizationId, userId)
    if (workspaceIds.length === 0) return []
    return prisma.workspace.findMany({
      where: { id: { in: workspaceIds } },
      include: { members: { where: { userId }, select: { role: true } }, _count: { select: { members: true } } },
      orderBy: { name: "asc" },
    })
  }),
)

/** Companies (#285 spec §3.1): total team workspaces in the organization, regardless of the
 * caller's access — the "‹k› more in ‹org› you're not a member of" line is this minus the
 * caller's own accessible count, so the header figure never doubles as the org's real size. */
export async function organizationCompanyCount(organizationId: string): Promise<number> {
  return unscoped(() => prisma.workspace.count({ where: { organizationId } }))
}

/** "Move a company into ‹org›" (#285 spec §4.2): team workspaces `userId` owns that aren't in any
 * organization yet — the eligible list for the Move dialog. */
export const listOwnedUngroupedTeamWorkspaces = cache(async (userId: string) =>
  unscoped(async () => {
    const owned = await prisma.workspaceMember.findMany({
      where: { userId, role: "owner", workspace: { kind: "team", organizationId: null } },
      select: { workspace: { include: { _count: { select: { members: true } } } } },
    })
    return owned.map((row) => row.workspace).sort((a, b) => a.name.localeCompare(b.name))
  }),
)

/** Users (#286): every distinct user who holds a WorkspaceMember row in any company the caller
 * can see, deduped, each with the list of (workspace, role) pairs it actually holds. The org-wide
 * "list users" screen is this — a rollup of real per-workspace grants, not OrganizationMember
 * rows, so a user who was added to an org but never granted a company never appears here as
 * having access to one. */
export const listOrganizationUsers = cache(async (organizationId: string, userId: string) =>
  unscoped(async () => {
    const workspaceIds = await accessibleWorkspaceIds(organizationId, userId)
    if (workspaceIds.length === 0) return []
    const memberships = await prisma.workspaceMember.findMany({
      where: { workspaceId: { in: workspaceIds } },
      include: { user: { select: { id: true, name: true, email: true } }, workspace: { select: { id: true, name: true } } },
      orderBy: [{ user: { name: "asc" } }],
    })
    const byUser = new Map<string, { user: { id: string; name: string; email: string }; companies: { workspaceId: string; workspaceName: string; role: string }[] }>()
    for (const membership of memberships) {
      const entry = byUser.get(membership.user.id) ?? { user: membership.user, companies: [] }
      entry.companies.push({ workspaceId: membership.workspace.id, workspaceName: membership.workspace.name, role: membership.role })
      byUser.set(membership.user.id, entry)
    }
    return [...byUser.values()]
  }),
)

/** The workspace ids in `organizationId` where `userId` is an owner — the invitation scope: an
 * invitation is one record owned by its primary company, so only owners of that company see
 * and act on it (#286 §3.4). */
export async function ownedWorkspaceIds(organizationId: string, userId: string): Promise<string[]> {
  return unscoped(async () => {
    const rows = await prisma.workspace.findMany({
      where: { organizationId, members: { some: { userId, role: "owner" } } },
      select: { id: true },
    })
    return rows.map((row) => row.id)
  })
}

export type OrganizationInvitationRow = {
  id: string
  email: string
  createdAt: Date
  expiresAt: Date
  sentBy: { name: string | null; email: string }
  /** Primary company first, then the additional grants — the order Resend re-issues them in. */
  grants: { workspaceId: string; workspaceName: string; role: string }[]
}

/** Users (#286): pending invitations across the companies the caller owns, one row per
 * invitation with its grants resolved to company names. Not deduped by email on purpose: two
 * owners of two companies can each hold an invitation for the same address, and each is its
 * own record with its own Revoke. */
export const listOrganizationInvitations = cache(async (organizationId: string, userId: string): Promise<OrganizationInvitationRow[]> =>
  unscoped(async () => {
    const owned = await ownedWorkspaceIds(organizationId, userId)
    if (owned.length === 0) return []
    const invitations = await prisma.workspaceInvitation.findMany({
      where: { workspaceId: { in: owned }, acceptedAt: null },
      include: {
        workspace: { select: { id: true, name: true } },
        sentBy: { select: { name: true, email: true } },
        additionalGrants: { include: { workspace: { select: { id: true, name: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    })
    return invitations.map((invitation) => ({
      id: invitation.id,
      email: invitation.email,
      createdAt: invitation.createdAt,
      expiresAt: invitation.expiresAt,
      sentBy: invitation.sentBy,
      grants: [
        { workspaceId: invitation.workspace.id, workspaceName: invitation.workspace.name, role: invitation.role },
        ...invitation.additionalGrants.map((grant) => ({ workspaceId: grant.workspace.id, workspaceName: grant.workspace.name, role: grant.role })),
      ],
    }))
  }),
)

/** Dashboard (#287): membership check for "does this org have ≥2 companies the caller can see" —
 * the rollups and the Companies-picker-over-/workspaces only show once true. */
export async function countAccessibleCompanies(organizationId: string, userId: string): Promise<number> {
  return (await accessibleWorkspaceIds(organizationId, userId)).length
}

export const getOrganizationMembership = cache(async (organizationId: string, userId: string) =>
  unscoped(() => prisma.organizationMember.findUnique({ where: { organizationId_userId: { organizationId, userId } } })),
)

/** Every organization `userId` belongs to, for the switcher (#287) grouping companies by org. */
export const listOrganizationsForUser = cache(async (userId: string) =>
  unscoped(() =>
    prisma.organization.findMany({
      where: { members: { some: { userId } } },
      orderBy: { name: "asc" },
    }),
  ),
)

/** Rename organization (#301): the organization's name change, gated by the caller's
 * OrganizationMember role in the action layer, not here — this just writes it. */
export async function renameOrganization(organizationId: string, name: string) {
  const trimmed = name.trim()
  if (!trimmed) throw new Error("name_required")
  return unscoped(() => prisma.organization.update({ where: { id: organizationId }, data: { name: trimmed } }))
}

export async function createOrganization(name: string, ownerId: string) {
  const trimmed = name.trim()
  if (!trimmed) throw new Error("organization_name_required")
  return unscoped(() =>
    prisma.organization.create({
      data: { name: trimmed, members: { create: { userId: ownerId, role: "admin" } } },
    }),
  )
}

/** "Add a company" (#285): creates a new team workspace already inside the organization, with
 * the caller as its owner (WorkspaceMember) — organization admin alone does not carry entity
 * access, so this call is what actually grants it, same as any other workspace creation. */
export async function addCompanyToOrganization(organizationId: string, ownerId: string, input: { name: string; country?: string; baseCurrency?: string }) {
  const pair = companyCountryAndCurrency(input)
  return unscoped(() =>
    prisma.workspace.create({
      data: {
        name: input.name.trim(),
        kind: "team",
        industry: "finance",
        ...pair,
        organizationId,
        members: { create: { userId: ownerId, role: "owner" } },
      },
    }),
  )
}

/** "Move into ‹org›" (#285): attaches an existing team workspace the caller owns to an
 * organization. Never called for a personal workspace — the caller checks `workspace.kind`. */
export async function moveWorkspaceIntoOrganization(workspaceId: string, organizationId: string, actorId: string) {
  return unscoped(async () => {
    const membership = await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId: actorId } } })
    if (!membership || membership.role !== "owner") throw new Error("workspace_access_denied")
    return prisma.workspace.update({ where: { id: workspaceId }, data: { organizationId } })
  })
}

/** "Remove from ‹org›" (#285 spec §4.3): detaches a team workspace, reversing
 * moveWorkspaceIntoOrganization. Only the row's own owner may call it — mirrors the ownership
 * check in moveWorkspaceIntoOrganization so the two are symmetric. */
export async function removeWorkspaceFromOrganization(workspaceId: string, actorId: string) {
  return unscoped(async () => {
    const membership = await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId: actorId } } })
    if (!membership || membership.role !== "owner") throw new Error("workspace_access_denied")
    return prisma.workspace.update({ where: { id: workspaceId }, data: { organizationId: null } })
  })
}

export async function setOrganizationMemberRole(organizationId: string, targetUserId: string, role: OrganizationRole) {
  return unscoped(() =>
    prisma.organizationMember.upsert({
      where: { organizationId_userId: { organizationId, userId: targetUserId } },
      update: { role: parseOrgRole(role) },
      create: { organizationId, userId: targetUserId, role: parseOrgRole(role) },
    }),
  )
}
