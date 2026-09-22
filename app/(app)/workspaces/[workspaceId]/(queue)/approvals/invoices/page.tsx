import { queueArrival } from "@/lib/navigation/origin-server"
import { getCurrentUser } from "@/lib/auth"
import { getWorkspaceCapabilities } from "@/lib/modules/capabilities"
import { listApprovalInvoiceRows, listPoMismatchRows } from "@/models/approvals"
import { listSavedViews } from "@/models/saved-views"
import { countWorkspaceDocuments } from "@/models/documents"
import { filterExpenseClaimRows, filterPoMismatchRows, searchParamsOf } from "@/lib/approvals/filters"
import { listExpenseClaimRows } from "@/models/expense-claims"
import { requireWorkspaceRole, type WorkspaceRole } from "@/models/workspaces"
import { createSavedViewAction, deleteSavedViewAction, duplicateSavedViewAction, renameSavedViewAction, saveFiltersToViewAction, shareSavedViewAction } from "@/app/(app)/workspaces/[workspaceId]/(chrome)/saved-views-actions"
import { ApprovalInvoiceQueue } from "@/components/queue/approval-invoice-queue"
import { SavedViewPicker } from "@/components/typed-destinations/saved-view-picker"
import { auditEventData, getRequestAuditContext } from "@/lib/audit"
import { prisma } from "@/lib/db"
import { notFound } from "next/navigation"

export const dynamic = "force-dynamic"

export type ApprovalsInvoicesSearchParams = { status?: string; approver?: string; sort?: string; view?: string; doc?: string; via?: string }

/** #236: Approvals › Invoices — every submitted Approval (CONTEXT.md's "Approval"), the default
 * view of the Approvals destination. `approver` defaults to "me" (CONTEXT.md's "Ready to
 * Approve": scoped to the signed-in person, including their own not-yet-eligible rows) and
 * widens to every pending Approval with `?approver=anyone`. */
export async function ApprovalsInvoicesQueuePage({ params, searchParams, selectedDocumentId = null }: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<ApprovalsInvoicesSearchParams>
  selectedDocumentId?: string | null
}) {
  const { workspaceId } = await params
  const query = await searchParams
  const { status, approver, view: selectedViewId } = query
  const user = await getCurrentUser()
  const membership = await requireWorkspaceRole(workspaceId, user.id)
  const capabilities = await getWorkspaceCapabilities(workspaceId)
  if (!capabilities.has("review-queue")) notFound()

  const basePath = `/workspaces/${workspaceId}/approvals/invoices`
  const actor = { userId: user.id, role: membership.role as WorkspaceRole }
  const [allRows, poMismatchRows, savedViews, workspaceDocumentCount] = await Promise.all([
    listApprovalInvoiceRows(workspaceId, actor),
    listPoMismatchRows(workspaceId, actor),
    listSavedViews({ workspaceId, viewKey: "approvals-invoices", userId: user.id }),
    countWorkspaceDocuments(workspaceId),
  ])

  // #257: the Approver/Status facets apply client-side (`lib/approvals/filters.ts`) so the
  // Filter sheet and the empty state can count; the page hands over every row. The segment's PO
  // Mismatches count goes through the same predicate so the two stay comparable.
  const onlyNotEligible = status === "not_eligible"
  const poMismatchCount = filterPoMismatchRows(poMismatchRows, searchParamsOf(query)).length
  // #273: the third segment counts submitted claims through the approver scope; hidden when the
  // Expense approvals module is off.
  const expenseClaimCount = capabilities.has("expense-approvals") ? filterExpenseClaimRows(await listExpenseClaimRows(workspaceId, actor), searchParamsOf(query)).length : null

  // #271: an Approval notice links here with `?doc=<id>&via=notice`. The row opens as if the
  // `[documentId]` route had been hit (a missing row falls through to queueArrival's notice); the
  // arrival is audited once (`notice.opened`) so the notice's reach is on the document's trail;
  // `via` is never echoed into a link the page emits.
  const docParam = typeof query.doc === "string" && allRows.some((row) => row.documentId === query.doc) ? query.doc : null
  const initialSelectedId = selectedDocumentId ?? docParam
  if (query.via === "notice") {
    const context = await getRequestAuditContext()
    await prisma.documentAuditEvent.create({ data: auditEventData({ workspaceId, documentId: docParam, actorId: user.id, type: "notice.opened" }, context) }).catch(() => undefined)
  }

  const currentViewFilters: Record<string, string> = { ...(approver === "anyone" ? { approver: "anyone" } : {}), ...(onlyNotEligible ? { status: "not_eligible" } : {}) }

  const arrival = await queueArrival(workspaceId, { searchParams: query as Record<string, string | string[] | undefined>, queuePath: "approvals/invoices", selectedId: selectedDocumentId, rowIds: allRows.map((row) => row.documentId), decidedText: "This invoice was already decided — it's no longer in Ready to Approve." })
  return <ApprovalInvoiceQueue
    arrival={arrival}
    workspaceId={workspaceId}
    basePath={basePath}
    rows={allRows}
    poMismatchCount={poMismatchCount}
    expenseClaimCount={expenseClaimCount}
    workspaceDocumentCount={workspaceDocumentCount}
    initialSelectedId={initialSelectedId}
    views={<SavedViewPicker views={savedViews} selectedViewId={selectedViewId ?? null} currentFilters={currentViewFilters}
      currentUserId={user.id} currentUserRole={membership.role as WorkspaceRole}
      createAction={createSavedViewAction.bind(null, workspaceId, "approvals-invoices", basePath)}
      duplicateAction={duplicateSavedViewAction.bind(null, workspaceId, "approvals-invoices", basePath)}
      renameAction={renameSavedViewAction.bind(null, workspaceId, basePath)}
      saveFiltersAction={saveFiltersToViewAction.bind(null, workspaceId, basePath)}
      deleteAction={deleteSavedViewAction.bind(null, workspaceId, basePath)}
      shareAction={shareSavedViewAction.bind(null, workspaceId, basePath)} />}
    // #261: the phone filter row's Views select — the same picker, `variant="select"`.
    viewsPhone={<SavedViewPicker variant="select" views={savedViews} selectedViewId={selectedViewId ?? null} currentFilters={currentViewFilters}
      currentUserId={user.id} currentUserRole={membership.role as WorkspaceRole}
      createAction={createSavedViewAction.bind(null, workspaceId, "approvals-invoices", basePath)}
      duplicateAction={duplicateSavedViewAction.bind(null, workspaceId, "approvals-invoices", basePath)}
      renameAction={renameSavedViewAction.bind(null, workspaceId, basePath)}
      saveFiltersAction={saveFiltersToViewAction.bind(null, workspaceId, basePath)}
      deleteAction={deleteSavedViewAction.bind(null, workspaceId, basePath)}
      shareAction={shareSavedViewAction.bind(null, workspaceId, basePath)} />} />
}

export default function ApprovalsInvoicesPage({ params, searchParams }: { params: Promise<{ workspaceId: string }>; searchParams: Promise<ApprovalsInvoicesSearchParams> }) {
  return ApprovalsInvoicesQueuePage({ params, searchParams })
}
