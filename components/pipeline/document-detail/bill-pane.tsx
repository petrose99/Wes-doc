"use client"

import { createContext, type ReactNode, useContext, useMemo, useState } from "react"
import { CheckCircle2, ChevronDown, ExternalLink, XCircle, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { useRegisterDocumentActions, type RegisteredDocument } from "@/components/queue/document-actions-menu"
import { PaneResizeGrip, usePaneResize } from "@/components/queue/pane-resize-grip"
import { StatusLine } from "@/components/queue/status-line"
import { formatDate, formatMoney } from "@/components/queue/row-cells"
import { AuditLog } from "@/components/queue/history-tabs"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Panel, Pill } from "@/components/automation/automation-ui"
import { updateReviewTaskStatusAction } from "@/app/(app)/workspaces/[workspaceId]/review-actions"
import { moveDocumentsToStageAction, updateDocumentNoteAction } from "@/app/(app)/workspaces/[workspaceId]/pipeline-actions"
import { postSelectedDocumentsAction } from "@/app/(app)/workspaces/[workspaceId]/post-selected-documents-actions"
import type { ProcessingState } from "@/lib/documents/processing-state"
import type { ProcessingFact } from "@/lib/documents/processing-fact"
import type { SupplierSummary } from "@/models/supplier-summary"
import { inferDueDate } from "@/lib/bills/due-date"
import type { ConfiguredFieldDefinition } from "@/lib/configuration/field-table"

/** #361 step 4: whether the surrounding form renders read-only — derived once (from the footer
 * mode, #355 Q5) and read from context so #362's deeply-nested field/line-item components don't
 * need it prop-drilled through `BillPane`'s `form: ReactNode` slot. The caller (step 5, Invoices
 * wiring) provides it alongside the footer; defaults to editable so a component rendered without
 * the provider (a test, a stray reuse) fails open rather than silently locking a form. */
export const BillReadOnlyContext = createContext(false)
export function useBillReadOnly(): boolean {
  return useContext(BillReadOnlyContext)
}

const SPLIT_KEY = "bill-pane-split"

export type BillPaneProviderLink = { href: string; label: string } | null

/** #361 step 1/2 (map #353, #355's Bill template): the takeover shell's drag-grip viewer/form
 * split and its one net-new header element, the `Open in <Provider>` link (#355 Q2). `PaneFrame`
 * already renders the true header (`<Supplier> — <number>`, the ⋯ menu with Archive/Flag/Move/
 * Send for review/Delete, and `×`/↑/↓) — this component never repeats that h2 (area primer:
 * "never repeated across stacked headers"); it only adds the link *beside* it, per Q2, and
 * registers the document the same way `SplitPane` does so the frame's ⋯ has something to act on.
 *
 * Viewer/form content is `children`-shaped (`viewer`/`form`) through the rest of this ticket and
 * #362: the status track (step 3) and footer (step 4) render *inside* `form` by the caller, not
 * owned here, so later steps compose without reshaping this return value. The floating "Open
 * file" icon reuses `SplitPane`'s exact ≥lg pattern (#355 Q3 — "was the source strip's line") so
 * both templates share one implementation of it; below `lg` the phone lane's own stacked source
 * band (unchanged, #359) still carries the file link, so this icon is `lg:flex` only, matching
 * `split-pane.tsx`'s existing one. */
