import "server-only"
import { prisma } from "@/lib/db"
import { unscoped } from "@/lib/workspace-scope"
import type { UserRole, UserRow, UserRowCompany, UsersPageData } from "@/lib/admin/users"
import { getWorkspaceMembers, listWorkspaceInvitations } from "@/models/workspaces"
import { listOrganizationInvitations, listOrganizationUsers } from "@/models/organizations"

type Viewer = { id: string; name: string | null; email: string }
type Current = { id: string; name: string; kind: string; organizationId: string | null }

const asRole = (role: string): UserRole => (role === "owner" ? "owner" : role === "reviewer" ? "reviewer" : "member")

/** Owners per company, for "Ask an owner: …" sentences and the last-owner guard. Never the viewer. */
async function ownersByCompany(workspaceIds: string[], viewerId: string): Promise<Record<string, string[]>> {
  if (workspaceIds.length === 0) return {}
  const owners = await unscoped(() => prisma.workspaceMember.findMany({
    where: { workspaceId: { in: workspaceIds }, role: "owner" },
    include: { user: { select: { id: true, name: true, email: true } } },
  }))
  const out: Record<string, string[]> = {}
  for (const owner of owners) {
    if (owner.userId === viewerId) continue
    ;(out[owner.workspaceId] ??= []).push(owner.user.name || owner.user.email)
  }
  return out
}

/** Bank details are read for one row only when the viewer owns the current company or the row is
 * the viewer (spec §2, critic P1 #1) — every other row has no `bank` key at all. */
async function bankFor(workspaceId: string, userId: string): Promise<UserRow["bank"]> {
  const member = await unscoped(() => prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { bankName: true, bankAccountNumber: true },
  }))
  if (!member?.bankName || !member.bankAccountNumber) return null
  return { bankName: member.bankName, lastFour: member.bankAccountNumber.slice(-4) }
}

