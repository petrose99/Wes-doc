import { DocumentDetailPage } from "../../../documents/[documentId]/page"
import { ApprovalsInvoicesQueuePage, type ApprovalsInvoicesSearchParams } from "../../../(queue)/approvals/invoices/page"

export const dynamic = "force-dynamic"

/** #236: a deep link to one invoice's Approval opens the Approvals › Invoices queue with that row
 * selected and the Detail pane open on its Approval tab — same pattern as `/invoices/[documentId]`
 * (#225). `?full=1` still renders the standalone split pane, same escape hatch every other typed
 * destination's deep link keeps. */
export default async function ApprovalsInvoiceDeepLinkPage({ params, searchParams }: {
  params: Promise<{ workspaceId: string; documentId: string }>
  searchParams: Promise<ApprovalsInvoicesSearchParams & { full?: string }>
}) {
  const { workspaceId, documentId } = await params
  const query = await searchParams
  if (query.full === "1") return DocumentDetailPage({ params, searchParams: Promise.resolve({}), initialTab: "approval" })
  return ApprovalsInvoicesQueuePage({ params: Promise.resolve({ workspaceId }), searchParams: Promise.resolve(query), selectedDocumentId: documentId })
}
