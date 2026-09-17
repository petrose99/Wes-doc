import { queueArrival } from "@/lib/navigation/origin-server"
import { getCurrentUser } from "@/lib/auth"
import { getWorkspaceCapabilities } from "@/lib/modules/capabilities"
import { listApprovalInvoiceRows, listPoMismatchRows } from "@/models/approvals"
import { getExpenseClaim, listExpenseClaimRows } from "@/models/expense-claims"
import { countWorkspaceDocuments } from "@/models/documents"
import { requireWorkspaceRole, type WorkspaceRole } from "@/models/workspaces"
import { ExpenseClaimQueue } from "@/components/queue/expense-claim-queue"
import { filterApprovalInvoiceRows, filterPoMismatchRows, searchParamsOf } from "@/lib/approvals/filters"
import { claimName } from "@/lib/claims/labels"
import { formatDate } from "@/components/queue/row-cells"
import { notFound } from "next/navigation"

export const dynamic = "force-dynamic"

export type ApprovalsExpenseClaimsSearchParams = { approver?: string; sort?: string; claim?: string; via?: string }

/** #273 S4: Approvals › Expense claims — every submitted claim, the third Approvals view.
 * `approver` defaults to "me" (the claims the actor can decide) and widens with
 * `?approver=anyone`. Needs both `review-queue` and the Expense approvals module. */
export async function ApprovalsExpenseClaimsQueuePage({ params, searchParams, selectedClaimId = null }: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<ApprovalsExpenseClaimsSearchParams>
  selectedClaimId?: string | null
}) {
  const { workspaceId } = await params
  const query = await searchParams
  const user = await getCurrentUser()
  const membership = await requireWorkspaceRole(workspaceId, user.id)
  const capabilities = await getWorkspaceCapabilities(workspaceId)
  if (!capabilities.has("review-queue") || !capabilities.has("expense-approvals")) notFound()

  const basePath = `/workspaces/${workspaceId}/approvals/expense-claims`
  const actor = { userId: user.id, role: membership.role as WorkspaceRole }
  const [rows, invoiceRows, poMismatchRows, workspaceDocumentCount] = await Promise.all([
    listExpenseClaimRows(workspaceId, actor),
    listApprovalInvoiceRows(workspaceId, actor),
    listPoMismatchRows(workspaceId, actor),
    countWorkspaceDocuments(workspaceId),
  ])
  const filterParams = searchParamsOf(query)
  const invoiceCount = filterApprovalInvoiceRows(invoiceRows, filterParams).length
  const poMismatchCount = filterPoMismatchRows(poMismatchRows, filterParams).length

  // Spec §6.1: a deep link (`/[claimId]` or `?claim=`) to a claim that is no longer submitted
  // says what happened to it; an id that is not this workspace's claim is a 404.
  const claimParam = selectedClaimId ?? (typeof query.claim === "string" ? query.claim : null)
  let missingText: string | undefined
  if (claimParam && !rows.some((row) => row.claimId === claimParam)) {
    const claim = await getExpenseClaim(workspaceId, claimParam)
    if (!claim) notFound()
    const name = claimName(claim)
    missingText = claim.status === "approved" ? `${name} was approved${claim.resolvedAt ? ` ${formatDate(claim.resolvedAt)}` : ""} — it's no longer in Ready to Approve.`
      : claim.status === "rejected" ? `${name} was rejected${claim.resolvedAt ? ` ${formatDate(claim.resolvedAt)}` : ""} — it's no longer in Ready to Approve.`
      : `${name} was withdrawn — it's not waiting for approval.`
  }

  const arrival = await queueArrival(workspaceId, { searchParams: { ...query, doc: claimParam ?? undefined } as Record<string, string | string[] | undefined>, queuePath: "approvals/expense-claims", selectedId: selectedClaimId, rowIds: rows.map((row) => row.claimId), missingText })
  return <ExpenseClaimQueue arrival={arrival} workspaceId={workspaceId} basePath={basePath} rows={rows} invoiceCount={invoiceCount} poMismatchCount={poMismatchCount}
    currentUserId={user.id} workspaceDocumentCount={workspaceDocumentCount} initialSelectedId={claimParam} />
}

export default function ApprovalsExpenseClaimsPage({ params, searchParams }: { params: Promise<{ workspaceId: string }>; searchParams: Promise<ApprovalsExpenseClaimsSearchParams> }) {
  return ApprovalsExpenseClaimsQueuePage({ params, searchParams })
}
