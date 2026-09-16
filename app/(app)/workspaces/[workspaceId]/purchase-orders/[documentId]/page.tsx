import { DocumentDetailPage } from "../../documents/[documentId]/page"
import { PurchaseOrdersQueuePage } from "../../(queue)/purchase-orders/page"

export const dynamic = "force-dynamic"

/** #225: a deep link to one document opens its queue with that row selected and the Detail pane
 * open — one screen, not a separate page. `?full=1` (the pane's "Open in a new tab") still renders the standalone split pane;
 * a legacy `?stage=`/`?page=` link now opens the queue with the pane instead (#259). */
export default async function DeepLinkPage({ params, searchParams }: {
  params: Promise<{ workspaceId: string; documentId: string }>
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const { workspaceId, documentId } = await params
  const query = await searchParams
  if (query.full === "1") return DocumentDetailPage({ params, searchParams })
  return PurchaseOrdersQueuePage({ params: Promise.resolve({ workspaceId }), searchParams: Promise.resolve(query), selectedDocumentId: documentId })
}