export function BillPane({ document, providerLink, fileHref, viewer, form }: {
  document: RegisteredDocument
  /** #355 Q2: omitted entirely (not greyed) when no provider is connected or the document has no
   * ledger line yet — the caller decides that; this component renders what it is given. */
  providerLink: BillPaneProviderLink
  fileHref: string
  viewer: ReactNode
  form: ReactNode
}) {
  useRegisterDocumentActions(document)
  const resize = usePaneResize(SPLIT_KEY)
  const { splitPct, dragging, rowRef } = resize
  return <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
    {providerLink && <div className="flex shrink-0 items-center border-b border-slate-200 px-3 py-1.5">
      <a href={providerLink.href} target="_blank" rel="noreferrer" className="text-sm font-medium text-emerald-700 hover:underline">
        {providerLink.label}
      </a>
    </div>}
    <div ref={rowRef} className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
      <div className={`relative min-h-0 flex-1 overflow-hidden border-slate-200 lg:flex-none lg:border-b-0 lg:border-r lg:[flex-basis:var(--split-pct)] ${dragging ? "" : "motion-safe:transition-[flex-basis] motion-safe:duration-200"}`}
        style={{ ["--split-pct" as string]: `${splitPct}%` }}>
        <a href={fileHref} target="_blank" rel="noopener noreferrer" aria-label="Open file in a new tab" title="Open file in a new tab"
          className="absolute right-2 top-2 z-10 hidden h-9 w-9 items-center justify-center rounded-full bg-white/90 text-slate-600 shadow-sm backdrop-blur hover:bg-white hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 lg:flex">
          <ExternalLink className="h-4 w-4" aria-hidden />
        </a>
        {viewer}
      </div>
      <PaneResizeGrip state={resize} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto">
        {form}
      </div>
    </div>
  </div>
}

/** #361 step 3: the status track that replaces the five-step stepper for `BillPane` (#354's
 * signed list — "stepper folded into the status track"). Three parts, always in this order:
 * `StatusLine` (unchanged, #258) with the ledger "Paid" pill plus a trailing date when this bill
 * has been paid; a persistent open-checks summary (spec §4.2 — complements `StatusLine`'s own
 * fact sentence, which drops the check count once escalated/rejected takes precedence, #4.3);
 * and the Approval block (§4.3), the one and only place a blocking reason renders. `escalated`
 * has no per-document actor-role query in the row projection (spec: "no new query") so its
 * sentence names the generic waiting party, not a person. */
export function BillStatusTrack({ workspaceId, openReviewTaskId, state, fact, ledger, openCheckCodes, cancelledReason, paidAt, blockedByCheck, escalated, approvalStatus, rejectedByActor, onDone }: {
  workspaceId: string
  openReviewTaskId: string | null
  state: ProcessingState
  fact: ProcessingFact
  ledger?: string | null
  openCheckCodes: string[]
  cancelledReason?: string | null
  /** When this bill has been paid — renders as `StatusLine`'s `trailing` node, "· Paid {date}",
   * matching the `· Synced` suffix pattern's spot (spec §4.1). Null for every unpaid bill. */
  paidAt?: Date | null
  blockedByCheck: boolean
  escalated: boolean
  approvalStatus: "not_started" | "in_progress" | "approved" | "rejected" | "cancelled"
  /** Who rejected, when known (`StatusLine`'s own `doc.decision` upgrade already resolves this
   * for the fact sentence) — the Approval block's "Rejected by {actor}" reuses that name rather
   * than a second query. */
  rejectedByActor?: string | null
  onDone: () => void
}) {
  const [confirmingReject, setConfirmingReject] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const checkCount = openCheckCodes.length
  const blockReason =
    blockedByCheck ? `Blocked — ${checkCount} open check${checkCount === 1 ? "" : "s"} must clear first`
    : escalated ? "Escalated — waiting on a reviewer"
    : approvalStatus === "rejected" ? (rejectedByActor ? `Rejected by ${rejectedByActor}` : "Rejected")
    : null
  const canReject = approvalStatus === "in_progress" && !!openReviewTaskId

  const reject = async () => {
    if (!openReviewTaskId) return
    setConfirmingReject(false)
    setRejecting(true)
    try {
      await updateReviewTaskStatusAction(workspaceId, openReviewTaskId, "rejected")
      onDone()
    } finally {
      setRejecting(false)
    }
  }

  return <div className="flex flex-col gap-2 border-b border-slate-200 px-3 py-2">
    <StatusLine state={state} fact={fact} ledger={ledger} openCheckCodes={openCheckCodes} cancelledReason={cancelledReason}
      trailing={paidAt ? <span>· Paid {formatDate(paidAt)}</span> : undefined} />
    {checkCount > 0 && <p role="status" className="text-xs text-slate-600">{checkCount} open check{checkCount === 1 ? "" : "s"}</p>}
    {blockReason && <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <span>{blockReason}</span>
      {canReject && <Button type="button" size="sm" variant="outline" disabled={rejecting} onClick={() => setConfirmingReject(true)}>
        {rejecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <XCircle className="h-3.5 w-3.5" aria-hidden />}Reject
      </Button>}
    </div>}
    <ConfirmDialog
      open={confirmingReject}
      destructive
      busy={rejecting}
      title="Reject this bill?"
      description="The open approval is closed as rejected and the decision is recorded on the audit trail. The document itself stays in the company."
      confirmLabel={rejecting ? "Rejecting…" : "Reject"}
      onConfirm={() => void reject()}
      onCancel={() => setConfirmingReject(false)} />
  </div>
}

