"use client"

import { confirmPoMatchAction, listPoCandidatesAction, rejectPoMatchAction, replacePoMatchAction, setPoLineAssignmentsAction, type PoMatchActionData } from "@/app/(app)/workspaces/[workspaceId]/po-match-actions"
import { formatAmount } from "@/components/documents/po-compare"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import type { ActionState } from "@/lib/actions"
import type { InvoicePoSummary, PoLink } from "@/models/po-matching"
import { Check, Loader2, Search, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { setUnsaved } from "@/lib/client/unsaved-changes"

type Candidate = { documentId: string; poNumber: string | null; supplier: string | null; total: number | null; sameSupplier: boolean }

/** #228 Q7 / Q10 / Q11 / Q13: Match manually, the in-row mode on the line-items section. It
 * confirms, replaces or rejects the invoice's Purchase Order and, through the per-row pickers
 * the editor renders while the mode is on, reassigns line matches. No reason is asked — it
 * changes the facts, it does not accept a variance (that is Override Mode's job). Every change
 * is Server-confirmed: the bar shows the summary the action returned, never a guess. */
export function MatchManuallyBar({ workspaceId, documentId, summary, currency, pendingAssignments, onSummary, onDone, onDiscard }: {
  workspaceId: string
  documentId: string
  summary: InvoicePoSummary | null
  currency: string | null
  pendingAssignments: Record<string, number | null>
  onSummary: (next: InvoicePoSummary | null) => void
  onDone: () => void
  /** Leaves the mode with the pending line matches thrown away. */
  onDiscard: () => void
}) {
  const [busy, setBusy] = useState<"confirm" | "reject" | "replace" | "done" | null>(null)
  const [rejecting, setRejecting] = useState(false)
  const [replacing, setReplacing] = useState(false)
  const [candidates, setCandidates] = useState<{ candidates: Candidate[]; truncated: boolean; total: number } | null>(null)
  const [query, setQuery] = useState("")
  const [searching, setSearching] = useState(false)
  const [escapeNote, setEscapeNote] = useState(false)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const link = summary?.link ?? null
  const dirty = Object.keys(pendingAssignments).length > 0

  const sendBackNote = summary?.approvalRunning ? " The Approval that is running on this invoice will be sent back for review." : ""

  useEffect(() => { headingRef.current?.focus() }, [])
  useEffect(() => {
    setUnsaved("match-manually", dirty ? "Match manually has line matches you have not saved." : null)
    return () => setUnsaved("match-manually", null)
  }, [dirty])
  // Escape leaves the mode when nothing is pending; with pending line matches it does nothing —
  // Discard and Save are the two explicit ways out.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || rejecting) return
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === "SELECT" || target.tagName === "INPUT")) return
      event.stopPropagation()
      if (dirty) { setEscapeNote(true); return }
      onDone()
    }
    // Capture phase, so the Queue screen's Escape (close the pane) never fires from inside the mode.
    document.addEventListener("keydown", onKey, true)
    return () => document.removeEventListener("keydown", onKey, true)
  }, [dirty, rejecting, onDone])

  const apply = async (label: "confirm" | "reject" | "replace" | "done", run: () => Promise<ActionState<PoMatchActionData>>) => {
    setBusy(label)
    try {
      const result = await run()
      if (!result.success || !result.data) { toast.error(result.error || "The change was not saved"); return false }
      onSummary(result.data.summary)
      if (result.data.sentBack) toast.message("Sent back for review", { description: "The Approval that was running returns to review because the PO match changed." })
      return true
    } catch {
      toast.error("Could not reach the server. Nothing changed.")
      return false
    } finally { setBusy(null) }
  }

  // The search runs on the server over every PO in the workspace (a client-side window would
  // hide an older PO the reviewer can name); the query is debounced and the last answer wins.
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
  const openReplace = () => { setReplacing(true); if (!candidates) void search(query) }
  useEffect(() => {
    if (!replacing) return
    const handle = window.setTimeout(() => { void search(query) }, 250)
    return () => window.clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, replacing])

  const finish = async () => {
    if (dirty && link) {
      const ok = await apply("done", () => setPoLineAssignmentsAction(workspaceId, documentId, link.matchId, { ...(link.lineAssignments ?? {}), ...pendingAssignments }))
      if (!ok) return
      toast.success("Line matches saved. Checks re-ran.")
    }
    onDone()
  }

  const filtered = candidates?.candidates ?? []

  const describe = (po: PoLink | Candidate) => [po.poNumber ?? "PO", "supplier" in po ? po.supplier : po.poSupplier, formatAmount("total" in po ? po.total : po.poTotal, currency)].filter(Boolean).join(" · ")

  return <section aria-labelledby="match-manually-title" className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 id="match-manually-title" ref={headingRef} tabIndex={-1} className="text-xs font-semibold text-emerald-900 outline-none">Match manually</h3>
      <span className="flex items-center gap-1.5">
      {dirty && escapeNote && <span role="status" className="text-xs text-slate-700">Save or discard your line matches first.</span>}
      {dirty && <button type="button" onClick={onDiscard} disabled={busy !== null}
        className="inline-flex min-h-8 items-center rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-60">
        Discard changes
      </button>}
      <button type="button" onClick={finish} disabled={busy !== null}
        className="inline-flex min-h-8 items-center gap-1 rounded-md bg-emerald-700 px-3 text-xs font-semibold text-white hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1 disabled:opacity-60">
        {busy === "done" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Check className="h-3.5 w-3.5" aria-hidden="true" />}
        {dirty ? "Save line matches and finish" : "Done"}
      </button>
      </span>
    </div>
    <p className="mt-1 max-w-[60ch] text-xs text-slate-700">
      {link
        ? <>Comparing against <strong className="font-semibold text-slate-900">{describe(link)}</strong>{link.kind === "auto" ? " — matched by the PO number on the invoice, not yet confirmed." : " — confirmed."} Change the PO line on any row below, or change the PO.{sendBackNote}</>
        : summary?.suggestions.length
          ? `Suggested by the matcher — nothing is compared until you confirm a likely PO below, or choose another.${sendBackNote}`
          : summary?.removed ? "The PO link was rejected. Choose a Purchase Order to compare against." : "No Purchase Order is linked. Choose one to compare against."}
    </p>

    {!link && summary?.suggestions.length ? <ul className="mt-2 space-y-1.5" aria-label="Likely Purchase Orders">
      {summary.suggestions.map((candidate) => <li key={candidate.matchId} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed border-slate-400 bg-white px-2.5 py-1.5 text-xs">
        <span className="text-slate-800">{describe(candidate)} <span className="text-slate-500">· {Math.round(candidate.confidence * 100)} % likely</span></span>
        <span className="flex gap-1.5">
          <button type="button" disabled={busy !== null} onClick={() => apply("confirm", () => confirmPoMatchAction(workspaceId, documentId, candidate.matchId))}
            className="inline-flex min-h-7 items-center rounded-md border border-emerald-300 bg-white px-2 font-medium text-emerald-800 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-60">Confirm</button>
          <button type="button" disabled={busy !== null} onClick={async () => { const ok = await apply("reject", () => rejectPoMatchAction(workspaceId, documentId, candidate.matchId)); if (ok) toast.success(`Suggestion rejected — ${candidate.poNumber ?? "that PO"} is not compared.`) }}
            aria-label={`Not ${candidate.poNumber ?? "this PO"} — reject the suggestion`}
            className="inline-flex min-h-7 items-center rounded-md border border-slate-300 bg-white px-2 font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-60">Not this one</button>
        </span>
      </li>)}
    </ul> : null}

    <div className="mt-2 flex flex-wrap gap-1.5">
      {link?.kind === "auto" && <button type="button" disabled={busy !== null} onClick={() => apply("confirm", () => confirmPoMatchAction(workspaceId, documentId, link.matchId))}
        className="inline-flex min-h-8 items-center gap-1 rounded-md border border-emerald-300 bg-white px-2.5 text-xs font-medium text-emerald-800 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-60">
        {busy === "confirm" && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}Confirm {link.poNumber ?? "this PO"}
      </button>}
      <button type="button" disabled={busy !== null} onClick={openReplace}
        className="inline-flex min-h-8 items-center rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-60">
        {link ? "Replace PO…" : "Choose a PO…"}
      </button>
      {link && <button type="button" disabled={busy !== null} onClick={() => setRejecting(true)}
        className="inline-flex min-h-8 items-center rounded-md border border-red-200 bg-white px-2.5 text-xs font-medium text-red-700 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-60">
        Reject PO
      </button>}
    </div>

    {replacing && <div className="mt-2 rounded-md border border-slate-200 bg-white p-2">
      {sendBackNote && <p className="mb-1.5 px-1 text-xs text-slate-700">Replacing the PO re-runs the checks.{sendBackNote}</p>}
      <div className="flex items-center gap-2">
        <label className="relative flex-1">
          
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" aria-hidden="true" />
          <input type="search" aria-label="Search Purchase Orders" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="PO number or supplier" autoFocus
            className="min-h-8 w-full rounded-md border border-slate-300 bg-white pl-7 pr-2 text-xs text-slate-800 placeholder:text-slate-500 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100" />
        </label>
        <button type="button" onClick={() => setReplacing(false)} aria-label="Close the Purchase Order list" className="inline-flex h-8 w-8 items-center justify-center rounded text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"><X className="h-3.5 w-3.5" aria-hidden="true" /></button>
      </div>
      {candidates === null
        ? <p className="flex items-center gap-1.5 px-1 py-2 text-xs text-slate-600"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />Loading Purchase Orders…</p>
        : filtered.length === 0
          ? <p className="px-1 py-2 text-xs text-slate-600" role="status">{candidates.total === 0 && !query ? "No Purchase Orders in this workspace yet. Add one on the Purchase Orders queue first." : `No Purchase Order in this workspace matches “${query}”.`}</p>
          : <ul className="mt-1 max-h-48 divide-y divide-slate-100 overflow-y-auto" aria-label="Purchase Orders" aria-busy={searching}>
            {candidates.truncated && <li className="px-1.5 py-1 text-[11px] text-slate-500" role="status">Showing the first {filtered.length} of {candidates.total}. Type a PO number or supplier to narrow it.</li>}
            {filtered.map((candidate) => <li key={candidate.documentId}>
              <button type="button" disabled={busy !== null || candidate.documentId === link?.poDocumentId}
                onClick={async () => { const ok = await apply("replace", () => replacePoMatchAction(workspaceId, documentId, candidate.documentId)); if (ok) { setReplacing(false); toast.success(`Now comparing against ${candidate.poNumber ?? "the chosen PO"}.`) } }}
                className="flex min-h-8 w-full items-center justify-between gap-2 px-1.5 py-1 text-left text-xs text-slate-800 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500 disabled:opacity-50">
                <span className="flex min-w-0 items-center gap-1.5">{busy === "replace" && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />}<span className="truncate">{describe(candidate)}</span></span>
                {candidate.documentId === link?.poDocumentId ? <span className="text-slate-500">current</span> : candidate.sameSupplier ? <span className="text-emerald-700">same supplier</span> : null}
              </button>
            </li>)}
          </ul>}
    </div>}

    <ConfirmDialog open={rejecting} title={`Reject ${link?.poNumber ?? "this Purchase Order"}?`}
      description={`The invoice will no longer be compared against it: the PO cells clear and the Total's gate is re-evaluated.${sendBackNote} You can choose another PO afterwards. This is recorded on the audit trail.`}
      confirmLabel="Reject PO" onCancel={() => setRejecting(false)}
      onConfirm={async () => { setRejecting(false); if (link) { const ok = await apply("reject", () => rejectPoMatchAction(workspaceId, documentId, link.matchId)); if (ok) toast.success("PO rejected. Checks re-ran.") } }} />
  </section>
}
