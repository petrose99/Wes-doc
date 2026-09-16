import { DocumentQueuePage } from "../document-queue-page"
import { QueueStat } from "@/components/queue/queue-stat"

export const dynamic = "force-dynamic"

export function BankStatementsQueuePage({ params, searchParams, selectedDocumentId = null }: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<{ status?: string; sort?: string }>
  selectedDocumentId?: string | null
}) {
  return DocumentQueuePage({
    params, searchParams, selectedDocumentId,
    docType: "bank_statement", showTodayOutcome: true, title: "Bank Statements", noun: "bank statement", itemType: "Bank Statement", supplierLabel: "Account",
    emptyBody: "Statements appear here once one is extracted. Assert the institution on each so layout drift can be checked (#207).",
    stat: <QueueStat label="Reconciled" value="" detail="" unavailable="No bank-reconciliation matcher exists yet (#207 shipped institution and layout-drift detection only)." />,
  })
}

export default function BankStatementsPage({ params, searchParams }: { params: Promise<{ workspaceId: string }>; searchParams: Promise<{ status?: string; sort?: string }> }) {
  return BankStatementsQueuePage({ params, searchParams })
}
