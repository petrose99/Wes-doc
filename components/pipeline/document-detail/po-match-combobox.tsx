"use client"

import { confirmPoMatchAction, listPoCandidatesAction, replacePoMatchAction, type PoMatchActionData } from "@/app/(app)/workspaces/[workspaceId]/po-match-actions"
import { formatAmount } from "@/components/documents/po-compare"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { ActionState } from "@/lib/actions"
import type { PoLink } from "@/models/po-matching"
import { Loader2, Search } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

type Candidate = { documentId: string; poNumber: string | null; supplier: string | null; total: number | null; sameSupplier: boolean; invoicedPercent: number | null }

const describe = (poNumber: string | null, supplier: string | null, total: number | null, currency: string | null) =>
  [poNumber ?? "PO", supplier, formatAmount(total, currency)].filter(Boolean).join(" · ")

const invoicedLine = (invoicedPercent: number | null) => invoicedPercent === null ? "Not yet invoiced" : `${invoicedPercent}% invoiced`

/** #356 Q3 / #363: the one control a PO is picked from — Suggested (from the matcher,
 * confidence-sorted) and Open (server search, debounced) collapsed into a single popover so
 * there is exactly one place to choose a PO, not two (H4). Suggested rows confirm the existing
 * match; Open rows replace it — same two server actions as before, reached through one trigger. */
