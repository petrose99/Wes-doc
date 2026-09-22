import { resolveDocType, type DocType } from "@/lib/doc-types"

export const TYPED_DESTINATIONS = [
  { docType: "invoice", label: "Invoices", segment: "invoices" },
  { docType: "purchase_order", label: "Purchase Orders", segment: "purchase-orders" },
  { docType: "receipt", label: "Receipts", segment: "receipts" },
  { docType: "bank_statement", label: "Bank Statements", segment: "bank-statements" },
] as const satisfies readonly { docType: DocType; label: string; segment: string }[]

const TYPED_SEGMENTS: Partial<Record<DocType, string>> = {
  invoice: "invoices",
  purchase_order: "purchase-orders",
  receipt: "receipts",
  bank_statement: "bank-statements",
}

export function destinationSegmentForDocType(docType: DocType): string {
  return TYPED_SEGMENTS[docType] ?? "library"
}

export function documentDestinationPath(workspaceBase: string, document: { id: string; docType?: string | null; template?: { code: string } | null }): string {
  const segment = destinationSegmentForDocType(resolveDocType(document))
  return segment === "library"
    ? `${workspaceBase}/library/documents/${document.id}`
    : `${workspaceBase}/${segment}/${document.id}`
}
