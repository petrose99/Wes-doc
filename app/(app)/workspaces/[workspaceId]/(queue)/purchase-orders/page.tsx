import { DocumentQueuePage } from "../document-queue-page"
import { QueueStat } from "@/components/queue/queue-stat"
import { getDocumentMatchRateStats } from "@/lib/analytics/workspace-analytics"

export const dynamic = "force-dynamic"

export async function PurchaseOrdersQueuePage({ params, searchParams, selectedDocumentId = null }: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<{ status?: string; sort?: string; consumed?: string }>
  selectedDocumentId?: string | null
}) {
  const { workspaceId } = await params
  const matchRate = await getDocumentMatchRateStats(workspaceId, "purchase_order", ["po_to_invoice"])
  return DocumentQueuePage({
    params, searchParams, selectedDocumentId,
    docType: "purchase_order", title: "Purchase Orders", noun: "purchase order", itemType: "Purchase Order",
    emptyBody: "Purchase orders appear here once one is extracted. An invoice that cites one is compared against it line by line.",
    purchaseOrders: true,
    stat: <QueueStat label="Auto-matched" value={`${Math.round(matchRate.matchRate * 100)}%`} detail={`${matchRate.matched} of ${matchRate.total} purchase orders matched to an invoice, last 30 days`} />,
  })
}

export default function PurchaseOrdersPage({ params, searchParams }: { params: Promise<{ workspaceId: string }>; searchParams: Promise<{ status?: string; sort?: string }> }) {
  return PurchaseOrdersQueuePage({ params, searchParams })
}
