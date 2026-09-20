"use client"

import { globalSearchAction, type GlobalSearchResult } from "@/app/(app)/workspaces/[workspaceId]/search-actions"
import { getQueueDetailAction } from "@/app/(app)/workspaces/[workspaceId]/queue-actions"
import type { SearchResultItem } from "@/lib/global-search"
import { QueueScreen, type QueueColumn } from "@/components/queue/queue-screen"
import { Search } from "lucide-react"
import { useEffect, useRef, useState, useTransition } from "react"

/** #270: Search rebuilt on the Queue-screen shell (#225), replacing the standalone box+list page
 * built for #262's `/` key. The predicate/columns/facets here are a step-1 skeleton — #270's
 * later steps replace them with the every-document predicate, real columns and facets, and the
 * empty/zero-result/slow states (spec.md §1–3). Ask AI/Sparkles/AssistantPanel are retired from
 * this page per #245 decision 7 ("One box, one mode") — no replacement for them here.
 */
export function SearchPageClient({ workspaceId, initialQuery }: {
  workspaceId: string
  initialQuery: string
}) {
  const [query, setQuery] = useState(initialQuery)
  const [result, setResult] = useState<GlobalSearchResult | null>(null)
  const [searching, startSearch] = useTransition()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // #262: arrival from the `/` shortcut — the input already autofocuses on mount, this only
  // matters when the operator was already on this page and pressed `/` again.
  useEffect(() => {
    if (typeof window === "undefined") return
    if (window.sessionStorage.getItem("docubite.pendingFocus") !== "search") return
    window.sessionStorage.removeItem("docubite.pendingFocus")
    document.getElementById("search-input")?.focus()
  }, [])

  useEffect(() => {
    if (!query.trim()) { setResult(null); return }
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      startSearch(async () => {
        const r = await globalSearchAction(workspaceId, query)
        setResult(r)
      })
    }, 300)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [workspaceId, query])

  const basePath = `/workspaces/${workspaceId}/search`
  const rows = result?.items ?? []

  // Step-1 skeleton columns — step 2 replaces these with the spec's real column set (mark, Type,
  // Supplier, Number, Date, Amount, Ledger mark).
  const columns: QueueColumn<SearchResultItem>[] = [
    { key: "filename", label: "Document", phone: "title", render: (item) => item.filename },
    { key: "supplier", label: "Supplier", render: (item) => item.supplier ?? "—" },
    { key: "date", label: "Date", render: (item) => item.date ?? "—" },
    { key: "total", label: "Amount", render: (item) => item.total ?? "—" },
  ]

  return (
    <QueueScreen<SearchResultItem>
      title="Search"
      basePath={basePath}
      rows={rows}
      rowId={(item) => item.id}
      detailIdFor={(item) => item.documentId}
      rowName={(item) => ({ title: item.filename })}
      columns={columns}
      views={
        <span className="inline-flex h-9 w-full max-w-xl flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 shadow-sm focus-within:border-emerald-300 focus-within:ring-2 focus-within:ring-emerald-100">
          <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
          <label htmlFor="search-input" className="sr-only">Search documents</label>
          <input
            id="search-input"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by supplier, number, amount or any words on the page"
            className="flex-1 bg-transparent text-sm outline-none"
            autoFocus
          />
          {searching && <span className="sr-only" role="status">Searching…</span>}
        </span>
      }
      empty={{ firstUse: { title: "Search your documents.", body: "Search by supplier, number, amount or any words on the page." } }}
      loadDetail={(documentId) => getQueueDetailAction(workspaceId, documentId)}
    />
  )
}
