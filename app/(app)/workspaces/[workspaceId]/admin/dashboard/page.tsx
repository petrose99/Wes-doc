import Link from "next/link"
import { redirect } from "next/navigation"
import { AdminPage } from "@/components/admin/admin-ui"
import { getAdminContext } from "@/lib/admin/context"
import { adminPaths } from "@/lib/admin/paths"
import { listWorkspaceBills } from "@/models/bills"
import { countInvoiceApprovalsReadyToApprove, countPoMismatchesReadyToApprove, type ApprovalActor } from "@/models/approvals"
import { getWorkspacesForUser } from "@/models/workspaces"

export const dynamic = "force-dynamic"

/** #287: the Admin Dashboard — one row per company the viewer belongs to, three flat rollup
 * counts (Open invoices, Ready to Approve, Pending PO mismatch approvals). Only reachable at 2+
 * companies (mirrors #242); a direct hit below that redirects to Companies, the existing admin
 * landing (spec "Dashboard nav placement"). Each metric is fetched independently via
 * `Promise.allSettled` so one company's failing query renders "—" in that cell only, never blanks
 * the other companies' rows (B5). */
async function loadCompanyRow(workspaceId: string, name: string, actor: ApprovalActor) {
  const [open, readyToApprove, poMismatch] = await Promise.allSettled([
    listWorkspaceBills({ workspaceId, onlyUnpaid: true }),
    countInvoiceApprovalsReadyToApprove(workspaceId, actor),
    countPoMismatchesReadyToApprove(workspaceId, actor),
  ])
  return {
    id: workspaceId,
    name,
    open: open.status === "fulfilled" ? open.value.bills.length : null,
    readyToApprove: readyToApprove.status === "fulfilled" ? readyToApprove.value : null,
    poMismatch: poMismatch.status === "fulfilled" ? poMismatch.value : null,
  }
}

export default async function AdminDashboardPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  const context = await getAdminContext(workspaceId)
  const memberships = await getWorkspacesForUser(context.user.id)
  const companies = memberships.filter((membership) => membership.kind === "team")
  if (companies.length < 2) redirect(adminPaths(workspaceId).companies)

  const rows = await Promise.all(companies
    .map((company) => ({ id: company.id, name: company.name, role: company.members[0]?.role ?? "member" }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((company) => loadCompanyRow(company.id, company.name, { userId: context.user.id, role: company.role as ApprovalActor["role"] })))

  return <AdminPage title="Dashboard" intro="Rollups across every company you belong to.">
    <RollupTable caption="Open invoices" rows={rows} value={(row) => row.open} />
    <RollupTable caption="Ready to Approve" rows={rows} value={(row) => row.readyToApprove} />
    <RollupTable caption="Pending PO mismatch approvals" rows={rows} value={(row) => row.poMismatch} />
  </AdminPage>
}

function RollupTable<Row extends { id: string; name: string }>({ caption, rows, value }: {
  caption: string
  rows: Row[]
  value: (row: Row) => number | null
}) {
  return <table className="w-full border-collapse text-sm">
    <caption className="mb-2 text-left font-display text-base font-semibold text-slate-900">{caption}</caption>
    <tbody>
      {rows.map((row) => (
        <tr key={row.id} className="border-b border-hairline last:border-0">
          <td className="py-2 pr-4">
            <Link href={`/workspaces/${row.id}`} className="text-slate-700 underline-offset-2 hover:text-emerald-800 hover:underline">{row.name}</Link>
          </td>
          <td className="w-16 py-2 text-right tabular-nums text-slate-900">{value(row) ?? "—"}</td>
        </tr>
      ))}
    </tbody>
  </table>
}
