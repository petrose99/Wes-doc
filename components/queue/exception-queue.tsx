"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { AlertTriangle, ChevronDown, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { QueueScreen, type QueueColumn, type SortOption } from "@/components/queue/queue-screen"
import { formatDate, TitleCell } from "@/components/queue/row-cells"
import { DueDateCountdownBadge } from "@/components/documents/countdown-badge"
import { ReasonDialog } from "@/components/list-screen/reason-dialog-button"
import type { Facet } from "@/components/queue/facet-filters"
import { getQueueDetailAction } from "@/app/(app)/workspaces/[workspaceId]/queue-actions"
import type { ExceptionResolution, ExceptionRow } from "@/models/exceptions"

const RESOLUTIONS: Array<{ value: ExceptionResolution; label: string; description: string; placeholder: string }> = [
  { value: "corrected", label: "Corrected", description: "The document's field was wrong and has been fixed.", placeholder: "What was corrected?" },
  { value: "vendor_accepted", label: "Vendor accepted as-is", description: "The vendor confirmed the document is right as it stands.", placeholder: "What did the vendor say?" },
  { value: "false_positive", label: "False positive", description: "The check flagged this in error. Nothing is actually wrong.", placeholder: "Why is this a false positive?" },
]

export const EXCEPTION_FACETS: Facet[] = [
  { param: "status", label: "Status", options: [{ value: "open", label: "Open" }, { value: "in_review", label: "In review" }] },
]

const SORTS: SortOption<ExceptionRow>[] = [
  { key: "newest", label: "Newest first", compare: () => 0 },
  { key: "oldest", label: "Oldest first", compare: (a, b) => a.escalatedAt.getTime() - b.escalatedAt.getTime() },
  { key: "amount", label: "Amount, high to low", compare: (a, b) => (b.amount ?? -Infinity) - (a.amount ?? -Infinity) },
]

