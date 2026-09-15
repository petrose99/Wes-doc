import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getCurrentUser } from "@/lib/auth"
import { listWorkspaceBills, type BillRow } from "@/models/bills"
import { getMinConfidencePercent } from "@/models/automation-config"
import { requireWorkspaceRole, type WorkspaceRole } from "@/models/workspaces"
import { listSavedViews } from "@/models/saved-views"
import { createSavedViewAction, deleteSavedViewAction, duplicateSavedViewAction, renameSavedViewAction, saveFiltersToViewAction, shareSavedViewAction } from "../saved-views-actions"
import { preparePaymentRunAction } from "./actions"
import { redirect } from "next/navigation"
import { ListScreenShell } from "@/components/list-screen/list-screen-shell"
import { SyncedStageHeader } from "@/components/pipeline/synced-stage-header"
import { InvoiceFilterChips } from "@/components/typed-destinations/invoice-filter-chips"
import { InvoiceTable } from "@/components/typed-destinations/invoice-table"
import { formatPercent, MetricStrip } from "@/components/typed-destinations/metric-strip"
import { SavedViewPicker } from "@/components/typed-destinations/saved-view-picker"
import { getTouchlessRateTrend } from "@/lib/analytics/workspace-analytics"

export const dynamic = "force-dynamic"

/** WP-AP2 / #211: AP aging / bills cockpit, rendered on the shared list-screen shell. One page a
 * controller can open to see every invoice this workspace has extracted, filterable by Status and
 * Invoice Approval, with payment status from the ledger sync and a "blocked by check" flag
 * surfaced on every row. #213 adds row selection and the Approve/Export/Prepare payment
 * run/Delete bulk bar; opening a row still navigates to the standalone detail page — in-place
 * split-pane row expansion is #214, split off from #213. */
export async function BillsPage({ params, searchParams, pathSegment = "invoices", title = "Invoices" }: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<{ blocked?: string; unpaid?: string; status?: string; approval?: string; touchless?: string; view?: string }>
  pathSegment?: string
  title?: string
}) {
  const { workspaceId } = await params
  const { blocked, unpaid, status, approval, touchless, view: selectedViewId } = await searchParams
  const user = await getCurrentUser()
  const membership = await requireWorkspaceRole(workspaceId, user.id)
  const isOwner = membership.role === "owner"

  const onlyBlocked = blocked === "1"
  const onlyUnpaid = unpaid === "1"
  const onlyTouchless = touchless === "1"
  const statusFilter = status === "unreviewed" || status === "reviewed" || status === "synced" || status === "paid" ? status : undefined
  const approvalFilter: BillRow["approvalStatus"] | undefined =
    approval === "not_started" || approval === "in_progress" || approval === "approved" || approval === "rejected" || approval === "cancelled" ? approval : undefined
  const basePath = `/workspaces/${workspaceId}/${pathSegment}`
  const [{ bills, summary }, minConfidencePercent, savedViews, touchlessTrend] = await Promise.all([
    listWorkspaceBills({ workspaceId, onlyBlocked, onlyUnpaid, statusFilter, approvalFilter, onlyTouchless }),
    getMinConfidencePercent(workspaceId),
    listSavedViews({ workspaceId, viewKey: "invoices", userId: user.id }),
    getTouchlessRateTrend(workspaceId),
  ])
  const currentViewFilters: Record<string, string> = {
    ...(onlyBlocked ? { blocked: "1" } : {}), ...(onlyUnpaid ? { unpaid: "1" } : {}),
    ...(onlyTouchless ? { touchless: "1" } : {}), ...(statusFilter ? { status: statusFilter } : {}),
    ...(approvalFilter ? { approval: approvalFilter } : {}),
  }
  // Only bills with a total AND an unblocked status are candidates for a payment run. #220: a
  // cancelled invoice is excluded too — there's nothing left to pay once cancelled. "synced"
  // (pushed but unconfirmed by the ledger) stays eligible, unchanged from before #220 gave that
  // state a name: it was already absent from the ["paid","reconciled"] exclusion list.
  const payableBills = bills.filter((b) => !b.blockedByCheck && !b.cancelledAt && b.total !== null && b.total > 0 && (!b.paymentStatus || !["paid", "reconciled"].includes(b.paymentStatus.toLowerCase())))
  const preparePaymentRunActionBound = preparePaymentRunAction.bind(null, workspaceId)
  const payableDocumentIds = isOwner ? payableBills.map((bill) => bill.documentId) : []
  const hasFilter = onlyBlocked || onlyUnpaid || !!statusFilter || !!approvalFilter || onlyTouchless

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
    beforeToolbar={<>
      <MetricStrip label="Touchless rate" value={formatPercent(touchlessTrend.touchlessRate)}
        sampleLabel={`${touchlessTrend.totalPushedTouchless} of ${touchlessTrend.totalExtracted}, last 30 days`}
        trend={touchlessTrend.trend ? { direction: touchlessTrend.trend.direction, deltaLabel: `${touchlessTrend.trend.deltaPercentagePoints > 0 ? "+" : ""}${touchlessTrend.trend.deltaPercentagePoints}pt vs. prior 30 days` } : null} />
      <SyncedStageHeader workspaceId={workspaceId} summary={summary} currency="USD" showLink={false} />
    </>}
    toolbar={<InvoiceFilterChips basePath={basePath} status={statusFilter} approval={approvalFilter}
      extraParams={{ blocked: onlyBlocked ? "1" : undefined, unpaid: onlyUnpaid ? "1" : undefined, touchless: onlyTouchless ? "1" : undefined }}
      leading={<SavedViewPicker views={savedViews} selectedViewId={selectedViewId ?? null} currentFilters={currentViewFilters}
        currentUserId={user.id} currentUserRole={membership.role as WorkspaceRole}
        createAction={createSavedViewAction.bind(null, workspaceId, "invoices", basePath)}
        duplicateAction={duplicateSavedViewAction.bind(null, workspaceId, "invoices", basePath)}
        renameAction={renameSavedViewAction.bind(null, workspaceId, basePath)}
        saveFiltersAction={saveFiltersToViewAction.bind(null, workspaceId, basePath)}
        deleteAction={deleteSavedViewAction.bind(null, workspaceId, basePath)}
        shareAction={shareSavedViewAction.bind(null, workspaceId, basePath)} />} />}>
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
            <InvoiceTable workspaceId={workspaceId} basePath={basePath} bills={bills} payableDocumentIds={payableDocumentIds} preparePaymentRunAction={preparePaymentRunActionBound} minConfidencePercent={minConfidencePercent} />
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

