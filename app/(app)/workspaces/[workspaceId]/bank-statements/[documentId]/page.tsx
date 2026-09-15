import { DocumentDetailPage } from "../../documents/[documentId]/page"
import { BankStatementsQueuePage } from "../../(queue)/bank-statements/page"

export const dynamic = "force-dynamic"

/** #225: a deep link to one document opens its queue with that row selected and the Detail pane
 * open — one screen, not a separate page. `?full=1` still renders the standalone split pane
 * (the pane's "Open in a new tab"), and a legacy `?stage=` link from the pipeline does too. */
export default async function DeepLinkPage({ params, searchParams }: {
  params: Promise<{ workspaceId: string; documentId: string }>
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const { workspaceId, documentId } = await params
  const query = await searchParams
  if (query.full === "1" || query.stage || query.page) return DocumentDetailPage({ params, searchParams })
  return BankStatementsQueuePage({ params: Promise.resolve({ workspaceId }), searchParams: Promise.resolve(query), selectedDocumentId: documentId })
}
