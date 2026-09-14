import { TypedDocumentListPage } from "@/components/typed-destinations/typed-document-list-page"

export const dynamic = "force-dynamic"

export default function PurchaseOrdersPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  return TypedDocumentListPage({
    params,
    docType: "purchase_order",
    title: "Purchase Orders",
    description: "Review purchase orders alongside the invoices they constrain, before matching or approving spend.",
  })
}

