"use client"

import { useEffect, useState, type ReactNode } from "react"
import { Loader2, X } from "lucide-react"

/** #215: the shared inline expansion surface for a list-screen row. `loadDetail` is a Server
 * Action (e.g. `getInlineDocumentDetailAction`) that returns the same `<SplitPane>` JSX the
 * standalone `/documents/[documentId]` route renders — this panel owns only the loading/closed
 * lifecycle around it, not the detail rendering itself, so the two stay in sync automatically. */
export function InlineDocumentPanel({ documentId, stage, loadDetail, onClose }: {
  documentId: string
  stage?: string
  loadDetail: (documentId: string, stage?: string) => Promise<ReactNode>
  onClose: () => void
}) {
  const [content, setContent] = useState<ReactNode | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    loadDetail(documentId, stage)
      .then((node) => { if (!cancelled) setContent(node) })
      .catch(() => { if (!cancelled) setError("Couldn't load this document's details.") })
    return () => { cancelled = true }
    // Caller mounts a fresh panel per open row (documentId is stable for its lifetime), so there's
    // no in-place documentId change to reset state for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="border-b bg-white" role="region" aria-label="Document detail">
      <div className="flex items-center justify-between border-b bg-slate-50/60 px-4 py-2">
        <span className="text-sm font-medium text-slate-600">Document detail</span>
        <button type="button" onClick={onClose} aria-label="Close detail"
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="max-h-[75vh] overflow-y-auto">
        {error ? (
          <p className="p-6 text-sm text-red-600">{error}</p>
        ) : content ?? (
          <div className="flex items-center justify-center gap-2 p-12 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        )}
      </div>
    </div>
  )
}