/** #361 step 4 (#355 Q5): the one footer verb `PaneFrame`'s sticky `actions` slot renders for a
 * Bill pane — never two buttons (Reject already lives in the Approval block above, #354's
 * unplug). `"read-only"` renders nothing (Touchless/Cancelled/Paid: the fact sentence alone
 * carries the state, per the fortify table) so the caller's `actions={mode === "read-only" ?
 * undefined : <BillFooterActions .../>}` naturally drops `PaneFrame`'s footer. The primary
 * button keeps `#save-review-submit`'s id across every mode (#258's reload-focus contract reads
 * that id back after a content reload, regardless of which verb currently owns the slot).
 *
 * `"resolve"` (opened from Exceptions) is not a case here: `ExceptionQueue` already supplies its
 * own `paneActions` (Start review / Resolve-with-reason popover, unchanged) — this component
 * never renders for that surface. */
export function BillFooterActions({ workspaceId, documentId, connectionId, mode, openReviewTaskId, blocked, onDone }: {
  workspaceId: string
  documentId: string
  mode: "approve" | "post" | "read-only"
  /** Post's ledger target (#281) — null when no connection is active; Post still renders,
   * disabled, per the queue's own "never hide the button" rule for the bulk Post bar. */
  connectionId: string | null
  openReviewTaskId: string | null
  /** Approve only (#355 Q5): open checks or an unconfirmed category keep it disabled — the
   * reason itself is `BillStatusTrack`'s blocking line above, never repeated as a tooltip here. */
  blocked: boolean
  onDone: () => void
}): ReactNode {
  const [busy, setBusy] = useState(false)
  if (mode === "read-only") return null

  const approve = async () => {
    setBusy(true)
    try {
      const result = openReviewTaskId
        ? await updateReviewTaskStatusAction(workspaceId, openReviewTaskId, "approved")
        : await moveDocumentsToStageAction(workspaceId, [documentId], "approved")
      if (!result.success) { toast.error(result.error || "Could not approve this bill"); return }
      if (!openReviewTaskId && ((result as { data?: { heldBack?: number } }).data?.heldBack ?? 0) > 0) {
        toast.warning("Not approved yet. Fill in the missing required fields and pick a document type first.")
      } else {
        toast.success("Approved")
      }
      onDone()
    } catch {
      toast.error("Could not reach the server")
    } finally {
      setBusy(false)
    }
  }

  const post = async () => {
    if (!connectionId) return
    setBusy(true)
    try {
      const result = await postSelectedDocumentsAction(workspaceId, connectionId, [documentId])
      if (!result.success) { toast.error(result.error || "Could not post this bill"); return }
      const outcome = result.data?.results[0]
      if (outcome?.status === "succeeded" || outcome?.status === "queued") toast.success(outcome.status === "queued" ? "Posting…" : "Posted")
      else toast.error(outcome?.error || "Could not post this bill")
      onDone()
    } catch {
      toast.error("Could not reach the server")
    } finally {
      setBusy(false)
    }
  }

  const disabled = busy || (mode === "approve" && blocked) || (mode === "post" && !connectionId)
  return <Button type="button" id="save-review-submit" size="sm" disabled={disabled} aria-busy={busy || undefined} onClick={() => void (mode === "approve" ? approve() : post())}>
    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />}
    {mode === "approve" ? (busy ? "Approving…" : "Approve") : (busy ? "Posting…" : "Post")}
  </Button>
}

