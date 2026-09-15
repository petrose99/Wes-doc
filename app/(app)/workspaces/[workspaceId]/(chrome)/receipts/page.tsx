import Link from "next/link"
import { Plus } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getCurrentUser } from "@/lib/auth"
import { listWorkspaceReceipts } from "@/models/receipts"
import { getMinConfidencePercent } from "@/models/automation-config"
import { requireWorkspaceRole, type WorkspaceRole } from "@/models/workspaces"
import { listSavedViews } from "@/models/saved-views"
import { createSavedViewAction, deleteSavedViewAction, duplicateSavedViewAction, renameSavedViewAction, saveFiltersToViewAction, shareSavedViewAction } from "../saved-views-actions"
import { ListScreenShell } from "@/components/list-screen/list-screen-shell"
import { ReceiptFilterChips } from "@/components/typed-destinations/receipt-filter-chips"
import { ReceiptTable } from "@/components/typed-destinations/receipt-table"
import { SavedViewPicker } from "@/components/typed-destinations/saved-view-picker"
import { ExpenseClaimsPage } from "../expenses/page"

export const dynamic = "force-dynamic"

/** #212: Receipts, rendered on the shared list-screen shell (part 2 of #197's split, after #211's
 * Invoices). No aging or payment run, since a receipt is already paid at purchase — filterable by
 * Status and Claim state. #213 adds row selection and the Approve/Export/Delete bulk bar; opening
 * a row still navigates to the standalone detail page — in-place split-pane row expansion is
 * #214, split off from #213. "Create expense claim" stays the one row action into the
 * expense-claims workflow (unchanged, absorbed per #195). */
export default async function ReceiptsPage({ params, searchParams }: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<{ mode?: string; status?: string; claim?: string; touchless?: string; view?: string }>
}) {
  const { workspaceId } = await params
  const { mode, status, claim, touchless, view: selectedViewId } = await searchParams
  if (mode === "claims") return ExpenseClaimsPage({ params: Promise.resolve({ workspaceId }) })

  const user = await getCurrentUser()
  const membership = await requireWorkspaceRole(workspaceId, user.id)
  const basePath = `/workspaces/${workspaceId}/receipts`
  const statusFilter = status === "unreviewed" || status === "reviewed" ? status : undefined
  const claimFilter = claim === "unclaimed" || claim === "claimed" ? claim : undefined
  const onlyTouchless = touchless === "1"
  const [{ receipts }, minConfidencePercent, savedViews] = await Promise.all([
    listWorkspaceReceipts({ workspaceId, statusFilter, claimFilter, onlyTouchless }),
    getMinConfidencePercent(workspaceId),
    listSavedViews({ workspaceId, viewKey: "receipts", userId: user.id }),
  ])
  const currentViewFilters: Record<string, string> = {
    ...(statusFilter ? { status: statusFilter } : {}), ...(claimFilter ? { claim: claimFilter } : {}),
    ...(onlyTouchless ? { touchless: "1" } : {}),
  }
  const hasFilter = !!statusFilter || !!claimFilter || onlyTouchless

  return <ListScreenShell
    header={<div className="flex flex-wrap items-end justify-between gap-4 border-b px-6 py-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Receipts</h1>
        <p className="mt-1 text-sm text-slate-500">Every extracted receipt, filterable by status and expense-claim state.</p>
      </div>
      <Link href={`${basePath}?mode=claims`} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2">
        <Plus className="h-4 w-4" />
        Create expense claim
      </Link>
    </div>}
    toolbar={<ReceiptFilterChips basePath={basePath} status={statusFilter} claim={claimFilter}
      extraParams={{ touchless: onlyTouchless ? "1" : undefined }}
      leading={<SavedViewPicker views={savedViews} selectedViewId={selectedViewId ?? null} currentFilters={currentViewFilters}
        currentUserId={user.id} currentUserRole={membership.role as WorkspaceRole}
        createAction={createSavedViewAction.bind(null, workspaceId, "receipts", basePath)}
        duplicateAction={duplicateSavedViewAction.bind(null, workspaceId, "receipts", basePath)}
        renameAction={renameSavedViewAction.bind(null, workspaceId, basePath)}
        saveFiltersAction={saveFiltersToViewAction.bind(null, workspaceId, basePath)}
        deleteAction={deleteSavedViewAction.bind(null, workspaceId, basePath)}
        shareAction={shareSavedViewAction.bind(null, workspaceId, basePath)} />} />}>
    <main className="p-6">
      <Card>
        <CardHeader>
          <CardTitle>{receipts.length} receipt{receipts.length === 1 ? "" : "s"}</CardTitle>
          <CardDescription>Newest first. Click a row to open its extraction detail.</CardDescription>
        </CardHeader>
        <CardContent>
          {receipts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {hasFilter
                ? "No receipts match the current filter."
                : "No receipts yet. Receipts appear here once a receipt is extracted."}
            </p>
          ) : (
            <ReceiptTable workspaceId={workspaceId} basePath={basePath} receipts={receipts} minConfidencePercent={minConfidencePercent} />
          )}
        </CardContent>
      </Card>
    </main>
  </ListScreenShell>
}

