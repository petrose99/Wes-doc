import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export type DocumentMatchRow = {
  id: string
  role: "source" | "target"
  otherDocumentId: string
  otherFilename: string | null
  matchType: string
  confidence: number
  status: string
  discrepancies: { field: string; expected: string; actual: string }[]
}

/** WP-AP1: DocumentMatch panel on the document detail page. Lists any 2/3-way matches involving
 * this document (as source OR target). A discrepancy count is the primary signal — a match with
 * an empty discrepancies list is a clean tie between a PO and its invoice, worth showing so the
 * reviewer can see the link, but the reviewer's attention should land on the discrepancy count.
 *
 * Read-only for now: resolution actions (accept / reject / re-match) come in WP-AP2 once the
 * approval-workflow surface is settled — the same shape the bank-match panel took after its own
 * server-actions were added. */
export function DocumentMatchesPanel({ workspaceId, matches }: {
  workspaceId: string
  matches: DocumentMatchRow[]
}) {
  if (matches.length === 0) return null
  const anyDiscrepancy = matches.some((m) => m.discrepancies.length > 0)
  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader>
        <CardTitle>Matched documents</CardTitle>
        <CardDescription>
          {anyDiscrepancy
            ? "One or more matches came back with a discrepancy — review before approving."
            : "Linked purchase orders, invoices, and receipts detected for this document."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {matches.map((match) => (
          <div key={match.id} className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <Link
                  href={`/workspaces/${workspaceId}/documents/${match.otherDocumentId}`}
                  className="truncate text-sm font-medium text-slate-800 hover:text-emerald-700 hover:underline"
                >
                  {match.otherFilename ?? match.otherDocumentId.slice(0, 8)}
                </Link>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                  <span>{labelForMatchType(match.matchType)}</span>
                  <span>·</span>
                  <span>{Math.round(match.confidence * 100)}% confidence</span>
                  <span>·</span>
                  <span>{match.role === "source" ? "this document is the source" : "this document is the target"}</span>
                </div>
              </div>
              {match.discrepancies.length > 0 && (
                <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                  {match.discrepancies.length} discrepancy{match.discrepancies.length === 1 ? "" : "ies"}
                </span>
              )}
            </div>
            {match.discrepancies.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-slate-600">
                {match.discrepancies.map((d, i) => (
                  <li key={`${match.id}-${i}`} className="flex flex-wrap items-center gap-1">
                    <span className="font-medium text-slate-700">{d.field}:</span>
                    <span>expected</span>
                    <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px] text-slate-800">{d.expected}</code>
                    <span>got</span>
                    <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px] text-slate-800">{d.actual}</code>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function labelForMatchType(matchType: string): string {
  switch (matchType) {
    case "po_to_invoice": return "PO → Invoice"
    case "invoice_to_receipt": return "Invoice → Receipt"
    case "po_to_receipt": return "PO → Receipt"
    default: return matchType
  }
}
