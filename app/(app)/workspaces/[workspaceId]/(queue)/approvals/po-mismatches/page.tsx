import { getCurrentUser } from "@/lib/auth"
import { getWorkspaceCapabilities } from "@/lib/modules/capabilities"
import { listApprovalInvoiceRows, listPoMismatchRows } from "@/models/approvals"
import { requireWorkspaceRole, type WorkspaceRole } from "@/models/workspaces"
import { PoMismatchQueue } from "@/components/queue/po-mismatch-queue"
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
  const { status, approver } = await searchParams
  const user = await getCurrentUser()
  const membership = await requireWorkspaceRole(workspaceId, user.id)
  const capabilities = await getWorkspaceCapabilities(workspaceId)
  if (!capabilities.has("review-queue")) notFound()

  const basePath = `/workspaces/${workspaceId}/approvals/po-mismatches`
  const actor = { userId: user.id, role: membership.role as WorkspaceRole }
  const [allInvoiceRows, allMismatchRows] = await Promise.all([
    listApprovalInvoiceRows(workspaceId, actor),
    listPoMismatchRows(workspaceId, actor),
  ])

  const scopeToMe = approver !== "anyone"
  const onlyNotEligible = status === "not_eligible"
  const rows = allMismatchRows
    .filter((row) => !scopeToMe || row.canDecide)
    .filter((row) => !onlyNotEligible || row.eligibility.status !== "ready")
  const invoiceCount = allInvoiceRows.filter((row) => !scopeToMe || row.canDecide).length

  return <PoMismatchQueue workspaceId={workspaceId} basePath={basePath} rows={rows} invoiceCount={invoiceCount} initialSelectedId={selectedDocumentId} />
}

export default function ApprovalsPoMismatchesPage({ params, searchParams }: { params: Promise<{ workspaceId: string }>; searchParams: Promise<ApprovalsPoMismatchesSearchParams> }) {
  return ApprovalsPoMismatchesQueuePage({ params, searchParams })
}