/** Admin › Users (#286): the rows for the three page states (spec §2 (a)/(b)/(c)). */
export async function loadUsersPage(current: Current, viewer: Viewer): Promise<UsersPageData> {
  const viewerRoleHere = await unscoped(() => prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: current.id, userId: viewer.id } }, select: { role: true } }))
  const viewerOwnsCurrent = viewerRoleHere?.role === "owner"
  const currentCompany = { workspaceId: current.id, name: current.name, kind: (current.kind === "personal" ? "personal" : "team") as "personal" | "team" }

  if (current.organizationId) {
    const orgId = current.organizationId
    const [users, invitations, organization, orgMembers] = await Promise.all([
      listOrganizationUsers(orgId, viewer.id),
      listOrganizationInvitations(orgId, viewer.id),
      unscoped(() => prisma.organization.findUnique({ where: { id: orgId }, select: { name: true, _count: { select: { workspaces: true } } } })),
      unscoped(() => prisma.organizationMember.findMany({ where: { organizationId: orgId, role: "admin" }, select: { userId: true } })),
    ])
    const admins = new Set(orgMembers.map((member) => member.userId))
    const companyIds = new Set<string>()
    for (const user of users) for (const company of user.companies) companyIds.add(company.workspaceId)
    const viewerRow = users.find((user) => user.user.id === viewer.id)
    const owned = new Set((viewerRow?.companies ?? []).filter((company) => company.role === "owner").map((company) => company.workspaceId))
    const viewerCompanies = (viewerRow?.companies ?? []).slice().sort((a, b) => a.workspaceName.localeCompare(b.workspaceName))
    const owners = await ownersByCompany([...companyIds], viewer.id)
    const joined = await unscoped(() => prisma.workspaceMember.findMany({ where: { workspaceId: current.id }, select: { userId: true, createdAt: true } }))
    const joinedAt = new Map(joined.map((member) => [member.userId, member.createdAt.toISOString()]))

    const rows: UserRow[] = []
    for (const user of users) {
      const companies: UserRowCompany[] = user.companies
        .map((company) => ({ workspaceId: company.workspaceId, workspaceName: company.workspaceName, role: asRole(company.role), viewerOwns: owned.has(company.workspaceId), isCurrent: company.workspaceId === current.id }))
        .sort((a, b) => (a.isCurrent ? -1 : b.isCurrent ? 1 : a.workspaceName.localeCompare(b.workspaceName)))
      const here = companies.find((company) => company.isCurrent)
      const isViewer = user.user.id === viewer.id
      const row: UserRow = {
        key: `u:${user.user.id}`, kind: "member", userId: user.user.id, invitationId: null,
        name: user.user.name, email: user.user.email, companies, roleHere: here?.role ?? null, isViewer,
        createdAt: joinedAt.get(user.user.id) ?? null, expiresAt: null, expired: false, orgRole: admins.has(user.user.id) ? "admin" : null,
      }
      if (here && (viewerOwnsCurrent || isViewer)) row.bank = await bankFor(current.id, user.user.id)
      rows.push(row)
    }
    for (const invitation of invitations) {
      const primary = invitation.grants[0]
      const hereGrant = invitation.grants.find((grant) => grant.workspaceId === current.id)
      rows.push({
        key: `inv:${invitation.id}`, kind: "invited", userId: null, invitationId: invitation.id,
        name: null, email: invitation.email,
        companies: invitation.grants.map((grant) => ({ workspaceId: grant.workspaceId, workspaceName: grant.workspaceName, role: asRole(grant.role), viewerOwns: owned.has(grant.workspaceId), isCurrent: grant.workspaceId === current.id })),
        roleHere: hereGrant ? asRole(hereGrant.role) : null,
        isViewer: false, createdAt: invitation.createdAt.toISOString(), expiresAt: invitation.expiresAt.toISOString(), expired: invitation.expiresAt < new Date(),
        orgRole: null, sentBy: invitation.sentBy.name || invitation.sentBy.email, viewerOwnsPrimary: owned.has(primary.workspaceId), primaryWorkspaceName: primary.workspaceName,
      })
    }
    return {
      mode: "org", rows,
      ownedCompanies: viewerCompanies.filter((company) => owned.has(company.workspaceId)).map((company) => ({ workspaceId: company.workspaceId, name: company.workspaceName })),
      unownedCompanies: viewerCompanies.filter((company) => !owned.has(company.workspaceId)).map((company) => ({ workspaceId: company.workspaceId, name: company.workspaceName })),
      ownersByCompany: owners, organizationName: organization?.name ?? null,
      hiddenCompanyCount: Math.max(0, (organization?._count.workspaces ?? 0) - viewerCompanies.length), currentCompany,
    }
  }

  // (b) team workspace without an organization, (c) personal workspace: this one company.
  const [members, invitations] = await Promise.all([getWorkspaceMembers(current.id), viewerOwnsCurrent ? listWorkspaceInvitations(current.id) : Promise.resolve([])])
  const owners = await ownersByCompany([current.id], viewer.id)
  const rows: UserRow[] = []
  for (const member of members) {
    const isViewer = member.userId === viewer.id
    const role = asRole(member.role)
    const row: UserRow = {
      key: `u:${member.userId}`, kind: "member", userId: member.userId, invitationId: null, name: member.user.name, email: member.user.email,
      companies: [{ workspaceId: current.id, workspaceName: current.name, role, viewerOwns: viewerOwnsCurrent, isCurrent: true }],
      roleHere: role, isViewer, createdAt: member.createdAt.toISOString(), expiresAt: null, expired: false, orgRole: null,
    }
    if (viewerOwnsCurrent || isViewer) row.bank = (member.bankName && member.bankAccountNumber) ? { bankName: member.bankName, lastFour: member.bankAccountNumber.slice(-4) } : null
    rows.push(row)
  }
  if (current.kind !== "personal") {
    const senders = invitations.length ? await unscoped(() => prisma.user.findMany({ where: { id: { in: [...new Set(invitations.map((invitation) => invitation.sentById))] } }, select: { id: true, name: true, email: true } })) : []
    const senderName = new Map(senders.map((sender) => [sender.id, sender.name || sender.email]))
    for (const invitation of invitations) {
      const role = asRole(invitation.role)
      rows.push({
        key: `inv:${invitation.id}`, kind: "invited", userId: null, invitationId: invitation.id, name: null, email: invitation.email,
        companies: [{ workspaceId: current.id, workspaceName: current.name, role, viewerOwns: viewerOwnsCurrent, isCurrent: true }],
        roleHere: role, isViewer: false, createdAt: invitation.createdAt.toISOString(), expiresAt: invitation.expiresAt.toISOString(), expired: invitation.expiresAt < new Date(),
        orgRole: null, sentBy: senderName.get(invitation.sentById) ?? null, viewerOwnsPrimary: viewerOwnsCurrent, primaryWorkspaceName: current.name,
      })
    }
  }
  return {
    mode: current.kind === "personal" ? "personal" : "team", rows,
    ownedCompanies: viewerOwnsCurrent && current.kind !== "personal" ? [{ workspaceId: current.id, name: current.name }] : [],
    unownedCompanies: [], ownersByCompany: owners, organizationName: null, hiddenCompanyCount: 0, currentCompany,
  }
}

/** The pane's row: the same shape, re-read for one key. Scoped to the intersection of the target's
 * companies with the viewer's (spec §2 `loadUserDetailAction`). Returns null when the viewer shares
 * no company with the target (→ `not_found`). */
export async function loadUserRow(current: Current, viewer: Viewer, key: string): Promise<UserRow | null> {
  const page = await loadUsersPage(current, viewer)
  return page.rows.find((row) => row.key === key) ?? null
}

