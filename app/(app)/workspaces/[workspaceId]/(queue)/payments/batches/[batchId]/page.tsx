import { PaymentBatchesQueuePage, type BatchSearchParams } from "../page"

export const dynamic = "force-dynamic"

/** #251: a deep link to one Payment batch opens the queue with that row selected and the Detail
 * pane open — the same screen, not a separate page. */
export default async function PaymentBatchDeepLinkPage({ params, searchParams }: {
  params: Promise<{ workspaceId: string; batchId: string }>
  searchParams: Promise<BatchSearchParams>
}) {
  const { workspaceId, batchId } = await params
  return PaymentBatchesQueuePage({ params: Promise.resolve({ workspaceId }), searchParams, selectedBatchId: batchId })
}
