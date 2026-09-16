import { DocumentDetailPage } from "../../../documents/[documentId]/page"
import { ApprovalsPoMismatchesQueuePage, type ApprovalsPoMismatchesSearchParams } from "../../../(queue)/approvals/po-mismatches/page"

export const dynamic = "force-dynamic"

/** #236: a deep link to one PO mismatch opens the Approvals › PO Mismatches queue with that row
 * selected and the Detail pane open on its Checks tab, where the match-variance gate's Override
 * control lives. Same shape as `/approvals/invoices/[documentId]`. */
export default async function ApprovalsPoMismatchDeepLinkPage({ params, searchParams }: {
  params: Promise<{ workspaceId: string; documentId: string }>
  searchParams: Promise<ApprovalsPoMismatchesSearchParams & { full?: string }>
}) {
  const { workspaceId, documentId } = await params
  const query = await searchParams
  if (query.full === "1") return DocumentDetailPage({ params, searchParams: Promise.resolve({}), initialTab: "checks" })
  return ApprovalsPoMismatchesQueuePage({ params: Promise.resolve({ workspaceId }), searchParams: Promise.resolve(query), selectedDocumentId: documentId })
}
