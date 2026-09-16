import Link from "next/link"
import { AdminPage } from "@/components/admin/admin-ui"
import { CompanyNameForm } from "@/components/admin/company-name-form"
import { Panel } from "@/components/automation/automation-ui"
import { WorkspaceDangerZone } from "@/components/workspace/danger-zone"
import { TeamWorkspaceForm } from "@/components/workspace/team-workspace-form"
import { getAdminContext } from "@/lib/admin/context"
import { adminPaths } from "@/lib/admin/paths"
import { getWorkspacesForUser } from "@/models/workspaces"

export const dynamic = "force-dynamic"

/** #231 Q15 (#252): Admin › Companies — the companies this person belongs to, and Add a
 * company (which replaces the old "Create a team workspace" card). The Organization above
 * companies, its explicit creation and the Queue-screen list are #254's; until then this is a
 * plain list with Open, so the address is never a dead end. This company's own facts — its
 * name, and Delete / Leave — sit at the bottom (moved from Users, evaluate H8). */
export default async function CompaniesPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  const context = await getAdminContext(workspaceId)
  const workspaces = await getWorkspacesForUser(context.user.id)
  const companies = workspaces.filter((workspace) => workspace.kind !== "personal" || workspace.id === workspaceId)
  const personal = workspaces.find((workspace) => workspace.kind === "personal")
  const { owner, workspace, membership } = context
  const noun = workspace.kind === "personal" ? "workspace" : "company"
  const roleWord = (role?: string) => role === "owner" ? "Owner" : role === "reviewer" ? "Reviewer" : "Member"

  return <AdminPage title="Companies" intro={<>Each company is its own workspace with its own people, documents and ledger. You are configuring <span className="font-medium text-slate-800">{workspace.name}</span>.</>}>
    <Panel title="Your companies" note={`${companies.length} ${companies.length === 1 ? "company" : "companies"} you belong to.`}>
      {companies.length === 0
        ? <p className="text-sm text-slate-600">No companies yet — add the first one below.</p>
        : <ul className="divide-y divide-hairline-soft">
          {companies.map((workspace) => {
            const current = workspace.id === workspaceId
            return <li key={workspace.id} className="flex items-center justify-between gap-4 py-3 first:pt-0">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">{workspace.name}{current && <span className="ml-2 rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-900">This company</span>}</p>
                <p className="text-xs text-slate-600">{workspace.kind === "personal" ? "Personal workspace · " : ""}{roleWord(workspace.members[0]?.role)}</p>
              </div>
              {current
                ? <span className="text-xs text-slate-600">Open now</span>
                : <Link href={adminPaths(workspace.id).configuration} className="text-sm font-medium text-emerald-700 underline-offset-2 hover:underline" aria-label={`Open ${workspace.name}'s Admin`}>Open</Link>}
            </li>
          })}
        </ul>}
      {personal && <p className="mt-4 max-w-[60ch] text-xs text-slate-600">Your personal workspace stays yours and is never part of an organization.</p>}
    </Panel>

    <Panel title="Add a company" note="A new company starts empty: its own members, documents, ledger and configuration.">
      <TeamWorkspaceForm />
    </Panel>

    {owner && <CompanyNameForm workspaceId={workspaceId} workspaceName={workspace.name} noun={noun} />}
    <WorkspaceDangerZone workspaceId={workspaceId} workspaceName={workspace.name} workspaceKind={workspace.kind} viewerRole={membership.role} />
  </AdminPage>
}