/** #361 step 5 (spec §6): Audit + Note, folded into one collapsed-by-default disclosure so the
 * status track (above) carries the state a glance needs and this detail stays a click away rather
 * than a permanent tab. No shared disclosure primitive exists for this area — `components/ui/
 * accordion.tsx` is the marketing FAQ's single-item, `question`-labelled component (border-y
 * divider framing, font-display heading) and doesn't fit a compact form-column section — so this
 * is a local native `<details>`, the same reasoning that built that one. Owns its own note-edit
 * state (same shape as `SplitPane`'s retired Note tab) rather than threading it through `BillPane`
 * `form`'s caller. */
export function BillHistoryDisclosure({ workspaceId, documentId, note: initialNote, auditEvents }: {
  workspaceId: string
  documentId: string
  note: string
  auditEvents: Array<{ id: string; label: string; createdAt: string; actorName: string | null }>
}) {
  const [note, setNote] = useState(initialNote)
  const [savingNote, setSavingNote] = useState(false)

  const saveNote = async () => {
    setSavingNote(true)
    try {
      const result = await updateDocumentNoteAction(workspaceId, documentId, note)
      if (!result.success) { toast.error(result.error || "Could not save the note"); return }
      toast.success("Note saved")
    } catch {
      toast.error("Could not reach the server")
    } finally {
      setSavingNote(false)
    }
  }

  return <details className="group rounded-lg border border-slate-200">
    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-medium text-slate-700 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 [&::-webkit-details-marker]:hidden">
      History
      <ChevronDown className="h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200 group-open:rotate-180" aria-hidden />
    </summary>
    <div className="space-y-4 border-t border-slate-200 px-3 py-3">
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Audit</h3>
        <AuditLog events={auditEvents} />
      </div>
      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Note</h3>
        <textarea className="min-h-32 w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm text-slate-900 transition-colors placeholder:text-slate-500 focus:border-emerald-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-100" placeholder="A note only your team sees — not sent anywhere, not part of the extracted data."
          value={note} onChange={(event) => setNote(event.target.value)} />
        <button type="button" disabled={savingNote} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-800 disabled:opacity-40" onClick={() => void saveNote()}>
          {savingNote && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}Save note
        </button>
      </div>
    </div>
  </details>
}

/** #362 §1: "why is this document's supplier auto-approvable, and what does its recent history
 * look like" without leaving the pane — the two Admin › Suppliers facts (trust standing, payment
 * terms) that change how a reviewer reads *this* document, plus a capped recent-invoices list.
 * `summary` is fetched once at pane load (server component) — B6: not re-polled while the pane is
 * open, same load-time-snapshot class as every other section here. */
