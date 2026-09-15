import { MetricStrip } from "@/components/typed-destinations/metric-strip"
import { TypedDocumentListPage } from "@/components/typed-destinations/typed-document-list-page"

export const dynamic = "force-dynamic"

export default function BankStatementsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  return TypedDocumentListPage({
    params,
    docType: "bank_statement",
    title: "Bank Statements",
    description: "Review statements by institution and period, with reconciliation work kept close to the source.",
    metric: <MetricStrip variant="inline" label="Reconciliation-match rate" value=""
      sampleLabel="" unavailableReason="Not available yet — no bank-reconciliation matcher exists (#207 shipped institution and layout-drift detection only)." />,
  })
}
