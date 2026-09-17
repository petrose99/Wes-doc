import { CompaniesQueue, type CompaniesPageState } from "@/components/admin/companies-queue"
import type { CompanyRow } from "@/lib/admin/companies"
import { getAdminContext } from "@/lib/admin/context"
import { unscoped } from "@/lib/workspace-scope"
import { prisma } from "@/lib/db"
import { listOrganizationCompanies, listOwnedUngroupedTeamWorkspaces, organizationCompanyCount } from "@/models/organizations"

export const dynamic = "force-dynamic"

/** #285 (spec §2, §3.3): Admin › Companies as a Queue screen. The current workspace decides the
 * page's state — (a) in an organization: the org's companies the viewer is a member of; (b) an
 * ungrouped team workspace: the "Name your organization" first-use state; (c) a personal
 * workspace: not a company, so the first-use state offers "Create a team workspace". The page
 * always renders; roles gate the controls, never the address. */
export default async function CompaniesPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  const context = await getAdminContext(workspaceId)
  const { workspace, membership, user } = context
  const viewerRole = membership.role === "owner" ? "owner" : membership.role === "reviewer" ? "reviewer" : "member"

  if (workspace.kind === "personal") {
    return <CompaniesQueue workspaceId={workspaceId} state={{ kind: "personal" }} viewerRole={viewerRole} owners={context.owners} />
  }
  if (!workspace.organizationId) {
    return <CompaniesQueue workspaceId={workspaceId} state={{ kind: "ungrouped", workspaceName: workspace.name }} viewerRole={viewerRole} owners={context.owners} />
  }

  const organizationId = workspace.organizationId
  const [organization, companies, orgTotal, ungrouped] = await Promise.all([
    unscoped(() => prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true } })),
    listOrganizationCompanies(organizationId, user.id),
    organizationCompanyCount(organizationId),
    viewerRole === "owner" ? listOwnedUngroupedTeamWorkspaces(user.id) : Promise.resolve([]),
  ])
  const rows: CompanyRow[] = companies.map((company) => ({
    id: company.id,
    name: company.name,
    country: company.country,
    baseCurrency: company.baseCurrency,
    jurisdictionCode: company.jurisdictionCode ?? null,
    memberCount: company._count.members,
    viewerRole: (company.members[0]?.role as CompanyRow["viewerRole"] | undefined) ?? "member",
    isCurrent: company.id === workspaceId,
    createdAt: company.createdAt.toISOString(),
  }))
  const state: CompaniesPageState = {
    kind: "organization",
    organizationName: organization?.name ?? "your organization",
    rows,
    hiddenCount: Math.max(0, orgTotal - rows.length),
    movable: ungrouped.map((candidate) => ({ id: candidate.id, name: candidate.name, memberCount: candidate._count.members })),
  }
  return <CompaniesQueue workspaceId={workspaceId} state={state} viewerRole={viewerRole} owners={context.owners} />
}
