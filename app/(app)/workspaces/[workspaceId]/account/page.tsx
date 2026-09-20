import { ChevronRight } from "lucide-react"
import Link from "next/link"
import { AdminPage } from "@/components/admin/admin-ui"
import { Panel } from "@/components/automation/automation-ui"
import { BankDetailsPanel } from "@/components/account/bank-details-panel"
import { ResetTourButton } from "@/components/onboarding/reset-tour-button"
import { HowItWorksButton } from "@/components/shell/how-it-works"
import { ApprovalEmailsControl } from "@/components/shell/approval-emails"
import { SignOutButton } from "@/components/shell/sign-out-button"
import { accountPaths } from "@/lib/admin/paths"
import { getCurrentUser } from "@/lib/auth"
import config from "@/lib/config"
import { getWorkspaceMembership, getWorkspacesForUser } from "@/models/workspaces"

export const dynamic = "force-dynamic"

/** #231 Q18 (#252): the phone's fourth tab, Account — who you are, Security, switching
 * company, How DocuBite works (#264), sign out. Admin is a desktop area; this is what a phone needs of
 * it. Reachable on desktop too, from the account menu's Security entry. */
export default async function AccountPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  const user = await getCurrentUser()
  const workspaces = await getWorkspacesForUser(user.id)
  const membership = await getWorkspaceMembership(workspaceId, user.id)
  const bank = membership?.bankName && membership.bankAccountNumber ? { bankName: membership.bankName, lastFour: membership.bankAccountNumber.slice(-4) } : null
  const roleWord = (role?: string) => role === "owner" ? "Owner" : role === "reviewer" ? "Reviewer" : "Member"

  return <AdminPage title="Account" intro={<>{user.name || user.email}{user.name && <span className="text-slate-500"> · {user.email}</span>}</>} phoneNote={false}>
    <Panel title="Security" note="Two-factor authentication and your signed-in sessions.">
      <Link href={accountPaths(workspaceId).security} className="inline-flex min-h-11 items-center text-sm font-medium text-emerald-700 underline-offset-2 hover:underline">Open Security</Link>
    </Panel>

    {/* #295 spec §5: self-service — the same fields admin edits for a member, scoped to `self`. */}
    <Panel title="Bank details" note="Used to pay out your reimbursement claims.">
      <BankDetailsPanel workspaceId={workspaceId} userId={user.id} bank={bank} />
    </Panel>

    {/* #271 spec §4: the phone home of the Approval-emails switch (the desktop home is the account menu's dialog). */}
    <Panel title="Approval emails">
      <ApprovalEmailsControl workspaceId={workspaceId} initial={user.approvalNoticeEmails} switchId="approval-emails-switch-panel" />
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
    <Panel title="Also in this company" note="The rest of what this company holds.">
      <ul className="divide-y divide-hairline-soft">
        {[
          { label: "Search", href: `/workspaces/${workspaceId}/search` },
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

    <Panel title="How DocuBite works" note="The four steps every invoice goes through, from adding it to posting it.">
      <HowItWorksButton />
    </Panel>

    {/* This is the tour's last mount; removing it is #263's call (owner sign-off), not #264's. */}
    <Panel title="Welcome tour" note="Show the introduction to the workspace layout again.">
      <ResetTourButton workspaceId={workspaceId} />
    </Panel>

    <Panel title="Sign out">
      <SignOutButton />
    </Panel>
  </AdminPage>
}
