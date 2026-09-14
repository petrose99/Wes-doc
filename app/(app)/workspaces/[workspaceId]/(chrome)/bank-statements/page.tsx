import { TypedDocumentListPage } from "@/components/typed-destinations/typed-document-list-page"

export const dynamic = "force-dynamic"

export default function BankStatementsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  return TypedDocumentListPage({
    params,
    docType: "bank_statement",
    title: "Bank Statements",
    description: "Review statements by institution and period, with reconciliation work kept close to the source.",
  })
}

