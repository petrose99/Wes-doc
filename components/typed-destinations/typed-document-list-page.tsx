import { FileText, Plus } from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"

import { getCurrentUser } from "@/lib/auth"
import { type DocType, resolveDocTypeSpec } from "@/lib/doc-types"
import { documentDestinationPath } from "@/lib/typed-destinations"
import { listWorkspaceDocuments, summarizeDocumentForReview } from "@/models/documents"
import { requireWorkspaceRole } from "@/models/workspaces"

export async function TypedDocumentListPage({ params, docType, title, description, action, metric }: {
  params: Promise<{ workspaceId: string }>
  docType: DocType
  title: string
  description: string
  action?: { href: string; label: string }
  /** #205's one-metric header strip — a `MetricStrip`, rendered below the header and above the
   * queue. Optional so a demoted type's Archive listing (which this component also serves) stays
   * unchanged. */
  metric?: ReactNode
}) {
  const { workspaceId } = await params
  const user = await getCurrentUser()
  const membership = await requireWorkspaceRole(workspaceId, user.id)
  const documents = await listWorkspaceDocuments(workspaceId, { docType })
  const base = `/workspaces/${workspaceId}`

  return (
    <main className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">{title}</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">{description}</p>
        </div>
        {action && (
          <Link href={action.href} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2">
            <Plus className="h-4 w-4" />
            {action.label}
          </Link>
        )}
      </header>

      {metric}

      <section aria-labelledby={`${docType}-queue-heading`}>
        <div className="mb-3 flex items-center gap-2">
          <FileText className="h-4 w-4 text-emerald-600" />
          <h2 id={`${docType}-queue-heading`} className="text-sm font-semibold text-slate-800">
            {documents.length} {resolveDocTypeSpec({ docType }).label.toLowerCase()}{documents.length === 1 ? "" : "s"}
          </h2>
        </div>

        {documents.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-6 py-14 text-center">
            <FileText className="mx-auto h-9 w-9 text-slate-300" />
            <p className="mt-3 text-sm font-medium text-slate-600">No {title.toLowerCase()} yet.</p>
            <p className="mt-1 text-xs text-slate-400">Documents assigned to this destination will appear here after extraction.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-medium">File</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Received</th>
                  <th className="px-4 py-3 font-medium">Summary</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((document) => {
                  const review = summarizeDocumentForReview(document, membership.workspace.baseCurrency)
                  return (
                    <tr key={document.id} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <Link href={documentDestinationPath(base, document)} className="font-medium text-slate-800 hover:text-emerald-700 hover:underline">
                          {document.filename}
                        </Link>
                        <div className="mt-0.5 text-xs text-slate-400">{document.template?.name ?? title}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium capitalize text-slate-700">{document.status.replaceAll("_", " ")}</span>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate-500">{document.receivedAt.toISOString().slice(0, 10)}</td>
                      <td className="px-4 py-3 text-slate-600">{review.supplier ?? review.category}{review.total ? ` · ${review.total}` : ""}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}

