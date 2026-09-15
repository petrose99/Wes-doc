"use client"

import Link from "next/link"
import { Fragment, useState } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle } from "lucide-react"
import { ReasonDialogButton } from "@/components/list-screen/reason-dialog-button"
import type { ExceptionResolution, ExceptionRow } from "@/models/exceptions"

const RESOLUTIONS: Array<{ value: ExceptionResolution; label: string; description: string; placeholder: string }> = [
  { value: "corrected", label: "Corrected", description: "The document's field was wrong and has been fixed.", placeholder: "What was corrected?" },
  { value: "vendor_accepted", label: "Vendor contacted, accepted as-is", description: "The vendor confirmed the document is right as it stands.", placeholder: "What did the vendor say?" },
  { value: "false_positive", label: "Dismiss as false positive", description: "The check flagged this in error — nothing is actually wrong.", placeholder: "Why is this a false positive?" },
]

function formatAmount(amount: number | null, currencyCode: string | null): string {
  if (amount === null) return "—"
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency: currencyCode ?? "USD", maximumFractionDigits: 2 }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currencyCode ?? ""}`.trim()
  }
}

/** #210 (Wayfinder map 177): the Exceptions list. One row per escalated check (not per document),
 * per the ticket's row-unit decision — row anatomy (62px height, cell padding, pill shapes) copied
 * from InvoiceTable/ReceiptTable (#199) so the surface reads as the same product, not a bespoke
 * table. No bulk bar: exceptions are resolved one at a time, each with its own required reason —
 * the expandable resolve panel follows InlineDocumentPanel's own `<tr><td colSpan>` pattern rather
 * than inventing a new one. */
export function ExceptionsTable({ documentBasePath, exceptions, startReviewAction, resolveAction }: {
  /** Base path for the document detail route, e.g. `/workspaces/<id>/documents`. */
  documentBasePath: string
  exceptions: ExceptionRow[]
  startReviewAction: (checkResultId: string) => Promise<{ success: boolean; error?: string }>
  resolveAction: (checkResultId: string, resolution: ExceptionResolution, formData: FormData) => Promise<{ success: boolean; error?: string }>
}) {
  const router = useRouter()
  const [openRowId, setOpenRowId] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)

  const startReview = async (id: string) => {
    setPendingId(id)
    try {
      const result = await startReviewAction(id)
      if (result.success) router.refresh()
    } finally {
      setPendingId(null)
    }
  }

  if (exceptions.length === 0) return null

  return (
    <div className="-mx-6 overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="px-4 py-2 font-medium">Document</th>
            <th className="px-4 py-2 font-medium">Check</th>
            <th className="px-4 py-2 font-medium">Amount</th>
            <th className="px-4 py-2 font-medium">Status</th>
            <th className="px-4 py-2 font-medium">Assignee</th>
            <th className="w-44 px-4 py-2 font-medium">Action</th>
          </tr>
        </thead>
        <tbody>
          {exceptions.map((row) => {
            const open = openRowId === row.id
            return (
              <Fragment key={row.id}>
                <tr className={`border-b border-slate-100 transition-colors hover:bg-slate-50 ${open ? "bg-emerald-50/40" : ""}`} style={{ height: 62 }}>
                  <td className="px-4 py-2.5 min-w-0">
                    <Link href={`${documentBasePath}/${row.documentId}`} className="flex items-center gap-1.5 truncate font-medium text-emerald-800 hover:underline">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden />
                      <span className="truncate">{row.vendor ?? row.filename}</span>
                    </Link>
                    <p className="truncate text-xs text-slate-400">{row.docTypeLabel}</p>
                  </td>
                  <td className="px-4 py-2.5 text-slate-700">{row.message}</td>
                  <td className="px-4 py-2.5 tabular-nums text-slate-800">{formatAmount(row.amount, row.currencyCode)}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${row.escalationStatus === "in_review" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600"}`}>
                      {row.escalationStatus === "in_review" ? "In review" : "Open"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{row.assigneeName ?? "Unassigned"}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      {row.escalationStatus === "open" && (
                        <button type="button" disabled={pendingId === row.id}
                          onClick={() => startReview(row.id)}
                          className="inline-flex min-h-6 items-center rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-40">
                          {pendingId === row.id ? "Starting…" : "Start review"}
                        </button>
                      )}
                      <button type="button"
                        onClick={() => setOpenRowId(open ? null : row.id)}
                        aria-expanded={open}
                        className="inline-flex min-h-6 items-center rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800 transition-colors hover:bg-emerald-100">
                        Resolve…
                      </button>
                    </div>
                  </td>
                </tr>
                {open && (
                  <tr>
                    <td colSpan={6} className="border-b border-slate-100 bg-slate-50/60 p-0">
                      <div className="px-4 py-3">
                        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Resolve this exception</p>
                        <div className="flex flex-wrap gap-2">
                          {RESOLUTIONS.map((resolution) => (
                            <ReasonDialogButton key={resolution.value}
                              action={(formData) => resolveAction(row.id, resolution.value, formData).then((result) => { if (result.success) { setOpenRowId(null); router.refresh() } return result })}
                              triggerLabel={resolution.label}
                              title={resolution.label}
                              description={resolution.description}
                              submitLabel="Resolve"
                              placeholder={resolution.placeholder}
                              tone={resolution.value === "false_positive" ? "amber" : "neutral"} />
                          ))}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
