"use client"

import type { QueueArrival } from "@/lib/navigation/origin-server"
import { useState, type ReactNode } from "react"
import { toast } from "sonner"
import { AlertTriangle, CheckCircle2, Loader2, Search } from "lucide-react"
import type { FieldTable } from "@/lib/configuration/field-table"
import { QueueScreen, type QueueColumn, type SortOption } from "@/components/queue/queue-screen"
import { joinSegments } from "@/components/queue/queue-card"
import { DocumentBulkActions, DocumentPaneActions } from "@/components/queue/document-actions"
import { formatDate, formatMoney, TitleCell } from "@/components/queue/row-cells"
import type { Facet } from "@/components/queue/facet-filters"
import type { ItemizedRecord } from "@/components/typed-destinations/bulk-approve-receipt"
import { bulkExportDocumentsAction } from "@/app/(app)/workspaces/[workspaceId]/pipeline-actions"
import { getQueueDetailAction } from "@/app/(app)/workspaces/[workspaceId]/queue-actions"
import { downloadCsv } from "@/lib/client/download-csv"

/** A Purchase Order or Bank Statement row (#225): the serializable shape the server page builds
 * from `listWorkspaceDocuments` + `summarizeDocumentForReview`. These two destinations have no
 * dedicated row model yet (no aging, no claim), so the queue reads the document's own facts. */
export type DocumentQueueRow = {
  id: string
  filename: string
  status: string
  receivedAt: Date
  supplier: string | null
  /** Pre-formatted by the server, e.g. "$1,204" — includes currency. */
  total: string | null
  category: string
  /** Bank statements only: the asserted institution (#217). */
  institution?: string | null
  /** Purchase orders only (#228 Q8): the PO number and its consumption by compared invoices. */
  po?: { poNumber: string | null; invoicedAmount: number; invoicedPercent: number | null; currencyCode: string | null; fullyInvoiced: boolean; invoiceCount: number; mismatchCount: number; overLines: number }
}


const DOCUMENT_FACETS_BASE = (): Facet[] => [
  {
    param: "status", label: "Status",
    sections: [
      { label: "Open", options: [{ value: "queued", label: "Processing" }, { value: "needs_review", label: "Needs review" }, { value: "ready_for_review", label: "Ready for review" }] },
      { label: "Closed", options: [{ value: "reviewed", label: "Reviewed" }, { value: "failed", label: "Failed" }] },
    ],
  },
]

export const DOCUMENT_FACETS: Facet[] = DOCUMENT_FACETS_BASE()
/** #228 Q6 on the PO side: Open / Fully invoiced is a facet here too. */
export const PURCHASE_ORDER_FACETS: Facet[] = [
  ...DOCUMENT_FACETS_BASE(),
  { param: "consumed", label: "Consumption", options: [{ value: "open", label: "Open" }, { value: "full", label: "Fully invoiced" }] },
]

const SORTS: SortOption<DocumentQueueRow>[] = [
  { key: "newest", label: "Newest first", compare: () => 0 },
  { key: "oldest", label: "Oldest first", compare: (a, b) => a.receivedAt.getTime() - b.receivedAt.getTime() },
  { key: "supplier", label: "Supplier A–Z", compare: (a, b) => (a.supplier ?? "￿").localeCompare(b.supplier ?? "￿") },
]

const STATUS_LABEL: Record<string, string> = {
  queued: "Processing", needs_review: "Needs review", ready_for_review: "Ready for review", reviewed: "Reviewed", failed: "Failed",
}

function StateGlyph({ status }: { status: string }) {
  if (status === "reviewed") return <CheckCircle2 className="h-4 w-4 text-emerald-700" aria-hidden />
  if (status === "failed") return <AlertTriangle className="h-4 w-4 text-red-700" aria-hidden />
  if (status === "queued") return <Loader2 className="h-4 w-4 animate-spin text-slate-500" aria-hidden />
  return <Search className="h-4 w-4 text-amber-700" aria-hidden />
}

function StatusPill({ status }: { status: string }) {
  const cls = status === "reviewed" ? "bg-emerald-100 text-emerald-800" : status === "failed" ? "bg-red-50 text-red-800" : status === "queued" ? "bg-slate-100 text-slate-700" : "bg-amber-100 text-amber-900"
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{STATUS_LABEL[status] ?? status.replaceAll("_", " ")}</span>
}

