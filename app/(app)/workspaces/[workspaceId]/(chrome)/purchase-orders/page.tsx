import { MetricStrip, formatPercent } from "@/components/typed-destinations/metric-strip"
import { TypedDocumentListPage } from "@/components/typed-destinations/typed-document-list-page"
import { getDocumentMatchRateStats } from "@/lib/analytics/workspace-analytics"

export const dynamic = "force-dynamic"

export default async function PurchaseOrdersPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  const matchRate = await getDocumentMatchRateStats(workspaceId, "purchase_order", ["po_to_invoice"])

  return TypedDocumentListPage({
    params,
    docType: "purchase_order",
    title: "Purchase Orders",
    description: "Review purchase orders alongside the invoices they constrain, before matching or approving spend.",
    metric: <MetricStrip variant="inline" label="Auto-match rate" value={formatPercent(matchRate.matchRate)}
      sampleLabel={`${matchRate.matched} of ${matchRate.total}, last 30 days`} />,
  })
}