export function SupplierCard({ summary, workspaceId }: { summary: SupplierSummary; workspaceId: string }) {
  if (!summary.matched) return <Panel title="Supplier" level="h3">
    <p className="text-sm text-slate-600">No supplier matched — the document doesn&apos;t identify one</p>
  </Panel>

  return <Panel title={summary.name} level="h3">
    <div className="flex items-center justify-between gap-4">
      <Pill state={summary.trust.state}>{summary.trust.label}</Pill>
      <span className="text-sm tabular-nums text-slate-600">{summary.paymentTerms}</span>
    </div>
    <details className="group mt-3 rounded-lg border border-slate-200">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-medium text-slate-700 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 [&::-webkit-details-marker]:hidden">
        Recent invoices ({summary.recentInvoices.length})
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200 group-open:rotate-180" aria-hidden />
      </summary>
      <div className="space-y-2 border-t border-slate-200 px-3 py-3">
        {summary.recentInvoices.length === 0
          ? <p className="text-sm text-slate-600">No other invoices from this supplier yet.</p>
          : <table className="w-full text-sm">
            <tbody className="divide-y divide-hairline-soft">
              {summary.recentInvoices.map((row) => <tr key={row.documentId}>
                <td className="py-1.5 pr-2 text-slate-600">{row.date ?? "—"}</td>
                <td className="py-1.5 pr-2 text-slate-900">{row.number ?? "—"}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums text-slate-600">{row.amount !== null ? formatMoney(row.amount, row.currency) : "—"}</td>
                <td className="py-1.5 text-right"><span className="inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">{row.statusLabel}</span></td>
              </tr>)}
            </tbody>
          </table>}
        <a href={`/workspaces/${workspaceId}/admin/suppliers`} className="inline-block text-sm font-medium text-emerald-700 hover:text-emerald-800 hover:underline">View all in Admin › Suppliers</a>
      </div>
    </details>
  </Panel>
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

const DATE_INPUT_CLASS = "h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-sm transition-colors focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100 read-only:bg-slate-50 read-only:text-slate-600 disabled:bg-slate-50 disabled:text-slate-600"

/** #362 §3: one compact row — Invoice date · Due date · Posting date — directly under the
 * line-item table (not a card, #355 Q8's ≤1.5-screen budget). Invoice date reuses the same
 * `<input type="date">` markup `FieldRow` renders for a `type: "date"` field (B4, no new
 * date-cell component); Due date is the *same* input when the resolved supplier has no payment
 * terms (a plain override, autosaved like any field, per #355 — no separate toggle), or a
 * read-only span + "from payment terms" caption, backed by a hidden input so the computed value
 * still submits, when it does — recomputed from Invoice date on every keystroke (B2, same tick,
 * pure `inferDueDate`, no round trip). Posting date (Bill Pay rows only) isn't reachable from
 * this ticket's only caller (Invoices) yet — `postingDate` stays unset until a Bill Pay caller
 * (#363/#365) passes it; the row renders the two Invoices cells only until then. */
export function DatesRow({ invoiceDateField, invoiceDateValue, dueDateField, dueDateValue, paymentTermsDays, readOnly, postingDate }: {
  invoiceDateField: ConfiguredFieldDefinition
  invoiceDateValue: string | null
  dueDateField: ConfiguredFieldDefinition
  dueDateValue: string | null
  /** Null when the resolved supplier has no term set (`SupplierSummary.paymentTermsDays`) or
   * no supplier matched at all — both read as "plain editable Due date". */
  paymentTermsDays: number | null
  readOnly: boolean
  postingDate?: { label: string; value: string | null } | null
}) {
  const [invoiceDate, setInvoiceDate] = useState(invoiceDateValue ?? "")
  const computedDue = useMemo(() => {
    if (paymentTermsDays === null || paymentTermsDays < 0 || !invoiceDate) return null
    return inferDueDate({ extractedDueDate: null, documentDate: new Date(invoiceDate), supplierPaymentTermsDays: paymentTermsDays })
  }, [invoiceDate, paymentTermsDays])

  return <div className="flex flex-wrap items-end gap-4">
    <div className="min-w-32 flex-1">
      <label htmlFor={invoiceDateField.key} className="mb-1 block text-xs font-medium text-slate-500">{invoiceDateField.label}</label>
      <input id={invoiceDateField.key} name={invoiceDateField.key} type="date" defaultValue={invoiceDateValue ?? ""}
        disabled={readOnly} onChange={(event) => setInvoiceDate(event.target.value)} className={DATE_INPUT_CLASS} />
    </div>
    <div className="min-w-32 flex-1">
      <label htmlFor={dueDateField.key} className="mb-1 block text-xs font-medium text-slate-500">{dueDateField.label}</label>
      {computedDue ? <>
        <input type="hidden" name={dueDateField.key} value={toIsoDate(computedDue)} />
        <p id={dueDateField.key} className="flex h-9 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-600">{formatDate(computedDue)}</p>
        <p className="mt-1 text-xs text-slate-500">from payment terms</p>
      </> : <input id={dueDateField.key} name={dueDateField.key} type="date" defaultValue={dueDateValue ?? ""} disabled={readOnly} className={DATE_INPUT_CLASS} />}
    </div>
    {postingDate && <div className="min-w-32 flex-1">
      <label htmlFor="posting_date" className="mb-1 block text-xs font-medium text-slate-500">{postingDate.label}</label>
      <input id="posting_date" name="posting_date" type="date" defaultValue={postingDate.value ?? ""} disabled={readOnly} className={DATE_INPUT_CLASS} />
    </div>}
  </div>
}
