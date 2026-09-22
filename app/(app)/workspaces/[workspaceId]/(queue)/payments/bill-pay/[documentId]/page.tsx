import { BillPayQueuePage, type BillPaySearchParams } from "../page"

export const dynamic = "force-dynamic"

/** #251: a deep link to one Bill Pay row opens the queue with that row selected and the Detail
 * pane open — the same screen, not a separate page. */
export default async function BillPayDeepLinkPage({ params, searchParams }: {
  params: Promise<{ workspaceId: string; documentId: string }>
  searchParams: Promise<BillPaySearchParams>
}) {
  const { workspaceId, documentId } = await params
  return BillPayQueuePage({ params: Promise.resolve({ workspaceId }), searchParams, selectedDocumentId: documentId })
}
