"use client"

import { useState, type ReactNode } from "react"
import { toast } from "sonner"
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, Search } from "lucide-react"
import { QueueScreen, type QueueColumn, type SortOption } from "@/components/queue/queue-screen"
import { PaneMenuItem } from "@/components/queue/detail-pane"
import { DocumentBulkActions, DocumentPaneActions } from "@/components/queue/document-actions"
import { formatDate, TitleCell } from "@/components/queue/row-cells"
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
}

export const DOCUMENT_FACETS: Facet[] = [
  {
    param: "status", label: "Status",
    sections: [
      { label: "Open", options: [{ value: "queued", label: "Processing" }, { value: "needs_review", label: "Needs review" }, { value: "ready_for_review", label: "Ready for review" }] },
      { label: "Closed", options: [{ value: "reviewed", label: "Reviewed" }, { value: "failed", label: "Failed" }] },
    ],
  },
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

export function DocumentQueue({ workspaceId, basePath, title, noun, itemType, rows, supplierLabel = "Supplier", views, stat, initialSelectedId, emptyBody, showInstitution = false }: {
  workspaceId: string
  basePath: string
  title: string
  /** Singular, lower-case, for copy: "purchase order", "bank statement". */
  noun: string
  itemType: ItemizedRecord["type"]
  rows: DocumentQueueRow[]
  supplierLabel?: string
  views?: ReactNode
  stat?: ReactNode
  initialSelectedId?: string | null
  emptyBody: string
  showInstitution?: boolean
}) {
  const [needsAttention, setNeedsAttention] = useState<Set<string>>(new Set())
  const byId = new Map(rows.map((row) => [row.id, row]))
  const toRecord = (id: string): ItemizedRecord => {
    const row = byId.get(id)
    return { id, type: itemType, vendor: row?.supplier ?? null, number: null, amount: null, currencyCode: null, dateLabel: "Received", date: row?.receivedAt ?? null }
  }

  const columns: QueueColumn<DocumentQueueRow>[] = [
    {
      key: "supplier", label: supplierLabel, narrow: true, className: "min-w-[12rem]",
      render: (row) => <TitleCell title={row.supplier ?? (showInstitution ? row.institution ?? null : null)} subtitle={row.filename} missingLabel={`Unknown ${supplierLabel.toLowerCase()}`} />,
    },
    ...(showInstitution ? [{ key: "institution", label: "Institution", className: "whitespace-nowrap text-slate-700", render: (row: DocumentQueueRow) => <>{row.institution ?? "—"}</> }] : []),
    { key: "amount", label: "Amount", narrow: true, className: "whitespace-nowrap text-right tabular-nums text-slate-900", render: (row) => <>{row.total ?? "—"}</> },
    { key: "received", label: "Received", narrow: true, className: "whitespace-nowrap tabular-nums text-slate-700", render: (row) => <>{formatDate(row.receivedAt)}</> },
    { key: "category", label: "Category", className: "text-slate-700", render: (row) => <>{row.category}</> },
    {
      key: "state", label: "State",
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
    title={title}
    basePath={basePath}
    rows={rows}
    rowId={(row) => row.id}
    rowTitle={(row) => row.supplier ?? row.institution ?? row.filename}
    rowSubtitle={(row) => row.supplier || row.institution ? row.filename : null}
    leading={(row) => <StateGlyph status={row.status} />}
    columns={columns}
    selectable
    sortOptions={SORTS}
    facets={DOCUMENT_FACETS}
    views={views}
    stat={stat}
    onExportAll={exportAll}
    initialSelectedId={initialSelectedId}
    empty={{ title: `No ${noun}s yet.`, body: emptyBody }}
    loadDetail={(documentId) => getQueueDetailAction(workspaceId, documentId)}
    bulkActions={({ selectedIds, clear }) => <DocumentBulkActions
      workspaceId={workspaceId} noun={noun} selectedIds={selectedIds} clear={clear} toRecord={toRecord}
      eligibleIds={selectedIds.filter((id) => byId.get(id)?.status !== "failed" && byId.get(id)?.status !== "queued")} exportFilename={`${noun.replaceAll(" ", "-")}s.csv`}
      onHeldBack={(heldBack, approved) => setNeedsAttention((prev) => { const next = new Set(prev); for (const id of heldBack) next.add(id); for (const id of approved) next.delete(id); return next })} />}
    paneActions={(row, { refresh }) => <DocumentPaneActions workspaceId={workspaceId} documentId={row.id} noun={noun} status={row.status} openReviewTaskId={null} onDone={refresh} />}
    paneMenu={(row) => <PaneMenuItem onClick={() => window.open(`${basePath}/${row.id}?full=1`, "_blank", "noopener")}>
      <ExternalLink className="mr-2 h-4 w-4 text-slate-500" aria-hidden />Open in a new tab
    </PaneMenuItem>} />
}