export function DocumentQueue({ workspaceId, basePath, title, noun, itemType, rows, supplierLabel = "Supplier", views, viewsPhone, stat, initialSelectedId, emptyBody, showInstitution = false, purchaseOrders = false, fieldTable = null, workspaceDocumentCount, todayOutcome, arrival }: {
  /** #252: Admin › Configuration › Fields for this queue's type, when one has been saved. */
  fieldTable?: FieldTable | null
  workspaceId: string
  basePath: string
  title: string
  /** Singular, lower-case, for copy: "purchase order", "bank statement". */
  noun: string
  itemType: ItemizedRecord["type"]
  rows: DocumentQueueRow[]
  supplierLabel?: string
  views?: ReactNode
  /** #261: the phone filter row's Views select. */
  viewsPhone?: ReactNode
  stat?: ReactNode
  initialSelectedId?: string | null
  emptyBody: string
  showInstitution?: boolean
  /** #228 Q8: the Purchase Orders column set. */
  purchaseOrders?: boolean
  /** #264: has the workspace ever held a document (any type) — decides first-use vs. done. */
  workspaceDocumentCount: number
  /** #264: the done state's "n approved today, m posted." sentence — Bank Statements only (a
   * postable queue); Purchase Orders passes undefined and keeps the default done body. */
  todayOutcome?: { approvedToday: number; postedToday: number }
  /** #268: the Origin strip's model + the missing-row notice, from `queueArrival` on the server. */
  arrival?: QueueArrival
}) {
  const [needsAttention, setNeedsAttention] = useState<Set<string>>(new Set())
  const byId = new Map(rows.map((row) => [row.id, row]))
  const toRecord = (id: string): ItemizedRecord => {
    const row = byId.get(id)
    return { id, type: itemType, vendor: row?.supplier ?? null, number: null, amount: null, currencyCode: null, dateLabel: "Received", date: row?.receivedAt ?? null }
  }

  const columns: QueueColumn<DocumentQueueRow>[] = [
    {
      key: "supplier", label: supplierLabel, narrow: true, className: "min-w-[12rem]", fieldKey: purchaseOrders ? "supplier" : "bank_name", phone: "title",
      // #261: the card title — Institution falls back to the filename on Bank Statements (spec §2).
      phoneRender: (row) => row.supplier ?? (showInstitution ? row.institution : null) ?? (showInstitution ? row.filename : <span className="font-normal text-slate-600">Unknown {supplierLabel.toLowerCase()}</span>),
      render: (row) => <TitleCell title={row.supplier ?? (showInstitution ? row.institution ?? null : null)} subtitle={row.filename} missingLabel={`Unknown ${supplierLabel.toLowerCase()}`} />,
    },
    ...(showInstitution ? [{ key: "institution", label: "Institution", className: "whitespace-nowrap text-slate-700", priority: "low" as const, render: (row: DocumentQueueRow) => <>{row.institution ?? "—"}</> }] : []),
    // #228 Q8: Supplier · PO # · Amount · Invoiced (amount and %) · Open / Fully invoiced ·
    // Received. No Buyer. "Received" here is the goods-receipt fact DocuBite lacks, so it reads "—"
    // rather than borrowing the upload date; the upload date keeps its own column on the others.
    ...(purchaseOrders ? [
      // #261 spec §2: the card's second line is "PO # · Received ‹date›" (the document's own receipt
      // date, since the goods-receipt column below is always "—").
      { key: "po_number", label: "PO #", narrow: true, className: "whitespace-nowrap tabular-nums text-slate-700", fieldKey: "po_number", phone: "subtitle" as const,
        phoneRender: (row: DocumentQueueRow) => joinSegments([row.po?.poNumber, `Received ${formatDate(row.receivedAt)}`]),
        render: (row: DocumentQueueRow) => <>{row.po?.poNumber ?? "—"}</> },
      { key: "amount", label: "Amount", narrow: true, className: "whitespace-nowrap text-right tabular-nums text-slate-900", fieldKey: "total", phone: "trailing" as const, render: (row: DocumentQueueRow) => <>{row.total ?? "—"}</> },
      { key: "invoiced", label: "Invoiced", className: "whitespace-nowrap text-right tabular-nums", priority: "low" as const, render: (row: DocumentQueueRow) => row.po && row.po.invoiceCount > 0
        ? <span className={row.po.mismatchCount ? "text-red-700" : "text-slate-800"} title={row.po.mismatchCount ? `${row.po.mismatchCount} cell${row.po.mismatchCount === 1 ? "" : "s"} on the matched invoices do not match` : undefined}>
          {formatMoney(row.po.invoicedAmount, row.po.currencyCode)}{row.po.invoicedPercent !== null && <span className="ml-1 text-xs text-slate-500">{row.po.invoicedPercent} %</span>}
        </span>
        : <span className="text-slate-500">—</span> },
      // Three states, not two: Open · Fully invoiced · Open with a line over — so "Open" never sits
      // beside a red 115 % as if the two contradicted each other.
      { key: "consumption", label: "Consumption", narrow: true, phone: "pill" as const, render: (row: DocumentQueueRow) => <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${row.po?.fullyInvoiced ? "bg-slate-100 text-slate-700" : row.po?.overLines ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"}`}>{row.po?.fullyInvoiced ? "Fully invoiced" : row.po?.overLines ? `Open · ${row.po.overLines} line${row.po.overLines === 1 ? "" : "s"} over` : "Open"}</span> },
      // "Goods received", not "Received": one word must not carry two referents once the card's
      // subtitle says "Received ‹upload date›" (#261 critic D5).
      { key: "goods_received", label: "Goods received", className: "whitespace-nowrap text-slate-500", priority: "low" as const, render: () => <span title="Goods receipt is not recorded in DocuBite">—</span> },
    ] : [
      { key: "amount", label: "Amount", narrow: true, className: "whitespace-nowrap text-right tabular-nums text-slate-900", phone: "trailing" as const, render: (row: DocumentQueueRow) => <>{row.total ?? "—"}</> },
      { key: "received", label: "Received", narrow: true, className: "whitespace-nowrap tabular-nums text-slate-700", phone: "subtitle" as const, phoneRender: (row: DocumentQueueRow) => `Received ${formatDate(row.receivedAt)}`, render: (row: DocumentQueueRow) => <>{formatDate(row.receivedAt)}</> },
      { key: "category", label: "Category", className: "text-slate-700", priority: "low" as const, phone: "subtitle" as const, render: (row: DocumentQueueRow) => <>{row.category}</> },
    ]),
    {
      key: "state", label: "State", phone: "pill",
      render: (row) => <span className="flex flex-wrap items-center gap-1.5">
        <StatusPill status={row.status} />
        {needsAttention.has(row.id) && <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900" title="Held back from a bulk approve — missing required fields or a document type.">Needs attention</span>}
      </span>,
    },
  ]

  const exportAll = async () => {
    const result = await bulkExportDocumentsAction(workspaceId, rows.map((row) => row.id))
    if (!result.success || !result.data) { toast.error(result.error || "Export failed"); return }
    downloadCsv(result.data.csv, `${noun.replaceAll(" ", "-")}s.csv`)
    toast.success(`Exported ${rows.length} ${noun}${rows.length === 1 ? "" : "s"}`)
  }

  return <QueueScreen<DocumentQueueRow>
    origin={arrival?.origin ?? null}
    initialMissing={arrival?.initialMissing}
    title={title}
    basePath={basePath}
    rows={rows}
    rowId={(row) => row.id}
    rowName={(row) => ({
      title: row.supplier ?? row.institution ?? row.filename,
      suffix: purchaseOrders && row.po ? [row.po.poNumber, row.po.invoiceCount ? `${row.po.invoiceCount} invoice${row.po.invoiceCount === 1 ? "" : "s"}` : null, row.po.fullyInvoiced ? "Fully invoiced" : null].filter(Boolean).join(" · ") || row.filename : row.supplier || row.institution ? row.filename : null,
    })}
    archivedToast={{ archived: "Archived — now under Closed", unarchived: "Unarchived — back in Open" }}
    leading={(row) => <StateGlyph status={row.status} />}
    columns={columns}
    fieldTable={fieldTable}
    selectable
    sortOptions={SORTS}
    facets={purchaseOrders ? PURCHASE_ORDER_FACETS : DOCUMENT_FACETS}
    views={views}
    viewsPhone={viewsPhone}
    stat={stat}
    onExportAll={exportAll}
    initialSelectedId={initialSelectedId}
    // #261: card rows below `md`; the label follows spec §2's column order for each branch.
    cards={{ below: "md", label: (row) => {
      const state = STATUS_LABEL[row.status] ?? row.status.replaceAll("_", " ")
      const attention = needsAttention.has(row.id) ? "Needs attention" : null
      return (purchaseOrders
        ? [row.supplier ?? `Unknown ${supplierLabel.toLowerCase()}`, row.total ?? "No amount", row.po?.poNumber, `Received ${formatDate(row.receivedAt)}`,
          row.po ? (row.po.fullyInvoiced ? "Fully invoiced" : row.po.overLines ? `Open, ${row.po.overLines} line${row.po.overLines === 1 ? "" : "s"} over` : "Open") : null, state, attention]
        : [row.supplier ?? row.institution ?? row.filename, row.total ?? "No amount", `Received ${formatDate(row.receivedAt)}`, row.category, state, attention]
      ).filter(Boolean).join(", ")
    } }}
    empty={{
      firstUse: { title: `No ${noun}s yet.`, body: emptyBody },
      done: todayOutcome ? { body: `${todayOutcome.approvedToday} approved today, ${todayOutcome.postedToday} posted.` } : undefined,
    }}
    workspaceDocumentCount={workspaceDocumentCount}
    loadDetail={(documentId) => getQueueDetailAction(workspaceId, documentId)}
    bulkActions={({ selectedIds, clear }) => <DocumentBulkActions
      workspaceId={workspaceId} noun={noun} selectedIds={selectedIds} clear={clear} toRecord={toRecord}
      eligibleIds={selectedIds.filter((id) => byId.get(id)?.status !== "failed" && byId.get(id)?.status !== "queued")} exportFilename={`${noun.replaceAll(" ", "-")}s.csv`}
      onHeldBack={(heldBack, approved) => setNeedsAttention((prev) => { const next = new Set(prev); for (const id of heldBack) next.add(id); for (const id of approved) next.delete(id); return next })} />}
    paneActions={(row, { refresh }) => <DocumentPaneActions workspaceId={workspaceId} documentId={row.id} noun={noun} status={row.status} openReviewTaskId={null} onDone={refresh} />} />
}
