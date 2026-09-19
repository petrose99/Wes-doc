import Link from "next/link"
import config from "@/lib/config"
import { getViewerUser } from "@/lib/auth"
import { getWorkspacesForUser } from "@/models/workspaces"
import { groupWorkspacesByOrg } from "@/lib/workspace-groups"
import { AdminPage } from "@/components/admin/admin-ui"
import { redirect } from "next/navigation"

const ROLE_LABEL: Record<string, string> = { owner: "Owner", reviewer: "Reviewer", member: "Member" }

/** `/workspaces` resolves the user's workspace and forwards to its Files list when there is only
 * one to resolve — but at 2+ memberships (#287) there's a real choice to make, so it renders a
 * plain Companies picker instead of guessing which one to forward to. `/` is the home page and no
 * longer forwards, so this is the entry point used after login and by the Stripe return URLs
 * (lib/config.ts).
 *
 * A brand-new user (zero memberships — never an invited member, since accepting an invitation
 * already creates one) is sent to the industry picker instead of getting a silently-created
 * "general" workspace: /workspaces/new is what actually creates it, with an industry chosen
 * instead of defaulted. getOrCreateWorkspaceForUser's own lazy-creation fallback (models/workspaces.ts)
 * still exists as a safety net for any other path that resolves a workspace outside this page.
 *
 * Goes through getViewerUser rather than a bare session read: this is the very first page a
 * brand-new sign-up or a just-migrated user's first post-reset login lands on, and provisioning
 * the local User row only happens inside getViewerUser's resolveOrProvisionUser call — reading
 * the session directly here, as under better-auth (which auto-created the row on sign-in itself),
 * would find no row yet and bounce straight back to login. */
export default async function WorkspacesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getViewerUser()
  if (!user) redirect(config.auth.loginUrl)
  const memberships = await getWorkspacesForUser(user.id)
  const { notice, name } = await searchParams
  const noticeQuery = typeof notice === "string" && typeof name === "string" ? `?notice=${notice}&name=${encodeURIComponent(name)}` : ""
  if (!memberships.length) redirect(`/workspaces/new${noticeQuery}`)
  if (memberships.length <= 1) redirect(`/workspaces/${memberships[0].id}${noticeQuery}`)

  const groups = groupWorkspacesByOrg(memberships.map((membership) => ({
    id: membership.id,
    name: membership.name,
    kind: membership.kind,
    role: membership.members[0]?.role,
    organizationId: membership.organizationId,
    organizationName: membership.organization?.name,
  })))

  return <AdminPage title="Companies" intro="Choose a company to open.">
    <ul className="space-y-6">
      {groups.map((group) => <li key={group.key}>
        {group.label && <p className="pb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          {group.label}{group.workspaces.length > 1 && ` · ${group.workspaces.length} companies`}
        </p>}
        <ul className="divide-y divide-hairline rounded-lg border border-hairline">
          {group.workspaces.map((workspace) => <li key={workspace.id}>
            <Link href={`/workspaces/${workspace.id}${noticeQuery}`}
              className="flex items-center justify-between gap-4 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50">
              <span className="truncate font-medium text-slate-900">{workspace.name}</span>
              {workspace.role && <span className="shrink-0 text-xs text-slate-400">{ROLE_LABEL[workspace.role] || workspace.role}</span>}
            </Link>
          </li>)}
        </ul>
      </li>)}
    </ul>
  </AdminPage>
}

export const dynamic = "force-dynamic"
