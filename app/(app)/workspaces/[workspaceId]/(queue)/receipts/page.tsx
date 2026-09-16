import { getCurrentUser } from "@/lib/auth"
import { listWorkspaceReceipts } from "@/models/receipts"
import { getMinConfidencePercent } from "@/models/automation-config"
import { requireWorkspaceRole, type WorkspaceRole } from "@/models/workspaces"
import { listSavedViews } from "@/models/saved-views"
import { getSavedFieldTable } from "@/models/field-configs"
import { createSavedViewAction, deleteSavedViewAction, duplicateSavedViewAction, renameSavedViewAction, saveFiltersToViewAction, shareSavedViewAction } from "@/app/(app)/workspaces/[workspaceId]/(chrome)/saved-views-actions"
import { ExpenseClaimsPage } from "@/app/(app)/workspaces/[workspaceId]/(chrome)/expenses/page"
import { ReceiptQueue } from "@/components/queue/receipt-queue"
import { QueueStat } from "@/components/queue/queue-stat"
import { SavedViewPicker } from "@/components/typed-destinations/saved-view-picker"
import { getDocumentMatchRateStats } from "@/lib/analytics/workspace-analytics"

export const dynamic = "force-dynamic"

export type ReceiptSearchParams = { mode?: string; status?: string; claim?: string; touchless?: string; view?: string; sort?: string }

/** #212's Receipts on the Queue screen (#225). "Create expense claim" moved from a header button
 * to the Detail pane's overflow (a row action, per #195); `?mode=claims` still renders the claims
 * workflow, inside the reading column it was built for. */
export async function ReceiptsQueuePage({ params, searchParams, selectedDocumentId = null }: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<ReceiptSearchParams>
  selectedDocumentId?: string | null
}) {
  const { workspaceId } = await params
  const { mode, status, claim, touchless, view: selectedViewId } = await searchParams
  if (mode === "claims") return <div className="mx-auto w-full max-w-4xl p-6">{await ExpenseClaimsPage({ params: Promise.resolve({ workspaceId }) })}</div>

  const user = await getCurrentUser()
  const membership = await requireWorkspaceRole(workspaceId, user.id)
  const basePath = `/workspaces/${workspaceId}/receipts`
  const statusFilter = status === "unreviewed" || status === "reviewed" ? status : undefined
  const claimFilter = claim === "unclaimed" || claim === "claimed" ? claim : undefined
  const onlyTouchless = touchless === "1"
  const [{ receipts }, minConfidencePercent, savedViews, matchRate, fieldTable] = await Promise.all([
    listWorkspaceReceipts({ workspaceId, statusFilter, claimFilter, onlyTouchless }),
    getMinConfidencePercent(workspaceId),
    listSavedViews({ workspaceId, viewKey: "receipts", userId: user.id }),
    getDocumentMatchRateStats(workspaceId, "receipt", ["invoice_to_receipt", "po_to_receipt"]),
    getSavedFieldTable(workspaceId, "receipt"),
  ])
  const currentViewFilters: Record<string, string> = {
    ...(statusFilter ? { status: statusFilter } : {}), ...(claimFilter ? { claim: claimFilter } : {}),
    ...(onlyTouchless ? { touchless: "1" } : {}),
  }

  return <ReceiptQueue
    workspaceId={workspaceId}
    basePath={basePath}
    receipts={receipts}
    minConfidencePercent={minConfidencePercent}
    fieldTable={fieldTable}
    initialSelectedId={selectedDocumentId}
    stat={<QueueStat label="Matched" value={`${Math.round(matchRate.matchRate * 100)}%`} detail={`${matchRate.matched} of ${matchRate.total} receipts reconciled, last 30 days`} />}
    views={<SavedViewPicker views={savedViews} selectedViewId={selectedViewId ?? null} currentFilters={currentViewFilters}
      currentUserId={user.id} currentUserRole={membership.role as WorkspaceRole}
      createAction={createSavedViewAction.bind(null, workspaceId, "receipts", basePath)}
      duplicateAction={duplicateSavedViewAction.bind(null, workspaceId, "receipts", basePath)}
      renameAction={renameSavedViewAction.bind(null, workspaceId, basePath)}
      saveFiltersAction={saveFiltersToViewAction.bind(null, workspaceId, basePath)}
      deleteAction={deleteSavedViewAction.bind(null, workspaceId, basePath)}
      shareAction={shareSavedViewAction.bind(null, workspaceId, basePath)} />} />
}

export default function ReceiptsPage({ params, searchParams }: { params: Promise<{ workspaceId: string }>; searchParams: Promise<ReceiptSearchParams> }) {
  return ReceiptsQueuePage({ params, searchParams })
}
