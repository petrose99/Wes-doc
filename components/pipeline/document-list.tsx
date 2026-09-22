"use client"

import { BulkActionBar } from "@/components/pipeline/bulk-action-bar"
import { highlightSnippet } from "@/components/shared/highlight-snippet"
import { LastUpdated } from "@/components/shared/relative-time"
import { useRowSelection } from "@/components/shared/use-row-selection"
import { blockerControlHref, blockerControlTarget } from "@/lib/documents/blocker-controls"
import type { PipelineStage } from "@/lib/documents/stages"
import { AlertTriangle, CheckCircle2, FileText, Inbox, Loader2, XCircle } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

export type PipelineDocumentRow = {
  id: string
  fileId: string
  filename: string
  status: string
  receivedAt: string
  templateName: string | null
  flagged: boolean
  hasActiveJob: boolean
  missingRequiredFields: string[]
  readinessStatus: string | null
  readinessBlockers: { code: string; detail: string }[]
  /** Set on every stage except Inbox — supplier/category/total in place of the filename, since a
   * reviewer triaging this list cares who the document is from and how much it's for, not what
   * it happened to be named on upload. `converted` carries the base-currency string on a
   * foreign-currency document ("≈ $108" next to "€100"); `fxPending` is true when the document IS
   * foreign-currency but the ECB conversion hasn't landed yet, so the Total column can render an
   * "FX pending" chip instead of a wrong number. */
  review: { supplier: string | null; category: string; total: string | null; converted: string | null; fxPending: boolean } | null
  /** How many of this document's fields the model returned below the LOW_CONFIDENCE threshold —
   * fed into the Readiness column so a reviewer sees "1 field low" alongside the ready/blocked
   * state, rather than a green "Ready to sync" pill hiding a suspect value. */
  lowConfidenceFieldCount: number
  /** Reviewer-confirmed payment. The Synced tab is cumulative (a bill stays there after being
   * paid — see models/documents.ts stageWhereClause), so paid rows on it carry a chip instead
   * of disappearing into the Paid tab. */
  paid: boolean
  /** Most recent succeeded push, populated only for Synced/Paid rows — the row-level twin of the
   * inline receipt in the review-inbox pane. Without this the row said "reviewed" for a bill
   * the ledger already had. `at` is an ISO string so the row payload stays JSON-serialisable. */
  lastPush: { destination: string; at: string } | null
}

/** A document matched by content rather than by name — the pipeline's own version of the Files
 * browser's ContentMatchRow, minus the fileId/fileName/inScope fields that only make sense in a
 * folder-scoped list. */
export type ContentMatchRow = { documentId: string; filename: string; page: number | null; bbox: [number, number, number, number] | null; snippet: string }

const STATUS_BADGE: Record<string, string> = {
  queued: "bg-slate-100 text-slate-500",
  failed: "bg-red-100 text-red-700",
  needs_review: "bg-indigo-100 text-indigo-700",
  ready_for_review: "bg-emerald-100 text-emerald-700",
  reviewed: "bg-emerald-100 text-emerald-700",
}

