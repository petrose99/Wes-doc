import { getCurrentUser } from "@/lib/auth"
import { listWorkspaceBills, type BillRow } from "@/models/bills"
import { getMinConfidencePercent } from "@/models/automation-config"
import { listApprovalWorkflows } from "@/models/approval-workflows"
import { getWorkspaceCapabilities } from "@/lib/modules/capabilities"
import { requireWorkspaceRole, type WorkspaceRole } from "@/models/workspaces"
import { listSavedViews } from "@/models/saved-views"
import { getSavedFieldTable } from "@/models/field-configs"
import { createSavedViewAction, deleteSavedViewAction, duplicateSavedViewAction, renameSavedViewAction, saveFiltersToViewAction, shareSavedViewAction } from "@/app/(app)/workspaces/[workspaceId]/(chrome)/saved-views-actions"
import { InvoiceQueue } from "@/components/queue/invoice-queue"
import { QueueStat } from "@/components/queue/queue-stat"
import { SavedViewPicker } from "@/components/typed-destinations/saved-view-picker"
import { getTouchlessRateTrend } from "@/lib/analytics/workspace-analytics"
import type { AgingBucket } from "@/lib/bills/due-date"

export const dynamic = "force-dynamic"

export type InvoiceSearchParams = { blocked?: string; unpaid?: string; status?: string; approval?: string; touchless?: string; aging?: string; po?: string; view?: string; sort?: string }

/** #225: Invoices on the Queue screen. Filters stay plain URL params (shareable, refreshable,
 * saveable as a view); the aging chip group filters here after the fetch since `agingBucket` is
 * derived per row, and the per-bucket totals now live on the Dashboard. */
export async function InvoicesQueuePage({ params, searchParams, selectedDocumentId = null }: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<InvoiceSearchParams>
  selectedDocumentId?: string | null
}) {
  const { workspaceId } = await params
  const { blocked, unpaid, status, approval, touchless, aging, po, view: selectedViewId } = await searchParams
  const user = await getCurrentUser()
  const membership = await requireWorkspaceRole(workspaceId, user.id)

  const onlyBlocked = blocked === "1"
  const onlyUnpaid = unpaid === "1"
  const onlyTouchless = touchless === "1"
  // #258: the five processing-state keys plus the ledger's synced/paid. A stale "unreviewed"/
  // "reviewed" value from an old URL just doesn't match — the chip shows nothing selected.
  const statusFilter = status === "cancelled" || status === "needs_attention" || status === "in_review" || status === "touchless" || status === "approved" || status === "synced" || status === "paid" ? status : undefined
  const approvalFilter: BillRow["approvalStatus"] | undefined =
    approval === "not_started" || approval === "in_progress" || approval === "approved" || approval === "rejected" || approval === "cancelled" ? approval : undefined
  const agingFilter = new Set((aging ?? "").split(",").filter((value): value is AgingBucket | "none" => ["current", "1-30", "31-60", "61-90", "90+", "none"].includes(value)))
  const poFilter = po === "matched" || po === "none" || po === "mismatch" ? po : undefined
  const basePath = `/workspaces/${workspaceId}/invoices`
  const capabilities = await getWorkspaceCapabilities(workspaceId)
  const workflowsEnabled = capabilities.has("approval-workflows")
  const [{ bills: allBills }, minConfidencePercent, savedViews, touchlessTrend, fieldTable, approvalWorkflows] = await Promise.all([
    listWorkspaceBills({ workspaceId, onlyBlocked, onlyUnpaid, statusFilter, approvalFilter, onlyTouchless, poFilter }),
    getMinConfidencePercent(workspaceId),
    listSavedViews({ workspaceId, viewKey: "invoices", userId: user.id }),
    getTouchlessRateTrend(workspaceId),
    // #252: Admin › Configuration › Fields, when an owner has saved one for invoices.
    getSavedFieldTable(workspaceId, "invoice"),
    // #236: "Start Approval" on the bulk-action bar needs the workspace's active workflows to
    // offer a choice from — empty when the module is off, which hides the Approval ▾ control.
    workflowsEnabled ? listApprovalWorkflows(workspaceId, { activeOnly: true }) : Promise.resolve([]),
  ])
  const bills = agingFilter.size === 0 ? allBills : allBills.filter((bill) => agingFilter.has(bill.agingBucket ?? "none"))
  const currentViewFilters: Record<string, string> = {
    ...(onlyBlocked ? { blocked: "1" } : {}), ...(onlyUnpaid ? { unpaid: "1" } : {}),
    ...(onlyTouchless ? { touchless: "1" } : {}), ...(statusFilter ? { status: statusFilter } : {}),
    ...(approvalFilter ? { approval: approvalFilter } : {}), ...(agingFilter.size ? { aging: [...agingFilter].join(",") } : {}),
    ...(poFilter ? { po: poFilter } : {}),
  }

  const trend = touchlessTrend.trend ? `${touchlessTrend.trend.deltaPercentagePoints > 0 ? "+" : ""}${touchlessTrend.trend.deltaPercentagePoints}pt` : null

  return <InvoiceQueue
    workspaceId={workspaceId}
    basePath={basePath}
    bills={bills}
    minConfidencePercent={minConfidencePercent}
    fieldTable={fieldTable}
    availableWorkflows={approvalWorkflows.map((workflow) => ({ id: workflow.id, name: workflow.name, stageCount: workflow.stages.length }))}
    initialSelectedId={selectedDocumentId}
    stat={<QueueStat label="Touchless" value={`${Math.round(touchlessTrend.touchlessRate * 100)}%`}
      detail={`${touchlessTrend.totalPushedTouchless} of ${touchlessTrend.totalExtracted} sent without review, last 30 days${trend ? `, ${trend} vs. prior 30` : ""}`}
      trend={touchlessTrend.trend?.direction ?? null} />}
    views={<SavedViewPicker views={savedViews} selectedViewId={selectedViewId ?? null} currentFilters={currentViewFilters}
      currentUserId={user.id} currentUserRole={membership.role as WorkspaceRole}
      createAction={createSavedViewAction.bind(null, workspaceId, "invoices", basePath)}
      duplicateAction={duplicateSavedViewAction.bind(null, workspaceId, "invoices", basePath)}
      renameAction={renameSavedViewAction.bind(null, workspaceId, basePath)}
      saveFiltersAction={saveFiltersToViewAction.bind(null, workspaceId, basePath)}
      deleteAction={deleteSavedViewAction.bind(null, workspaceId, basePath)}
      shareAction={shareSavedViewAction.bind(null, workspaceId, basePath)} />}
    // #261: the phone filter row's Views select — the same picker, `variant="select"`.
    viewsPhone={<SavedViewPicker variant="select" views={savedViews} selectedViewId={selectedViewId ?? null} currentFilters={currentViewFilters}
      currentUserId={user.id} currentUserRole={membership.role as WorkspaceRole}
      createAction={createSavedViewAction.bind(null, workspaceId, "invoices", basePath)}
      duplicateAction={duplicateSavedViewAction.bind(null, workspaceId, "invoices", basePath)}
      renameAction={renameSavedViewAction.bind(null, workspaceId, basePath)}
      saveFiltersAction={saveFiltersToViewAction.bind(null, workspaceId, basePath)}
      deleteAction={deleteSavedViewAction.bind(null, workspaceId, basePath)}
      shareAction={shareSavedViewAction.bind(null, workspaceId, basePath)} />} />
}

export default function InvoicesPage({ params, searchParams }: { params: Promise<{ workspaceId: string }>; searchParams: Promise<InvoiceSearchParams> }) {
  return InvoicesQueuePage({ params, searchParams })
}
