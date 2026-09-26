"use server"

import { revalidatePath } from "next/cache"
import type { ActionState } from "@/lib/actions"
import { adminPaths } from "@/lib/admin/paths"
import type { CompanyDetailRow, CompanyViewerRole } from "@/lib/admin/companies"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { unscoped } from "@/lib/workspace-scope"
import {
  addCompanyToOrganization,
  createOrganization,
  getOrganizationMembership,
  listOrganizationsForUser,
  moveWorkspaceIntoOrganization,
  removeWorkspaceFromOrganization,
  renameOrganization,
} from "@/models/organizations"
import { changeCompanyCurrency } from "@/models/company-currency"
import { getWorkspaceMembership } from "@/models/workspaces"

/** #285 spec §2 gating rule. Header writes (create organization, add, move) need *owner of the
 * route workspace*; pane writes (remove) need *owner of the target row* and the target in the
 * route workspace's organization; the pane read needs any WorkspaceMember row on the target.
 * Every refusal is a named code from `lib/admin/companies.ts` — the client maps, never parses.
 * Rename / Delete / Leave / Create team workspace reuse `workspace-actions.ts` unchanged. */

const NAME_MAX = 80

const code = (error: unknown, fallback: string): string => (error instanceof Error && error.message ? error.message : fallback)

const revalidate = (workspaceId: string) => {
  revalidatePath(adminPaths(workspaceId).companies)
  // The sidebar's company switcher lists organization companies; a plain page revalidate misses it.
  revalidatePath("/workspaces/[workspaceId]", "layout")
}

type WorkspaceHead = { id: string; name: string; kind: string; organizationId: string | null }

const headFor = (workspaceId: string): Promise<WorkspaceHead | null> =>
  unscoped(() => prisma.workspace.findUnique({ where: { id: workspaceId }, select: { id: true, name: true, kind: true, organizationId: true } }))

async function roleOn(workspaceId: string, userId: string): Promise<CompanyViewerRole | null> {
  const membership = await unscoped(() => getWorkspaceMembership(workspaceId, userId))
  return (membership?.role as CompanyViewerRole | undefined) ?? null
}

const cleanName = (name: string) => name.trim().replace(/\s+/g, " ")

/** Names are compared case-insensitively inside one organization: nothing in the schema makes
 * them unique, and two "Riverside Bakery" rows would be indistinguishable in the list. */