export function PoMatchCombobox({ workspaceId, documentId, link, suggestions, currency, busy, apply }: {
  workspaceId: string
  documentId: string
  link: PoLink | null
  suggestions: PoLink[]
  currency: string | null
  busy: "confirm" | "reject" | "replace" | "done" | null
  apply: (label: "confirm" | "reject" | "replace" | "done", run: () => Promise<ActionState<PoMatchActionData>>) => Promise<boolean>
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [candidates, setCandidates] = useState<{ candidates: Candidate[]; truncated: boolean; total: number } | null>(null)
  const [searching, setSearching] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  const searchSeq = useRef(0)
  const search = async (needle: string) => {
    const seq = ++searchSeq.current
    setSearching(true)
    try {
      const result = await listPoCandidatesAction(workspaceId, documentId, needle)
      if (seq !== searchSeq.current) return
      if (!result.success || !result.data) { toast.error(result.error || "Could not list Purchase Orders"); return }
      setCandidates(result.data)
    } finally { if (seq === searchSeq.current) setSearching(false) }
  }
  useEffect(() => {
    if (!open) return
    const handle = window.setTimeout(() => { void search(query) }, 250)
    return () => window.clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open])
  useEffect(() => { if (!open) { setQuery(""); setCandidates(null) } }, [open])

  const suggestedIds = new Set(suggestions.map((s) => s.poDocumentId))
  const openCandidates = (candidates?.candidates ?? []).filter((c) => !suggestedIds.has(c.documentId))

  const pickSuggested = async (candidate: PoLink) => {
    const ok = await apply("confirm", () => confirmPoMatchAction(workspaceId, documentId, candidate.matchId))
    if (ok) setOpen(false)
  }
  const pickOpen = async (candidate: Candidate) => {
    const ok = await apply("replace", () => replacePoMatchAction(workspaceId, documentId, candidate.documentId))
    if (ok) { setOpen(false); toast.success(`Now comparing against ${candidate.poNumber ?? "the chosen PO"}.`) }
  }

  const onListKeyDown = (event: React.KeyboardEvent) => {
    const options = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled)') ?? [])
    if (!options.length) return
    const current = options.indexOf(document.activeElement as HTMLButtonElement)
    if (event.key === "ArrowDown") { event.preventDefault(); options[(current + 1 + options.length) % options.length]?.focus() }
    else if (event.key === "ArrowUp") { event.preventDefault(); options[(current - 1 + options.length) % options.length]?.focus() }
    else if (event.key === "Home") { event.preventDefault(); options[0]?.focus() }
    else if (event.key === "End") { event.preventDefault(); options[options.length - 1]?.focus() }
  }

  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <button type="button" disabled={busy !== null}
        className="inline-flex min-h-8 items-center rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-60">
        {link ? "Change PO…" : "Choose a PO…"}
      </button>
    </PopoverTrigger>
    <PopoverContent align="start" className="w-80 max-w-[90vw] p-2" onKeyDown={onListKeyDown}>
      <label className="relative block">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" aria-hidden="true" />
        <input type="search" aria-label="Search Purchase Orders" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="PO number or supplier" autoFocus
          className="min-h-8 w-full rounded-md border border-slate-300 bg-white pl-7 pr-2 text-xs text-slate-800 placeholder:text-slate-500 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100" />
      </label>
      <div ref={listRef} role="listbox" aria-label="Purchase Orders" aria-busy={searching} className="mt-1.5 max-h-64 space-y-2 overflow-y-auto">
        {suggestions.length > 0 && <div>
          <p className="px-1 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Suggested</p>
          <ul className="divide-y divide-slate-100">
            {suggestions.map((candidate) => <li key={candidate.matchId}>
              <button type="button" role="option" disabled={busy !== null}
                aria-label={[candidate.poNumber ?? "PO", candidate.poSupplier, formatAmount(candidate.poTotal, currency), invoicedLine(candidate.invoicedPercent)].filter(Boolean).join(", ")}
                onClick={() => pickSuggested(candidate)}
                className="flex min-h-9 w-full flex-col items-start gap-0.5 rounded-md px-1.5 py-1 text-left text-xs text-slate-800 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500 disabled:opacity-50">
                <span className="flex w-full items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">{busy === "confirm" && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />}<span className="truncate">{describe(candidate.poNumber, candidate.poSupplier, candidate.poTotal, currency)}</span></span>
                  <span className="shrink-0 text-emerald-700">{Math.round(candidate.confidence * 100)}% likely</span>
                </span>
                <span className="text-[11px] text-slate-500">{invoicedLine(candidate.invoicedPercent)}</span>
              </button>
            </li>)}
          </ul>
        </div>}

        <div>
          <p className="px-1 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Open</p>
          {candidates === null
            ? <p className="flex items-center gap-1.5 px-1.5 py-2 text-xs text-slate-600"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />Loading Purchase Orders…</p>
            : openCandidates.length === 0
              ? <p className="px-1.5 py-2 text-xs text-slate-600" role="status">{candidates.total === 0 && !query ? "No Purchase Orders in this workspace yet. Add one on the Purchase Orders queue first." : `No Purchase Order in this workspace matches “${query}”.`}</p>
              : <ul className="divide-y divide-slate-100">
                {candidates.truncated && <li className="px-1.5 py-1 text-[11px] text-slate-500" role="status">Showing the first {openCandidates.length} of {candidates.total}. Type a PO number or supplier to narrow it.</li>}
                {openCandidates.map((candidate) => <li key={candidate.documentId}>
                  <button type="button" role="option" disabled={busy !== null || candidate.documentId === link?.poDocumentId}
                    aria-label={[candidate.poNumber ?? "PO", candidate.supplier, formatAmount(candidate.total, currency), invoicedLine(candidate.invoicedPercent), candidate.documentId === link?.poDocumentId ? "current" : null].filter(Boolean).join(", ")}
                    onClick={() => pickOpen(candidate)}
                    className="flex min-h-9 w-full flex-col items-start gap-0.5 rounded-md px-1.5 py-1 text-left text-xs text-slate-800 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500 disabled:opacity-50">
                    <span className="flex w-full items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5">{busy === "replace" && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />}<span className="truncate">{describe(candidate.poNumber, candidate.supplier, candidate.total, currency)}</span></span>
                      {candidate.documentId === link?.poDocumentId ? <span className="shrink-0 text-slate-500">current</span> : candidate.sameSupplier ? <span className="shrink-0 text-emerald-700">same supplier</span> : null}
                    </span>
                    <span className="text-[11px] text-slate-500">{invoicedLine(candidate.invoicedPercent)}</span>
                  </button>
                </li>)}
              </ul>}
        </div>
      </div>
    </PopoverContent>
  </Popover>
}
