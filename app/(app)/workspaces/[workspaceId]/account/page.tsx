import { ChevronRight } from "lucide-react"
import Link from "next/link"
import { AdminPage } from "@/components/admin/admin-ui"
import { Panel } from "@/components/automation/automation-ui"
import { ResetTourButton } from "@/components/onboarding/reset-tour-button"
import { SignOutButton } from "@/components/shell/sign-out-button"
import { accountPaths } from "@/lib/admin/paths"
import { getCurrentUser } from "@/lib/auth"
import config from "@/lib/config"
import { getWorkspacesForUser } from "@/models/workspaces"

export const dynamic = "force-dynamic"

/** #231 Q18 (#252): the phone's fourth tab, Account — who you are, Security, switching
 * company, the welcome tour, sign out. Admin is a desktop area; this is what a phone needs of
 * it. Reachable on desktop too, from the account menu's Security entry. */
export default async function AccountPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  const user = await getCurrentUser()
  const workspaces = await getWorkspacesForUser(user.id)
  const roleWord = (role?: string) => role === "owner" ? "Owner" : role === "reviewer" ? "Reviewer" : "Member"

  return <AdminPage title="Account" intro={<>{user.name || user.email}{user.name && <span className="text-slate-500"> · {user.email}</span>}</>} phoneNote={false}>
    <Panel title="Security" note="Two-factor authentication and your signed-in sessions.">
      <Link href={accountPaths(workspaceId).security} className="inline-flex min-h-11 items-center text-sm font-medium text-emerald-700 underline-offset-2 hover:underline">Open Security</Link>
    </Panel>

    <Panel title="Switch company" note="Every company you belong to.">
      <ul className="divide-y divide-hairline-soft">
        {workspaces.map((workspace) => {
          const current = workspace.id === workspaceId
          return <li key={workspace.id} className="flex min-h-12 items-center justify-between gap-4 py-2 first:pt-0">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-900">{workspace.name}</p>
              <p className="text-xs text-slate-600">{workspace.kind === "personal" ? "Personal" : roleWord(workspace.members[0]?.role)}</p>
            </div>
            {current
              ? <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-900">Current</span>
              : <Link href={`/workspaces/${workspace.id}/invoices`} className="inline-flex min-h-11 items-center text-sm font-medium text-emerald-700 underline-offset-2 hover:underline">Open</Link>}
          </li>
        })}
      </ul>
    </Panel>

    {/* #257 S4 (`organize`): the phone's only path to every other queue below `md` — reachable,
        never dead (#232). Visible at every width: harmless on desktop, where the rail already
        lists these; not `md:hidden` because Account is one page, not two. Payments (#251) is
        deliberately absent — that queue's decisions are owner-scoped to desktop for now. */}
    <Panel title="Also in this workspace" note="The rest of what this workspace holds.">
      <ul className="divide-y divide-hairline-soft">
        {[
          { label: "Purchase Orders", href: `/workspaces/${workspaceId}/purchase-orders` },
          { label: "Receipts", href: `/workspaces/${workspaceId}/receipts` },
          { label: "Bank Statements", href: `/workspaces/${workspaceId}/bank-statements` },
          { label: "Archive", href: `/workspaces/${workspaceId}/library` },
          ...(config.integrations.bigcapital.enabled ? [{ label: "Finance", href: `/workspaces/${workspaceId}/finance` }] : []),
        ].map((item) => <li key={item.href}>
          <Link href={item.href} className="flex min-h-12 items-center justify-between gap-2 py-2 text-sm font-medium text-slate-900 hover:text-emerald-700">
            {item.label}
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
          </Link>
        </li>)}
      </ul>
    </Panel>

    <Panel title="Welcome tour" note="Show the introduction to the workspace layout again.">
      <ResetTourButton workspaceId={workspaceId} />
    </Panel>

    <Panel title="Sign out">
      <SignOutButton />
    </Panel>
  </AdminPage>
}