function formatAmount(amount: number | null, currencyCode: string | null): string {
  if (amount === null) return "—"
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency: currencyCode ?? "USD", maximumFractionDigits: 2 }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currencyCode ?? ""}`.trim()
  }
}

/** #210's Exceptions list on the Queue screen (#225). A row is one escalated check, not one
 * document, so the Detail pane opens the *document* behind the row (`detailIdFor`) while the
 * sticky bar carries the row's own decision: Start review, then Resolve with a reason. No
 * checkbox column: exceptions resolve one at a time. */
export function ExceptionQueue({ workspaceId, basePath, documentBasePath, exceptions, startReviewAction, resolveAction, initialSelectedId }: {
  workspaceId: string
  basePath: string
  documentBasePath: string
  exceptions: ExceptionRow[]
  startReviewAction: (checkResultId: string) => Promise<{ success: boolean; error?: string }>
  resolveAction: (checkResultId: string, resolution: ExceptionResolution, formData: FormData) => Promise<{ success: boolean; error?: string }>
  initialSelectedId?: string | null
}) {
  const router = useRouter()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [resolving, setResolving] = useState<{ row: ExceptionRow; resolution: (typeof RESOLUTIONS)[number] } | null>(null)

  const columns: QueueColumn<ExceptionRow>[] = [
    {
      key: "document", label: "Document", narrow: true, className: "min-w-[12rem]",
      render: (row) => <TitleCell title={row.vendor ?? row.filename} subtitle={row.docTypeLabel} />,
    },
    { key: "check", label: "Check", className: "min-w-[14rem] text-slate-700", render: (row) => <>{row.message}</> },
    { key: "invoiceNumber", label: "Invoice #", className: "whitespace-nowrap text-slate-700", render: (row) => <>{row.invoiceNumber ?? <span className="text-slate-400">—</span>}</> },
    { key: "amount", label: "Amount", narrow: true, className: "whitespace-nowrap text-right tabular-nums text-slate-900", render: (row) => <>{formatAmount(row.amount, row.currencyCode)}</> },
    { key: "due", label: "Due", className: "whitespace-nowrap", render: (row) => <DueDateCountdownBadge dueDate={row.dueDate} /> },
    {
      key: "status", label: "Status", narrow: true,
      render: (row) => <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${row.escalationStatus === "in_review" ? "bg-blue-100 text-blue-800" : "bg-amber-100 text-amber-900"}`}>
        {row.escalationStatus === "in_review" ? "In review" : "Open"}
      </span>,
    },
    { key: "assignee", label: "Assignee", className: "whitespace-nowrap text-slate-700", render: (row) => <>{row.assigneeName ?? <span className="text-slate-500">Unassigned</span>}</> },
    { key: "escalated", label: "Escalated", className: "whitespace-nowrap tabular-nums text-slate-700", render: (row) => <>{formatDate(row.escalatedAt)}</> },
  ]

  const startReview = async (id: string, refresh: () => void) => {
    setPendingId(id)
    try {
      const result = await startReviewAction(id)
      if (!result.success) { toast.error(result.error || "Could not start the review"); return }
      refresh()
    } catch {
      toast.error("Could not reach the server")
    } finally {
      setPendingId(null)
    }
  }

  return <>
    <QueueScreen<ExceptionRow>
      title="Exceptions"
      basePath={basePath}
      rows={exceptions}
      rowId={(row) => row.id}
      detailIdFor={(row) => row.documentId}
      rowName={(row) => ({ title: row.vendor ?? row.filename, suffix: row.message })}
      // A row here is one escalated check, so the pane's full mode is the *document's* route (#259).
      fullHref={(row) => `${documentBasePath}/${row.documentId}?full=1`}
      leading={() => <AlertTriangle className="h-4 w-4 text-amber-700" aria-hidden />}
      columns={columns}
      sortOptions={SORTS}
      facets={EXCEPTION_FACETS}
      initialSelectedId={initialSelectedId}
      empty={{ title: "No open exceptions.", body: "Escalate a check from a document's field rationale to send it here. Resolved exceptions drop off this list." }}
      loadDetail={(documentId) => getQueueDetailAction(workspaceId, documentId)}
      paneActions={(row, { refresh }) => <>
        <span className="w-full text-xs text-slate-600 sm:mr-auto sm:w-auto">{row.escalationStatus === "in_review" ? `In review${row.assigneeName ? ` by ${row.assigneeName}` : ""}.` : "Open. Start the review to claim it."}</span>
        {row.escalationStatus === "open" && <Button type="button" size="sm" variant="outline" disabled={pendingId === row.id} onClick={() => void startReview(row.id, refresh)}>
          {pendingId === row.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}{pendingId === row.id ? "Starting…" : "Start review"}
        </Button>}
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" size="sm">Resolve<ChevronDown className="h-3.5 w-3.5" aria-hidden /></Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-1">
            {RESOLUTIONS.map((resolution) => <button key={resolution.value} type="button" onClick={() => setResolving({ row, resolution })}
              className="flex w-full flex-col items-start rounded-sm px-2.5 py-2 text-left hover:bg-slate-100">
              <span className="text-sm font-medium text-slate-800">{resolution.label}</span>
              <span className="text-xs text-slate-600">{resolution.description}</span>
            </button>)}
          </PopoverContent>
        </Popover>
      </>} />

    <ReasonDialog open={resolving !== null} onClose={() => setResolving(null)}
      action={async (formData) => {
        if (!resolving) return { success: false, error: "No exception selected" }
        const result = await resolveAction(resolving.row.id, resolving.resolution.value, formData)
        if (result.success) { toast.success("Exception resolved"); router.refresh() }
        return result
      }}
      title={resolving ? `Resolve: ${resolving.resolution.label}` : "Resolve"}
      description={resolving?.resolution.description ?? ""}
      submitLabel="Resolve exception"
      placeholder={resolving?.resolution.placeholder ?? ""} />
  </>
}
