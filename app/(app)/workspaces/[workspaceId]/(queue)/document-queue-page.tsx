import { queueArrival } from "@/lib/navigation/origin-server"
import type { ReactNode } from "react"
import { getCurrentUser } from "@/lib/auth"
import type { DocType } from "@/lib/doc-types"
import { countWorkspaceDocuments, listWorkspaceDocuments, summarizeDocumentForReview } from "@/models/documents"
import { getTodayOutcome } from "@/models/queue-outcome"
import { listWorkspaceInstitutions } from "@/models/institutions"
import { requireWorkspaceRole } from "@/models/workspaces"
import { DocumentQueue, type DocumentQueueRow } from "@/components/queue/document-queue"
import { getSavedFieldTable } from "@/models/field-configs"
import { isFieldTableType } from "@/lib/configuration/field-table"
import { summarizePoConsumption, type PoConsumption } from "@/models/po-matching"
import type { ItemizedRecord } from "@/components/typed-destinations/bulk-approve-receipt"

const STATUSES = new Set(["queued", "needs_review", "ready_for_review", "reviewed", "failed"])

/** #225: Purchase Orders and Bank Statements on the Queue screen. Both still read the generic
 * document list (no dedicated row model yet — see the map's "Not yet specified"), mapped to the
 * serializable row the client queue renders. */
export async function DocumentQueuePage({ params, searchParams, docType, title, noun, itemType, supplierLabel, stat, emptyBody, selectedDocumentId = null, purchaseOrders = false, showTodayOutcome = false }: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<{ status?: string; sort?: string; consumed?: string }>
  docType: DocType
  title: string
  noun: string
  itemType: ItemizedRecord["type"]
  supplierLabel?: string
  stat?: ReactNode
  emptyBody: string
  selectedDocumentId?: string | null
  purchaseOrders?: boolean
  /** #264 spec §3.3: postable queues (Bank Statements) show "n approved today, m posted." on done. */
  showTodayOutcome?: boolean
}) {
  const { workspaceId } = await params
  const query = await searchParams
  const { status, consumed } = query
  const user = await getCurrentUser()
  const membership = await requireWorkspaceRole(workspaceId, user.id)
  const isBank = docType === "bank_statement"
  const [documents, institutions, workspaceDocumentCount, todayOutcome] = await Promise.all([
    listWorkspaceDocuments(workspaceId, { docType, status: status && STATUSES.has(status) ? status : undefined }),
    isBank ? listWorkspaceInstitutions(workspaceId) : Promise.resolve([]),
    // #264 spec §2: first-use means the workspace has never held a document of any type.
    countWorkspaceDocuments(workspaceId),
    showTodayOutcome ? getTodayOutcome(workspaceId) : Promise.resolve(undefined),
  ])
  const institutionName = new Map(institutions.map((institution) => [institution.id, institution.name]))
  // #228 Q8: the Purchase Orders queue reads consumption per PO — Invoiced (amount and %) and
  // Open / Fully invoiced are derived from the compared invoices, never set by hand.
  const consumption = docType === "purchase_order" ? await summarizePoConsumption(workspaceId, documents.map((document) => document.id)) : new Map<string, PoConsumption>()
  const allRows: DocumentQueueRow[] = documents.map((document) => {
    const review = summarizeDocumentForReview(document, membership.workspace.baseCurrency)
    const reviewed = (document.reviewedData as Record<string, unknown> | null) ?? {}
    // A statement has no supplier: its account holder names the row, and its closing balance is
    // the one amount worth a column.
    const accountHolder = typeof reviewed.account_holder === "string" ? reviewed.account_holder : null
    const closing = typeof reviewed.closing_balance === "number" ? reviewed.closing_balance : null
    return {
      id: document.id,
      filename: document.filename,
      status: document.status,
      receivedAt: document.receivedAt,
      supplier: review.supplier ?? (isBank ? accountHolder : null),
      total: review.total ?? (isBank && closing !== null ? new Intl.NumberFormat("en", { style: "currency", currency: membership.workspace.baseCurrency ?? "USD", maximumFractionDigits: 0 }).format(closing) : null),
      category: review.category,
      institution: isBank && document.institutionId ? institutionName.get(document.institutionId) ?? null : null,
      ...(docType === "purchase_order" ? (() => {
        const po = consumption.get(document.id)
        return { po: { poNumber: typeof reviewed.po_number === "string" ? reviewed.po_number : null, invoicedAmount: po?.invoicedAmount ?? 0, invoicedPercent: po?.invoicedPercent ?? null, currencyCode: po?.currencyCode ?? null, fullyInvoiced: po?.fullyInvoiced ?? false, invoiceCount: po?.invoices.length ?? 0, mismatchCount: po?.invoices.reduce((sum, invoice) => sum + invoice.mismatchCount, 0) ?? 0, overLines: po?.lines.filter((line) => line.ordered !== null && line.invoiced > line.ordered).length ?? 0 } }
      })() : {}),
    }
  })
  const rows = purchaseOrders && (consumed === "open" || consumed === "full") ? allRows.filter((row) => (consumed === "full") === !!row.po?.fullyInvoiced) : allRows
  const segment = docType === "purchase_order" ? "purchase-orders" : "bank-statements"

  const fieldTable = isFieldTableType(docType) ? await getSavedFieldTable(workspaceId, docType) : null
  const arrival = await queueArrival(workspaceId, { searchParams: query as Record<string, string | string[] | undefined>, queuePath: segment, selectedId: selectedDocumentId, rowIds: rows.map((row) => row.id), unfilteredRowIds: allRows.map((row) => row.id) })
  return <DocumentQueue
    arrival={arrival}
    fieldTable={fieldTable}
    workspaceId={workspaceId}
    basePath={`/workspaces/${workspaceId}/${segment}`}
    title={title}
    noun={noun}
    itemType={itemType}
    rows={rows}
    supplierLabel={supplierLabel}
    stat={stat}
    initialSelectedId={selectedDocumentId}
    emptyBody={emptyBody}
    showInstitution={isBank}
    purchaseOrders={purchaseOrders}
    workspaceDocumentCount={workspaceDocumentCount}
    todayOutcome={todayOutcome} />
}