function ReadinessBadge({ workspaceId, status, blockers, lowConfidenceFieldCount }: { workspaceId: string; status: string | null; blockers: { code: string; detail: string }[]; lowConfidenceFieldCount: number }) {
  if (!status) {
    // The audit called for an honest signal on rows the readiness engine hasn't scored yet — a
    // silent empty cell hid the low-confidence exceptions the confidence map already knew about.
    if (lowConfidenceFieldCount > 0) return <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700" title={`${lowConfidenceFieldCount} low-confidence field${lowConfidenceFieldCount === 1 ? "" : "s"}`}>
      <AlertTriangle className="h-3 w-3" />{lowConfidenceFieldCount} field{lowConfidenceFieldCount === 1 ? "" : "s"} low
    </span>
    return null
  }
  if (status === "ready") return <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium ${lowConfidenceFieldCount > 0 ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`} title={lowConfidenceFieldCount > 0 ? `${lowConfidenceFieldCount} low-confidence field${lowConfidenceFieldCount === 1 ? "" : "s"} — otherwise ready to sync` : undefined}>
    <CheckCircle2 className="h-3 w-3" />{lowConfidenceFieldCount > 0 ? `${lowConfidenceFieldCount} field low` : "Ready to sync"}
  </span>
  // The link is the connection point: a reviewer sees a blocked row, sees which lever caused it,
  // and clicks straight into the Controls tab that owns that lever. Only when the top blocker's
  // code actually maps to a Controls tab — a duplicate or a missing required field is a fact
  // about the document, not a control that was configured, so those keep the bare badge.
  const top = blockers[0]
  const target = top ? blockerControlTarget(top.code) : null
  const details = blockers.map((b) => b.detail).join(" · ")
  const title = details ? `Blocked: ${details}` : "Blocked"
  const body = <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700 hover:bg-amber-100">
    <XCircle className="h-3 w-3" />{blockers.length} blocker{blockers.length !== 1 ? "s" : ""}
    {target && <span className="text-[10px] font-medium text-amber-600/80">→ {target.label.replace("Controls · ", "")}</span>}
  </span>
  if (target) return <Link href={blockerControlHref(workspaceId, target)} title={`${title}\nOpen ${target.label} to see or adjust the rule that caused this.`} className="inline-flex">{body}</Link>
  return <span title={title} className="inline-flex">{body}</span>
}

/** What each stage's empty table says, so "nothing here" reads as expected-and-fine on Archive
 * but as an invitation to upload on Inbox. */
const EMPTY_COPY: Record<PipelineStage, string> = {
  inbox: "Nothing waiting to process. Upload PDFs or a folder — or email bills to your company address.",
  review: "Nothing needs a look right now.",
  approved: "Nothing marked approved yet — sign off on documents to use them in a worksheet.",
  synced: "Nothing synced yet. Documents appear here once they're approved and pushed to your accounting connection.",
  paid: "Nothing paid yet — a paid bill lands here once a reviewer or the ledger confirms it.",
}

/** The shared list shell for every pipeline tab: a plain table with checkbox/flag/status columns,
 * shift-click range selection (useRowSelection), a bulk action bar that appears once anything is
 * marked, and — when a search is active and document search is configured — a "Matched inside
 * documents" section for hits the hybrid content search found that the filename match didn't.
 * Column configurability (UserListPreference) is a later refinement — this ships the fixed column
 * set every stage needs today. */
export function DocumentList({ workspaceId, stage, rows, contentMatches, query }: {
  workspaceId: string
  stage: PipelineStage
  rows: PipelineDocumentRow[]
  contentMatches: ContentMatchRow[]
  query: string
}) {
  const { marked, markRow, toggleAll, clear } = useRowSelection(rows)
  const router = useRouter()
  const selected = [...marked]
  const selectedFileId = selected.length > 0 ? rows.find((r) => r.id === selected[0])?.fileId : undefined
  /** Focused row id (not index) for j/k navigation. Prior runs tracked by index, which meant a
   * filter change that kept the same array length silently pointed selection at a different
   * document — the reviewer thought j/k had moved onto row 3 and pressed Enter on the row that
   * had *become* row 3. Tracking by id survives reorder/filter and only clears when the row
   * itself is gone.
   *
   * Starts null so the first j/k moves to the first row rather than the invisible-jump-to-last
   * that a `null → k` handler produced on default focus. */
  const [focusedRowId, setFocusedRowId] = useState<string | null>(null)
  const focusedIndex = focusedRowId ? rows.findIndex((row) => row.id === focusedRowId) : -1
  // Render-time recovery: if the focused id disappears (row deleted, approved off, filtered
  // out), clear it so the ring doesn't stay pointed at a ghost. Deliberately not an effect —
  // React's own rule for state derived from props, and avoids a second render pass.
  if (focusedRowId && focusedIndex === -1) setFocusedRowId(null)
  const keyboardEnabled = stage === "review"
  useEffect(() => {
    if (!keyboardEnabled) return
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (!target) return
      // Editors, form fields, and links get to keep their native keystrokes. `a` on an anchor
      // otherwise fired select-all while the user was tabbing through row supplier links; also
      // guard the whole set once any modifier is held so browser shortcuts (Cmd/Ctrl+A, Alt+arrow)
      // still work.
      if (["INPUT", "TEXTAREA", "SELECT", "A", "BUTTON"].includes(target.tagName) || target.isContentEditable) return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (!rows.length) return
      if (event.key === "j" || event.key === "ArrowDown") {
        event.preventDefault()
        // From null-focus, j lands on the first row (not the second, which `-1 + 1` conveniently
        // gives — but only by accident). k lands on the first too, not the last, so the initial
        // press never causes a "why did the ring jump to the bottom?" surprise.
        const next = focusedIndex < 0 ? 0 : Math.min(focusedIndex + 1, rows.length - 1)
        setFocusedRowId(rows[next].id)
      } else if (event.key === "k" || event.key === "ArrowUp") {
        event.preventDefault()
        const next = focusedIndex < 0 ? 0 : Math.max(focusedIndex - 1, 0)
        setFocusedRowId(rows[next].id)
      } else if (event.key === " " || event.key === "x") {
        event.preventDefault()
        if (focusedIndex >= 0) markRow(focusedIndex)
      } else if (event.key === "Enter") {
        event.preventDefault()
        const row = focusedIndex >= 0 ? rows[focusedIndex] : null
        if (row) router.push(`/workspaces/${workspaceId}/documents/${row.id}?stage=${stage}`)
      } else if (event.key === "a") {
        // Bulk-select toggle — the "select all N loaded rows" shortcut Alex was missing on both
        // surfaces. `a` (not cmd+A) because the browser's own select-all shouldn't be hijacked.
        event.preventDefault()
        toggleAll()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [keyboardEnabled, rows, focusedIndex, markRow, toggleAll, router, workspaceId, stage])
  // Re-extract is per (fileId, documentId), and a selection can span files, so it needs each
  // row's own file rather than selectedFileId's "first one wins" (which is only sound for the
  // Sheets link, where a cross-file selection is already meaningless).
  const selectedRows = rows.filter((row) => marked.has(row.id)).map((row) => ({ id: row.id, fileId: row.fileId }))
  // Supplier/Category/Total columns are shown on every stage except Inbox — documents on Inbox
  // haven't been extracted yet, so their filename is still the only thing that identifies them.
  const isReview = stage !== "inbox"
  const columnCount = isReview ? 7 : 5


  const contentRow = (match: ContentMatchRow) => {
    const params = new URLSearchParams()
    if (match.page != null) params.set("page", String(match.page))
    if (match.bbox) params.set("bb", match.bbox.join(","))
    const hrefQuery = params.toString()
    return <tr key={`content-${match.documentId}`} className="hover:bg-slate-50">
      <td className="border-b px-2 py-2" />
      <td colSpan={columnCount - 1} className="border-b px-3 py-2">
        <Link href={`/workspaces/${workspaceId}/documents/${match.documentId}?stage=${stage}${hrefQuery ? `&${hrefQuery}` : ""}`} className="block">
          <span className="flex items-center gap-2">
            <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span className="truncate font-medium text-slate-800" title={match.filename}>{match.filename}</span>
            {match.page != null && <span className="shrink-0 rounded bg-emerald-50 px-1 font-mono text-[11px] text-emerald-800">p.{match.page}</span>}
          </span>
          {match.snippet && <span className="ml-[1.375rem] mt-0.5 block line-clamp-2 text-xs text-slate-500">{highlightSnippet(match.snippet, query)}</span>}
        </Link>
      </td>
    </tr>
  }

  return <div className="flex min-h-0 flex-1 flex-col">
    <BulkActionBar workspaceId={workspaceId} stage={stage} selectedIds={selected} selectedFileId={selectedFileId} selectedRows={selectedRows} onDone={clear} />
    {keyboardEnabled && <div className={`border-b bg-white px-6 py-1.5 text-[11px] ${rows.length > 0 ? "text-slate-500" : "text-slate-400/70"}`}>
      <kbd className="rounded border border-slate-300 bg-slate-50 px-1 font-sans text-[10px] text-slate-600">j</kbd>/<kbd className="rounded border border-slate-300 bg-slate-50 px-1 font-sans text-[10px] text-slate-600">k</kbd> move
      · <kbd className="rounded border border-slate-300 bg-slate-50 px-1 font-sans text-[10px] text-slate-600">x</kbd> select
      · <kbd className="rounded border border-slate-300 bg-slate-50 px-1 font-sans text-[10px] text-slate-600">a</kbd> all
      · <kbd className="rounded border border-slate-300 bg-slate-50 px-1 font-sans text-[10px] text-slate-600">Enter</kbd> open
    </div>}
    <div className="min-h-0 flex-1 overflow-auto px-6 pb-4">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-white text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="w-10 border-b px-2 py-2" />
            {isReview ? <>
              <th className="border-b px-3 py-2">Supplier</th>
              <th className="border-b px-3 py-2">Category</th>
              <th className="border-b px-3 py-2">Total</th>
              <th className="border-b px-3 py-2">Readiness</th>
            </> : <>
              <th className="border-b px-3 py-2">Document</th>
              <th className="border-b px-3 py-2">Template</th>
            </>}
            <th className="border-b px-3 py-2">Status</th>
            <th className="border-b px-3 py-2">Received</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => <tr key={row.id} className={`${marked.has(row.id) ? "bg-emerald-50/60" : "hover:bg-slate-50 active:bg-slate-100"} ${keyboardEnabled && focusedIndex >= 0 && focusedIndex === index ? "outline outline-2 -outline-offset-2 outline-emerald-500/50" : ""}`}>
            <td className="border-b px-2 py-2">
              <input type="checkbox" aria-label={`Select ${row.filename}`} className="h-4 w-4 accent-emerald-600" checked={marked.has(row.id)}
                onChange={(e) => markRow(index, e.nativeEvent)} />
            </td>
            {isReview && row.review ? <>
              <td className="border-b px-3 py-2">
                <Link href={`/workspaces/${workspaceId}/documents/${row.id}?stage=${stage}`} className="inline-flex items-center gap-2 font-medium text-slate-800 hover:text-emerald-800" title={row.filename}>
                  <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="truncate">{row.review.supplier ?? "Unknown supplier"}</span>
                  {row.hasActiveJob && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-emerald-600" aria-label="Processing" />}
                  {row.missingRequiredFields.length > 0 && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-indigo-500" aria-label="Missing required fields" />}
                </Link>
              </td>
              <td className="border-b px-3 py-2 text-slate-500">{row.review.category}</td>
              <td className="border-b px-3 py-2 text-slate-500">
                {row.review.total ? <span className="tabular-nums text-slate-800">{row.review.total}</span> : <span>—</span>}
                {row.review.converted && <span className="ml-1.5 text-[11px] text-slate-400 tabular-nums" title="Converted to workspace base currency at extraction-time FX rate">{row.review.converted}</span>}
                {row.review.fxPending && <span className="ml-1.5 rounded bg-amber-50 px-1 py-px text-[10px] font-medium text-amber-700" title="Foreign-currency document — awaiting an ECB reference rate">FX pending</span>}
              </td>
              <td className="border-b px-3 py-2"><ReadinessBadge workspaceId={workspaceId} status={row.readinessStatus} blockers={row.readinessBlockers} lowConfidenceFieldCount={row.lowConfidenceFieldCount} /></td>
            </> : <>
              <td className="border-b px-3 py-2">
                <Link href={`/workspaces/${workspaceId}/documents/${row.id}?stage=${stage}`} className="inline-flex items-center gap-2 font-medium text-slate-800 hover:text-emerald-800" title={row.filename}>
                  <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="truncate">{row.filename}</span>
                  {row.hasActiveJob && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-emerald-600" aria-label="Processing" />}
                  {row.missingRequiredFields.length > 0 && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-indigo-500" aria-label="Missing required fields" />}
                </Link>
              </td>
              <td className="border-b px-3 py-2 text-slate-500">{row.templateName ?? "—"}</td>
            </>}
            <td className="border-b px-3 py-2">
              <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_BADGE[row.status] ?? "bg-slate-100 text-slate-500"}`}>{row.status.replaceAll("_", " ")}</span>
              {stage === "synced" && row.paid && <span className="ml-1.5 rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-semibold text-emerald-800" title="Payment confirmed — also on the Paid tab">Paid</span>}
              {(stage === "synced" || stage === "paid") && row.lastPush && <span
                className="ml-1.5 inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-800"
                title={`Pushed to ${row.lastPush.destination} · ${new Date(row.lastPush.at).toLocaleString()}`}>
                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                {row.lastPush.destination}
              </span>}
            </td>
            <td className="border-b px-3 py-2 text-slate-500"><LastUpdated iso={row.receivedAt} /></td>
          </tr>)}

          {contentMatches.length > 0 && <tr><td colSpan={columnCount} className="border-b bg-slate-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Matched inside documents</td></tr>}
          {contentMatches.map(contentRow)}

          {!rows.length && !contentMatches.length && <tr><td colSpan={columnCount} className="px-4 py-16 text-center">
            <div className="mx-auto flex max-w-xs flex-col items-center gap-2 text-sm text-slate-400">
              <Inbox className="h-8 w-8 text-slate-300" />
              <p>{query ? `No documents match “${query}”.` : EMPTY_COPY[stage]}</p>
            </div>
          </td></tr>}
        </tbody>
      </table>
    </div>
  </div>
}
