import { queueArrival } from "@/lib/navigation/origin-server"
import { getCurrentUser } from "@/lib/auth"
import { getWorkspaceCapabilities } from "@/lib/modules/capabilities"
import { listApprovalInvoiceRows, listPoMismatchRows } from "@/models/approvals"
import { countWorkspaceDocuments } from "@/models/documents"
import { requireWorkspaceRole, type WorkspaceRole } from "@/models/workspaces"
import { PoMismatchQueue } from "@/components/queue/po-mismatch-queue"
import { filterApprovalInvoiceRows, filterExpenseClaimRows, searchParamsOf } from "@/lib/approvals/filters"
import { listExpenseClaimRows } from "@/models/expense-claims"
import { notFound } from "next/navigation"

export const dynamic = "force-dynamic"

export type ApprovalsPoMismatchesSearchParams = { status?: string; approver?: string; sort?: string }

/** #236 decisions #3/#4: Approvals › PO Mismatches — the same Approver/Status filter shape as
 * Invoices, no saved views of its own yet (a single always-on "one per invoice" list doesn't need
 * more than one system view). */
export async function ApprovalsPoMismatchesQueuePage({ params, searchParams, selectedDocumentId = null }: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<ApprovalsPoMismatchesSearchParams>
  selectedDocumentId?: string | null
}) {
  const { workspaceId } = await params
  const query = await searchParams
  const user = await getCurrentUser()
  const membership = await requireWorkspaceRole(workspaceId, user.id)
  const capabilities = await getWorkspaceCapabilities(workspaceId)
  if (!capabilities.has("review-queue")) notFound()

  const basePath = `/workspaces/${workspaceId}/approvals/po-mismatches`
  const actor = { userId: user.id, role: membership.role as WorkspaceRole }
  const [allInvoiceRows, allMismatchRows, workspaceDocumentCount] = await Promise.all([
    listApprovalInvoiceRows(workspaceId, actor),
    listPoMismatchRows(workspaceId, actor),
    countWorkspaceDocuments(workspaceId),
  ])

  // #257: facets apply client-side (`lib/approvals/filters.ts`); the page hands over every row
  // and the segment's Invoice approvals count goes through the same predicate.
  const invoiceCount = filterApprovalInvoiceRows(allInvoiceRows, searchParamsOf(query)).length
  // #273: the third segment counts submitted claims through the approver scope; hidden when the
  // Expense approvals module is off.
  const expenseClaimCount = capabilities.has("expense-approvals") ? filterExpenseClaimRows(await listExpenseClaimRows(workspaceId, actor), searchParamsOf(query)).length : null

  const arrival = await queueArrival(workspaceId, { searchParams: query as Record<string, string | string[] | undefined>, queuePath: "approvals/po-mismatches", selectedId: selectedDocumentId, rowIds: allMismatchRows.map((row) => row.documentId), decidedText: "This invoice was already decided — it's no longer in Ready to Approve." })
  return <PoMismatchQueue arrival={arrival} workspaceId={workspaceId} basePath={basePath} rows={allMismatchRows} invoiceCount={invoiceCount} expenseClaimCount={expenseClaimCount} workspaceDocumentCount={workspaceDocumentCount} initialSelectedId={selectedDocumentId} />
}

export default function ApprovalsPoMismatchesPage({ params, searchParams }: { params: Promise<{ workspaceId: string }>; searchParams: Promise<ApprovalsPoMismatchesSearchParams> }) {
  return ApprovalsPoMismatchesQueuePage({ params, searchParams })
}
