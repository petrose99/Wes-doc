// Deliberately NOT a "use server" module — same reasoning as models/workspaces.ts: these trust
// caller-supplied ids, and the directive would publish them as forgeable endpoints. #285/#286/#287
// call through their own "use server" actions, which resolve the caller's identity first.
import { prisma } from "@/lib/db"
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
      include: { members: { where: { userId }, select: { role: true } } },
      orderBy: { name: "asc" },
    })
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
  return unscoped(() =>
    prisma.workspace.create({
      data: {
        name: input.name.trim(),
        kind: "team",
        industry: "finance",
        country: input.country || "US",
        baseCurrency: input.baseCurrency || "USD",
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

export async function setOrganizationMemberRole(organizationId: string, targetUserId: string, role: OrganizationRole) {
  return unscoped(() =>
    prisma.organizationMember.upsert({
      where: { organizationId_userId: { organizationId, userId: targetUserId } },
      update: { role: parseOrgRole(role) },
      create: { organizationId, userId: targetUserId, role: parseOrgRole(role) },
    }),
  )
}
