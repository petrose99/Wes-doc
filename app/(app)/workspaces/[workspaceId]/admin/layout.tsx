import { AdminLeaveGuard } from "@/components/admin/admin-leave-guard"
import { AdminNav, type AdminNavGroup } from "@/components/admin/admin-nav"
import { getAdminContext } from "@/lib/admin/context"
import { adminPaths } from "@/lib/admin/paths"

/** #231 Q9/Q10/Q20 (#252): the Admin area — one rail item, one left nav with Vic's two groups,
 * one reading column. Replaces Settings' tab strip and Controls' tabs (nothing removed: every
 * old address 308-redirects to its section here). The rail collapses to its icon width on
 * `/admin/*` exactly as on a queue, so the nav and the page get the work area.
 *
 * ORGANIZATION lists Companies and Users; the org-level Dashboard only exists at two or more
 * companies (#231 Q16), which no workspace on this branch has, so it is not a link yet — a link
 * to a screen that cannot open is a dead end. Approval Flows and PO Mismatch Flows carry the
 * pages that moved from Controls; #253 fills in the rest. */
export default async function AdminLayout({ children, params }: { children: React.ReactNode; params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  const context = await getAdminContext(workspaceId)
  const paths = adminPaths(workspaceId)
  const hasTouchless = context.capabilities.has("touchless-automation")
  const hasTax = context.capabilities.has("jurisdiction")

  const groups: AdminNavGroup[] = [
    { caption: "Organization", items: [
      { href: paths.companies, label: "Companies" },
      { href: paths.users, label: "Users" },
    ] },
    { caption: context.workspace.name, items: [
      { href: paths.configuration, label: "Configuration", children: [
        { href: paths.fields, label: "Fields" },
        ...(hasTouchless ? [{ href: paths.autonomy, label: "Autonomy" }, { href: paths.checks, label: "Checks" }, { href: paths.report, label: "Report" }] : []),
        { href: paths.intake, label: "Intake" },
        ...(hasTax ? [{ href: paths.tax, label: "Tax" }] : []),
        { href: paths.payments, label: "Payments" },
        { href: paths.whatsOn, label: "What's on" },
      ] },
      { href: paths.approvalFlows, label: "Approval Flows" },
      { href: paths.poMismatchFlows, label: "PO Mismatch Flows" },
      { href: paths.suppliers, label: "Suppliers" },
      ...(context.integrationsEnabled ? [{ href: paths.integrations, label: "Integrations" }] : []),
    ] },
  ]

  return <div className="flex min-h-0 flex-1 bg-white">
    <AdminLeaveGuard />
    <AdminNav groups={groups} />
    <div className="min-w-0 flex-1">{children}</div>
  </div>
}
