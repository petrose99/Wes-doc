import { ExpenseClaimsPage } from "../expenses/page"
import { TypedDocumentListPage } from "@/components/typed-destinations/typed-document-list-page"

export const dynamic = "force-dynamic"

export default async function ReceiptsPage({ params, searchParams }: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<{ mode?: string }>
}) {
  const { mode } = await searchParams
  if (mode === "claims") return ExpenseClaimsPage({ params })

  const { workspaceId } = await params
  return TypedDocumentListPage({
    params: Promise.resolve({ workspaceId }),
    docType: "receipt",
    title: "Receipts",
    description: "Review extracted receipts and turn selected receipts into expense claims when a reimbursement workflow needs them.",
    action: { href: `/workspaces/${workspaceId}/receipts?mode=claims`, label: "Create expense claim" },
  })
}

