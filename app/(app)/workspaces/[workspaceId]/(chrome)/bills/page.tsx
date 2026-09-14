import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getCurrentUser } from "@/lib/auth"
import { listWorkspaceBills, type BillRow } from "@/models/bills"
import { requireWorkspaceRole } from "@/models/workspaces"
import { preparePaymentRunAction } from "./actions"
import { redirect } from "next/navigation"
import { ListScreenShell } from "@/components/list-screen/list-screen-shell"
import { SyncedStageHeader } from "@/components/pipeline/synced-stage-header"
import { InvoiceFilterChips } from "@/components/typed-destinations/invoice-filter-chips"
import { InvoiceTable } from "@/components/typed-destinations/invoice-table"

export const dynamic = "force-dynamic"

/** WP-AP2 / #211: AP aging / bills cockpit, rendered on the shared list-screen shell. One page a
 * controller can open to see every invoice this workspace has extracted, filterable by Status and
 * Invoice Approval, with payment status from the ledger sync and a "blocked by check" flag
 * surfaced on every row. #213 adds row selection and the Approve/Export/Prepare payment
 * run/Delete bulk bar; opening a row still navigates to the standalone detail page — in-place
 * split-pane row expansion is #214, split off from #213. */
export async function BillsPage({ params, searchParams, pathSegment = "invoices", title = "Invoices" }: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<{ blocked?: string; unpaid?: string; status?: string; approval?: string }>
  pathSegment?: string
  title?: string
}) {
  const { workspaceId } = await params
  const { blocked, unpaid, status, approval } = await searchParams
  const user = await getCurrentUser()
  const membership = await requireWorkspaceRole(workspaceId, user.id)
  const isOwner = membership.role === "owner"

  const onlyBlocked = blocked === "1"
  const onlyUnpaid = unpaid === "1"
  const statusFilter = status === "unreviewed" || status === "reviewed" || status === "paid" ? status : undefined
  const approvalFilter: BillRow["approvalStatus"] | undefined =
    approval === "not_started" || approval === "in_progress" || approval === "approved" || approval === "rejected" ? approval : undefined
  const basePath = `/workspaces/${workspaceId}/${pathSegment}`
  const { bills, summary } = await listWorkspaceBills({ workspaceId, onlyBlocked, onlyUnpaid, statusFilter, approvalFilter })
  // Only bills with a total AND an unblocked status are candidates for a payment run.
  const payableBills = bills.filter((b) => !b.blockedByCheck && b.total !== null && b.total > 0 && (!b.paymentStatus || !["paid", "reconciled"].includes(b.paymentStatus.toLowerCase())))
  const preparePaymentRunActionBound = preparePaymentRunAction.bind(null, workspaceId)
  const payableDocumentIds = isOwner ? payableBills.map((bill) => bill.documentId) : []
  const hasFilter = onlyBlocked || onlyUnpaid || !!statusFilter || !!approvalFilter

  return <ListScreenShell
    header={<div className="flex flex-wrap items-end justify-between gap-4 border-b px-6 py-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">Every extracted invoice, filterable by status and approval. Payment status is synced from your ledger.</p>
      </div>
      <div className="flex gap-2 text-sm">
        <FilterLink href={basePath} active={!onlyBlocked && !onlyUnpaid}>All</FilterLink>
        <FilterLink href={`${basePath}?unpaid=1`} active={onlyUnpaid && !onlyBlocked}>Unpaid</FilterLink>
        <FilterLink href={`${basePath}?blocked=1`} active={onlyBlocked && !onlyUnpaid}>Blocked by a check</FilterLink>
      </div>
    </div>}
    beforeToolbar={<SyncedStageHeader workspaceId={workspaceId} summary={summary} currency="USD" showLink={false} />}
    toolbar={<InvoiceFilterChips basePath={basePath} status={statusFilter} approval={approvalFilter}
      extraParams={{ blocked: onlyBlocked ? "1" : undefined, unpaid: onlyUnpaid ? "1" : undefined }} />}>
    <main className="p-6">
      <Card>
        <CardHeader>
          <CardTitle>{bills.length} invoice{bills.length === 1 ? "" : "s"}</CardTitle>
          <CardDescription>Newest first. Select rows for bulk actions, or click one to open its extraction detail.</CardDescription>
        </CardHeader>
        <CardContent>
          {bills.length === 0 ? (
            <p className="text-sm text-muted-foreground">
                {hasFilter
                ? "No invoices match the current filter."
                : "No invoices yet. Invoices appear here once an invoice is extracted and approved."}
            </p>
          ) : (
            <InvoiceTable workspaceId={workspaceId} basePath={basePath} bills={bills} payableDocumentIds={payableDocumentIds} preparePaymentRunAction={preparePaymentRunActionBound} />
          )}
        </CardContent>
      </Card>
    </main>
  </ListScreenShell>
}

export default async function LegacyBillsPage({ params, searchParams }: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<{ blocked?: string; unpaid?: string }>
}) {
  const { workspaceId } = await params
  const { blocked, unpaid } = await searchParams
  const query = new URLSearchParams()
  if (blocked === "1") query.set("blocked", "1")
  if (unpaid === "1") query.set("unpaid", "1")
  const suffix = query.toString() ? `?${query.toString()}` : ""
  redirect(`/workspaces/${workspaceId}/invoices${suffix}`)
}

function FilterLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${active ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
      {children}
    </Link>
  )
}