async function companyNameTaken(organizationId: string, name: string, exceptId?: string): Promise<boolean> {
  const clash = await unscoped(() =>
    prisma.workspace.findFirst({ where: { organizationId, name: { equals: name, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true } }),
  )
  return Boolean(clash)
}

/* ------------------------------------------------------------------------------- read --- */

/** The pane's row (spec §5). Any member of the target sees it; `not_found` covers a missing
 * workspace, a personal one and one outside the route's organization alike — the notice for a
 * dead deep link is nameless, so the client needs no finer distinction here. */
export async function loadCompanyDetailAction(workspaceId: string, targetId: string): Promise<ActionState<CompanyDetailRow>> {
  const user = await getCurrentUser()
  const route = await headFor(workspaceId)
  if (!route?.organizationId) return { success: false, error: "not_in_organization" }
  const role = await roleOn(targetId, user.id)
  if (!role) return { success: false, error: "not_found" }
  const target = await unscoped(() =>
    prisma.workspace.findFirst({
      where: { id: targetId, kind: "team", organizationId: route.organizationId },
      select: {
        id: true, name: true, country: true, baseCurrency: true, jurisdictionCode: true, createdAt: true,
        _count: { select: { members: true } },
        members: { where: { role: "owner" }, select: { user: { select: { name: true, email: true } } } },
      },
    }),
  )
  if (!target) return { success: false, error: "not_found" }
  return {
    success: true,
    data: {
      id: target.id,
      name: target.name,
      country: target.country,
      baseCurrency: target.baseCurrency,
      jurisdictionCode: target.jurisdictionCode ?? null,
      memberCount: target._count.members,
      viewerRole: role,
      isCurrent: target.id === workspaceId,
      createdAt: target.createdAt.toISOString(),
      owners: target.members.map((member) => member.user.name || member.user.email),
    },
  }
}

/* ---------------------------------------------------------------------- header writes --- */

/** State (b) → (a) (spec §3.3): names an organization and makes the route workspace its first
 * company. `name_taken` when the caller already belongs to an organization of that name. */
export async function createOrganizationAction(workspaceId: string, input: { name: string }): Promise<ActionState<{ organizationId: string; name: string }>> {
  const user = await getCurrentUser()
  const name = cleanName(input.name)
  if (!name || name.length > NAME_MAX) return { success: false, error: "name_required" }
  if ((await roleOn(workspaceId, user.id)) !== "owner") return { success: false, error: "owner_required" }
  const route = await headFor(workspaceId)
  if (!route) return { success: false, error: "not_found" }
  if (route.kind !== "team") return { success: false, error: "personal_workspace" }
  if (route.organizationId) return { success: false, error: "already_grouped" }
  const mine = await listOrganizationsForUser(user.id)
  if (mine.some((org) => org.name.localeCompare(name, undefined, { sensitivity: "accent" }) === 0)) return { success: false, error: "name_taken" }
  try {
    const organization = await createOrganization(name, user.id)
    await moveWorkspaceIntoOrganization(workspaceId, organization.id, user.id)
    revalidate(workspaceId)
    return { success: true, data: { organizationId: organization.id, name: organization.name } }
  } catch (error) { return { success: false, error: code(error, "failed") } }
}

/** Spec §4.1. Owner of the route workspace only; the new company lands in its organization with
 * the caller as owner. Country/currency default to the route workspace's when omitted. */
export async function addCompanyAction(workspaceId: string, input: { name: string; country?: string; baseCurrency?: string }): Promise<ActionState<{ workspaceId: string; name: string }>> {
  const user = await getCurrentUser()
  const name = cleanName(input.name)
  if (!name || name.length > NAME_MAX) return { success: false, error: "name_required" }
  if ((await roleOn(workspaceId, user.id)) !== "owner") return { success: false, error: "owner_required" }
  const route = await headFor(workspaceId)
  if (!route?.organizationId) return { success: false, error: "not_in_organization" }
  if (await companyNameTaken(route.organizationId, name)) return { success: false, error: "name_taken" }
  try {
    const defaults = await unscoped(() => prisma.workspace.findUnique({ where: { id: workspaceId }, select: { country: true, baseCurrency: true } }))
    const created = await addCompanyToOrganization(route.organizationId, user.id, {
      name,
      country: input.country?.trim() || defaults?.country,
      baseCurrency: input.baseCurrency?.trim() || defaults?.baseCurrency,
    })
    revalidate(workspaceId)
    return { success: true, data: { workspaceId: created.id, name: created.name } }
  } catch (error) { return { success: false, error: code(error, "failed") } }
}

/** Spec §4.2. Owner of the route workspace *and* of the target; the target must be an ungrouped
 * team workspace. `already_grouped` is the race where someone else moved it first. */
export async function moveCompanyIntoOrganizationAction(workspaceId: string, targetId: string): Promise<ActionState<{ workspaceId: string; name: string }>> {
  const user = await getCurrentUser()
  if ((await roleOn(workspaceId, user.id)) !== "owner") return { success: false, error: "owner_required" }
  const route = await headFor(workspaceId)
  if (!route?.organizationId) return { success: false, error: "not_in_organization" }
  const target = await headFor(targetId)
  if (!target) return { success: false, error: "not_found" }
  if (target.kind !== "team") return { success: false, error: "personal_workspace" }
  if ((await roleOn(targetId, user.id)) !== "owner") return { success: false, error: "owner_required" }
  if (target.organizationId) return { success: false, error: "already_grouped" }
  if (await companyNameTaken(route.organizationId, target.name)) return { success: false, error: "name_taken" }
  try {
    await moveWorkspaceIntoOrganization(targetId, route.organizationId, user.id)
    revalidate(workspaceId)
    return { success: true, data: { workspaceId: target.id, name: target.name } }
  } catch (error) { return { success: false, error: code(error, "failed") } }
}

/* ------------------------------------------------------------------------ pane writes --- */

/** Spec §4.3. Owner of the *target row*, target in the route's organization, and never the route
 * workspace itself — the client disables that with a reason; the server refuses it too. */
export async function removeCompanyFromOrganizationAction(workspaceId: string, targetId: string): Promise<ActionState<{ workspaceId: string; name: string }>> {
  const user = await getCurrentUser()
  const route = await headFor(workspaceId)
  if (!route?.organizationId) return { success: false, error: "not_in_organization" }
  if (!(await roleOn(workspaceId, user.id))) return { success: false, error: "not_found" }
  const target = await headFor(targetId)
  if (!target || target.kind !== "team") return { success: false, error: "not_found" }
  if (target.organizationId !== route.organizationId) return { success: false, error: "not_in_organization" }
  if (targetId === workspaceId) return { success: false, error: "is_current" }
  if ((await roleOn(targetId, user.id)) !== "owner") return { success: false, error: "owner_required" }
  try {
    await removeWorkspaceFromOrganization(targetId, user.id)
    revalidate(workspaceId)
    return { success: true, data: { workspaceId: target.id, name: target.name } }
  } catch (error) { return { success: false, error: code(error, "failed") } }
}

/** #457 spec §1, §9.3. Owner of the target company only; the target is the route workspace itself
 * (Admin › Integrations' Switch) or a company in the route's organization (Companies pane). The
 * lock, the pair and a push in flight are re-checked under the row lock in the model; each refusal
 * is a named code (`company_currency_*`, mapped in action-helpers.ts). */
export async function changeCompanyCurrencyAction(workspaceId: string, companyId: string, currency: string): Promise<ActionState<{ count: number }>> {
  const user = await getCurrentUser()
  if (companyId !== workspaceId) {
    const [route, target] = await Promise.all([headFor(workspaceId), headFor(companyId)])
    if (!route?.organizationId || target?.organizationId !== route.organizationId) return { success: false, error: "not_found" }
  }
  if ((await roleOn(companyId, user.id)) !== "owner") return { success: false, error: "owner_required" }
  try {
    const result = await changeCompanyCurrency(companyId, currency.trim().toUpperCase(), user.id)
    revalidate(workspaceId)
    revalidatePath(`${adminPaths(workspaceId).companies}/${companyId}`)
    revalidatePath(adminPaths(companyId).integrations)
    return { success: true, data: result }
  } catch (error) { return { success: false, error: code(error, "failed") } }
}

/* --------------------------------------------------------------------------- org admin --- */

/** #301: the organization's own name, gated on the caller's OrganizationMember role — the only
 * standing "organization admin" carries. Unchanged name is a no-op success (idempotent submit,
 * no toast wording distinction needed); a concurrent rename by another admin just loses the race
 * and this write becomes the name shown, same as any other last-write-wins field. */
export async function renameOrganizationAction(workspaceId: string, input: { name: string }): Promise<ActionState<{ name: string }>> {
  const user = await getCurrentUser()
  const name = cleanName(input.name)
  if (!name || name.length > NAME_MAX) return { success: false, error: "name_required" }
  const route = await headFor(workspaceId)
  if (!route?.organizationId) return { success: false, error: "not_in_organization" }
  const membership = await getOrganizationMembership(route.organizationId, user.id)
  if (membership?.role !== "admin") return { success: false, error: "admin_required" }
  try {
    const organization = await renameOrganization(route.organizationId, name)
    revalidate(workspaceId)
    return { success: true, data: { name: organization.name } }
  } catch (error) { return { success: false, error: code(error, "failed") } }
}
