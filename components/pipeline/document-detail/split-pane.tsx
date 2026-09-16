"use client"

import { AutomationRuleForm } from "@/components/workspace/automation-rule-form"
import { CreateReviewTaskButton } from "@/components/documents/create-review-task-button"
import { FieldRow } from "@/components/pipeline/document-detail/field-row"
import { LineItemsSection, type LineItemsPoProps } from "@/components/pipeline/document-detail/line-items-section"
import { checkAppliesToField, type FieldCheck } from "@/components/pipeline/document-detail/check-types"
import { parseLiveCheckValues, rebuildLiveChecks } from "@/components/pipeline/document-detail/live-checks"
import { StageIndicator, type StageStep } from "@/components/pipeline/document-detail/stage-indicator"
import { useFieldNav } from "@/components/pipeline/document-detail/use-field-nav"
import { updateDocumentNoteAction } from "@/app/(app)/workspaces/[workspaceId]/pipeline-actions"
import { PaneDocumentContext, useRegisterDocumentActions } from "@/components/queue/document-actions-menu"
import { escalateCheckAction, setDocumentTypeAction, type SaveReviewResult } from "@/app/(app)/workspaces/[workspaceId]/actions"
import type { ActionState } from "@/lib/actions"
import { useRouter } from "next/navigation"
import { InstitutionAssert } from "@/components/pipeline/document-detail/institution-assert"
import { StatementDriftBanner } from "@/components/pipeline/document-detail/statement-drift-banner"
import { ApprovalTab, AuditLog, ChecksTab, type DocumentHistory } from "@/components/queue/history-tabs"
import { usePhoneLane } from "@/lib/client/use-phone-lane"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { SourceViewer, type ProvenanceTarget, type SourceDocument } from "@/components/viewer/source-preview"
import type { DocumentFieldDefinition } from "@/lib/document-templates"
import type { Ref } from "@/lib/provenance"
import type { FieldRationale } from "@/lib/rationale"
import type { ProcessingState } from "@/lib/documents/processing-state"
import { CheckCircle2, ChevronDown, ChevronUp, ExternalLink, Loader2 } from "lucide-react"
import { useActionState, useContext, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react"
import { toast } from "sonner"

type Tab = "details" | "note" | "activity" | "approval" | "checks"
type PanelLayout = "split" | "source-only" | "details-only"
const LAYOUT_KEY = "pane-layout"
/** #257 spec 3.5: whether the phone lane's source strip is expanded; remembered for the session. */
const SOURCE_KEY = "dp.source"

/** Shared label map for the four document-type states. Extracted so the chip in the top bar, the
 * inline "Type:" line, and the future stage indicator all read the same names — a mismatch here
 * showed up in the audit as "Expense / Sale / Bank Statement / Other" competing with the Bill /
 * Sales invoice glossary elsewhere in the app. */
const DOC_TYPE_LABELS: Record<"expense" | "sale" | "bank_statement" | "other", string> = {
  expense: "Bill",
  sale: "Sales invoice",
  bank_statement: "Bank statement",
  other: "Other",
}

export function SplitPane({
  workspaceId, source, fields, data, fieldConfidence, provenanceFields, provenanceItems, initialTarget, conflictingLabels, missingRequiredFields,
  saveReview, documentType: initialDocumentType, note: initialNote, auditEvents,
  header, canPush, pushCard, canCreateRule, defaultSupplier, matchKind, bankMatches, documentMatches, rationales, checks, fxBadge, stageIndicator,
  institutions, institutionId, institutionName, history, po = null, initialTab, state, queueTitle,
}: {
  workspaceId: string
  source: SourceDocument
  fields: DocumentFieldDefinition[]
  data: Record<string, unknown>
  fieldConfidence: Record<string, number>
  provenanceFields: Record<string, Ref>
  provenanceItems: Record<string, (Ref | null)[]>
  initialTarget: ProvenanceTarget | null
  conflictingLabels: string[]
  missingRequiredFields: string[]
  /** #258: returns the save's outcome instead of redirecting, so the pane (and the `?full=1`
   * route) can toast it and refresh in place — see `saveDocumentReviewAction`'s `stay`. */
  saveReview: (formData: FormData) => Promise<ActionState<SaveReviewResult | null>>
  documentType: "expense" | "sale" | "bank_statement" | null
  note: string
  auditEvents: Array<{ id: string; label: string; createdAt: string; actorName: string | null }>
  /** What the frame around this pane needs to carry its ⋯ (#259): identity, flag/archive/cancel
   * state and the open review task's link. */
  header: { filename: string; documentId: string; fileId: string; status: string; flagged: boolean; archived: boolean; cancelled: boolean; cancelledReason: string | null; reviewLink: { href: string; label: string } | null }
  canPush: boolean
  pushCard: ReactNode
  canCreateRule: boolean
  defaultSupplier: string
  matchKind: "bank" | "supplier_statement" | null
  bankMatches: ReactNode
  documentMatches?: ReactNode
  paymentStatus?: string | null
  rationales?: Record<string, FieldRationale>
  /** Deterministic check results for this document, already resolved to the persisted form paths
   * they compared (#202). Empty for document types with no applicable checks. */
  checks?: FieldCheck[]
  fxBadge?: ReactNode
  /** The five-step Extracted → Checks → Approval → Sync → Pay indicator. Derived at the page
   * level so this client component doesn't need to pull in review-task/integration-push readers. */
  stageIndicator?: StageStep[]
  /** #217: this workspace's Institutions, for the bank-statement assert control — empty/unused
   * for any other document type. */
  institutions?: Array<{ id: string; name: string }>
  institutionId?: string | null
  institutionName?: string | null
  /** #225: the Approval / Audit / Checks tabs' data, loaded with the document so they sit in the
   * same tab strip as Details and Note. Supplied by the queue's loader; the standalone route
   * shows the Activity tab instead. */
  history?: DocumentHistory | null
  /** #228 / #250: the invoice's Purchase Order link for the line-items section's View PO row and
   * Match manually. Null for every non-invoice document. */
  po?: LineItemsPoProps | null
  /** #236: which tab this pane opens on — Approvals opens straight to "approval", PO Mismatches
   * to "checks". Undefined keeps the historic "details" default for every other queue. */
  initialTab?: Tab
  /** #258: the document's processing state, computed server-side by the same function the row
   * uses (`getProcessingStateInput` → `processingState`), for the Approval tab's no-flow cases. */
  state?: ProcessingState
  /** #258: "Invoices" / "Receipts" — the Approval tab's in-review guidance names the queue's
   * own bulk bar (Receipts has no Start approval there). */
  queueTitle?: string
}) {
  const [tab, setTab] = useState<Tab>(initialTab ?? "details")
  const [target, setTarget] = useState<ProvenanceTarget | null>(initialTarget)
  const [note, setNote] = useState(initialNote)
  const [savingNote, setSavingNote] = useState(false)
  const [docType, setDocType] = useState<"expense" | "sale" | "bank_statement" | "other" | null>(initialDocumentType)
  const [savingDocType, setSavingDocType] = useState(false)
  // The layout choice persists for the session so moving ↑/↓ through a queue keeps the panels
  // where the operator put them; read after mount so server and first client render agree.
  const [layout, setLayout] = useState<PanelLayout>("split")
  const [sourceShown, setSourceShown] = useState(true)
  const phone = usePhoneLane()
  useEffect(() => {
    const saved = window.sessionStorage.getItem(LAYOUT_KEY)
    if (saved === "split" || saved === "source-only" || saved === "details-only") setLayout(saved)
    if (window.sessionStorage.getItem(SOURCE_KEY) === "hidden") setSourceShown(false)
  }, [])
  const selectLayout = (value: PanelLayout) => { setLayout(value); window.sessionStorage.setItem(LAYOUT_KEY, value) }
  const toggleSource = () => setSourceShown((prev) => { window.sessionStorage.setItem(SOURCE_KEY, prev ? "hidden" : "shown"); return !prev })
  const onLayoutKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const order: PanelLayout[] = ["split", "details-only", "source-only"]
    const index = order.indexOf(layout)
    const next = event.key === "ArrowRight" || event.key === "ArrowDown" ? order[(index + 1) % order.length]
      : event.key === "ArrowLeft" || event.key === "ArrowUp" ? order[(index + order.length - 1) % order.length]
      : null
    if (!next) return
    event.preventDefault()
    selectLayout(next)
    ;(event.currentTarget.querySelector(`[role="radio"][aria-checked="true"]`) as HTMLElement | null)?.focus()
    window.requestAnimationFrame(() => (event.currentTarget?.querySelector(`[role="radio"][aria-checked="true"]`) as HTMLElement | null)?.focus())
  }
  const fileHref = `/api/documents/${source.documentId}/source`

  // Hand the frame around us the document, so its ⋯ carries Archive · Flag · Delete… (#259). The
  // standalone route wraps this component in its own frame, so the same registration serves both.
  // #258: the decision the Status line upgrades its sentence with — the last stage decision when
  // a flow ran, else the queue-side `document_reviewed` (already gated on `status === "reviewed"`
  // by the loader). Null while the history hasn't loaded, so the row-derived sentence stands.
  const lastStageDecision = history?.stageDecisions.length ? history.stageDecisions[history.stageDecisions.length - 1] : null
  const decision = lastStageDecision
    ? { kind: lastStageDecision.decision === "approve" ? "approved" as const : "rejected" as const, actorName: lastStageDecision.actorName, at: lastStageDecision.decidedAt }
    : history?.reviewed ? { kind: "approved" as const, actorName: history.reviewed.actorName, at: history.reviewed.at }
    : null
  useRegisterDocumentActions({
    workspaceId, documentId: header.documentId, fileId: header.fileId, filename: header.filename,
    flagged: header.flagged, archived: header.archived, cancelled: header.cancelled, cancelledReason: header.cancelledReason, reviewLink: header.reviewLink,
    decision,
  })

  const selectDocType = async (type: "expense" | "sale" | "bank_statement" | "other") => {
    setSavingDocType(true)
    setDocType(type)
    try {
      const result = await setDocumentTypeAction(workspaceId, header.documentId, type)
      if (!result.success) { toast.error(result.error || "Could not save document type"); setDocType(docType); return }
    } catch {
      toast.error("Could not reach the server")
      setDocType(docType)
    } finally {
      setSavingDocType(false)
    }
  }

  const arrayIndex = fields.findIndex((field) => field.type === "array")
  let summaryStart = arrayIndex
  while (summaryStart > 0 && fields[summaryStart - 1].type === "number") summaryStart--
  const summaryFields = arrayIndex > -1 ? fields.slice(summaryStart, arrayIndex) : []
  const summaryKeys = new Set(summaryFields.map((field) => field.key))
  const formFields = fields.filter((field) => !summaryKeys.has(field.key))

  const saveNote = async () => {
    setSavingNote(true)
    try {
      const result = await updateDocumentNoteAction(workspaceId, header.documentId, note)
      if (!result.success) { toast.error(result.error || "Could not save the note"); return }
      toast.success("Note saved")
    } catch {
      toast.error("Could not reach the server")
    } finally {
      setSavingNote(false)
    }
  }

  // A real tablist for the keyboard: the selected tab is the one tab stop, ←/→ (and Home/End)
  // move and select, each tab names its panel. Below `lg` (#257 spec 3.5) the order puts the
  // decision first — Approval · Details · Checks · Audit · Note — since the phone lane exists to
  // decide; desktop keeps Details first.
  const tabId = (value: Tab) => `${source.documentId}-tab-${value}`
  const panelId = (value: Tab) => `${source.documentId}-panel-${value}`
  const tabButton = (value: Tab, label: string, count?: number) => <button type="button" key={value} role="tab" id={tabId(value)} aria-controls={panelId(value)}
    aria-selected={tab === value} tabIndex={tab === value ? 0 : -1}
    aria-label={count ? `${label}, ${count} open` : undefined}
    className={`flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-t-md border-b-2 px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600 lg:min-h-0 ${tab === value ? "border-emerald-700 text-emerald-800" : "border-transparent text-slate-600 hover:text-slate-900"}`}
    onClick={() => setTab(value)}>
    {label}
    {!!count && <span className="rounded-full bg-amber-100 px-1.5 py-px text-xs font-semibold tabular-nums text-amber-800">{count}</span>}
  </button>
  const panelProps = (value: Tab) => ({ id: panelId(value), role: "tabpanel", "aria-labelledby": tabId(value), tabIndex: -1 as const })
  const onTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
    const index = tabs.indexOf(document.activeElement as HTMLButtonElement)
    if (index < 0) return
    let next: number | null = null
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length
    else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length
    else if (event.key === "Home") next = 0
    else if (event.key === "End") next = tabs.length - 1
    if (next === null) return
    event.preventDefault()
    tabs[next].focus()
    tabs[next].click()
  }

  const layoutOption = (value: PanelLayout, label: string) => <button type="button" key={value} role="radio" aria-checked={layout === value} tabIndex={layout === value ? 0 : -1}
    onClick={() => selectLayout(value)}
    className={`h-7 rounded-[5px] px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${layout === value ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>
    {label}
  </button>

  // #236: "extracted fields are read-only while a stage is pending" (decision #6) — derived from
  // the same `history.pendingStages` the Approval tab already renders, so it applies wherever a
  // workflow is mid-run, with no new prop for a caller to remember to pass. Full mode (#259)
  // carries no `history`, so it never locks — it has no decision bar to lock underneath.
  const fieldsReadOnly = !!history && history.pendingStages.length > 0

  return <div className="flex h-full min-h-0 flex-col overflow-hidden bg-white">
    {/* The one band under the pane header: Extracted → Checks → Approval → Sync → Pay. The frame
        around this component owns the name, the Status line and the ⋯ (#259); the document
        introduces itself once, up there, never again down here. */}
    {stageIndicator && stageIndicator.length > 0 && <StageIndicator steps={stageIndicator} />}

    {/* #217: the drift banner (or its calm "first statement" reading) always renders first among
        this pane's banners/notices, above the generic missing-fields one below. */}
    {docType === "bank_statement" && institutionId && <StatementDriftBanner
      workspaceId={workspaceId}
      documentId={header.documentId}
      institutionName={institutionName ?? null}
      driftCheck={(checks ?? []).find((check) => check.checkCode === "statement_layout_drift") ?? null}
    />}

    {/* Alert banner */}
    {(missingRequiredFields.length > 0 || conflictingLabels.length > 0) && <div className="border-b border-indigo-200 bg-indigo-50 px-6 py-2 text-sm text-indigo-700">
      {missingRequiredFields.length > 0 && <p>Missing required fields: <strong>{missingRequiredFields.join(", ")}</strong></p>}
      {conflictingLabels.length > 0 && <p>Pages disagreed on: <strong>{conflictingLabels.join(", ")}</strong> — please confirm against the source.</p>}
    </div>}

    {/* Main content area. Below `lg` (the pane is a full-screen sheet there) the source stacks
        above the fields at a fixed height so both stay reachable without a second sheet. */}
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
      {/* Source panel. The strip at its top is where the file lives now — filename, Open file, and
          the layout control — and it stays rendered in Details layout (the panel collapses to the
          strip) so the way back to Split is always in view. */}
      <div className={`flex min-h-0 flex-col overflow-hidden border-slate-200 motion-safe:transition-[flex-basis] motion-safe:duration-200 ${layout === "details-only" ? "shrink-0 border-b lg:basis-auto lg:border-b-0 lg:border-r" : `${sourceShown ? "h-[38vh]" : "h-auto"} shrink-0 border-b lg:h-auto lg:shrink lg:border-b-0 lg:border-r`} ${layout === "source-only" ? "flex-1" : layout === "split" ? "lg:basis-[52%]" : ""}`}>
        <div className="flex min-h-9 shrink-0 items-center gap-2 border-b border-slate-100 px-3 py-1 text-[13px]">
          <span className="min-w-0 flex-1 break-all font-medium leading-snug text-slate-700">{header.filename}</span>
          <a href={fileHref} target="_blank" rel="noopener noreferrer" title="Open the source file in a new tab"
            className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600">
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />Open file
          </a>
          {/* #257 spec 3.5: on the phone the source is a strip the approver can expand when the
              decision needs a look at the page — collapsed, the tabs get the height. */}
          {layout !== "details-only" && <button type="button" onClick={toggleSource} aria-expanded={sourceShown} aria-controls={`${source.documentId}-source`}
            className="inline-flex h-9 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 lg:hidden">
            {sourceShown ? <ChevronUp className="h-3.5 w-3.5" aria-hidden /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden />}
            {sourceShown ? "Hide source" : "Show source"}
          </button>}
          <div role="radiogroup" aria-label="Pane layout" onKeyDown={onLayoutKeyDown} className="hidden shrink-0 items-center gap-0.5 rounded-md bg-slate-100 p-0.5 lg:flex">
            {layoutOption("split", "Split")}
            {layoutOption("details-only", "Details")}
            {layoutOption("source-only", "Source")}
          </div>
        </div>
        {layout !== "details-only" && <div id={`${source.documentId}-source`} className={sourceShown ? "contents" : "hidden lg:contents"}><SourceViewer source={source} target={target} /></div>}
      </div>

      {/* Details panel */}
      {layout !== "source-only" && <div className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden motion-safe:transition-[flex-basis] motion-safe:duration-200 ${layout === "split" ? "lg:flex-none lg:basis-[48%]" : ""}`}>
        <div className="flex items-center shadow-[inset_0_-1px_0_0_theme(colors.slate.100)]">
          <div className="flex gap-0.5 overflow-x-auto px-3 pt-1" role="tablist" aria-label="Document detail" onKeyDown={onTabKeyDown}>
            {history && phone
              ? <>
                {tabButton("approval", "Approval")}
                {tabButton("details", "Details")}
                {tabButton("checks", "Checks", history.gates.length)}
                {tabButton("activity", "Audit")}
                {tabButton("note", "Note")}
              </>
              : <>
                {tabButton("details", "Details")}
                {tabButton("note", "Note")}
                {history
                  ? <>
                    {tabButton("approval", "Approval")}
                    {tabButton("activity", "Audit")}
                    {tabButton("checks", "Checks", history.gates.length)}
                  </>
                  : tabButton("activity", "Activity")}
              </>}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {tab === "details" && <div {...panelProps("details")} className={`mx-auto space-y-4 p-4 ${layout === "details-only" ? "max-w-2xl" : ""}`}>
            {/* Document type confirmation — compact inline when confirmed, prominent when not */}
            {docType ? (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-xs text-slate-500">Type:</span>
                <span className="font-medium text-slate-800">{docType === "expense" ? "Expense" : docType === "sale" ? "Sale" : docType === "bank_statement" ? "Bank Statement" : "Other"}</span>
                <button type="button" disabled={savingDocType} onClick={() => setDocType(null)}
                  className="text-xs text-slate-400 hover:text-slate-600">Change</button>
              </div>
            ) : (
              <div>
                <p className="mb-1.5 text-sm font-medium text-slate-800">What type of document is this?</p>
                <div className="flex flex-wrap gap-1.5">
                  {(["expense", "sale", "bank_statement", "other"] as const).map((value) => (
                    <button key={value} type="button" disabled={savingDocType} onClick={() => void selectDocType(value)}
                      className="rounded border px-2.5 py-1 text-sm text-slate-600 hover:bg-slate-50">
                      {DOC_TYPE_LABELS[value]}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* #217: a bank statement needs an asserted Institution before the layout-drift
                check (#207) has anything to compare against — same "user asserts, assertion is
                authoritative" rule as the document-type control just above. */}
            {docType === "bank_statement" && <InstitutionAssert
              workspaceId={workspaceId}
              documentId={header.documentId}
              institutions={institutions ?? []}
              institutionId={institutionId ?? null}
              institutionName={institutionName ?? null}
            />}

            {/* Decision #6: a stage is still pending on this invoice's Approval, so its extracted
                fields are locked rather than editable underneath a decision in flight. */}
            {fieldsReadOnly && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Fields are locked while an approval decision is pending on this invoice.
            </p>}

            {/* Review form — A4.1 field navigation: land on the lowest-confidence field first,
                Enter = confirm-and-advance. Non-array fields are what the nav visits; the array
                editor has its own confidence signal and its own keyboard flow. */}
            <fieldset disabled={fieldsReadOnly} className="min-w-0">
              <FieldNavForm
                saveReview={saveReview}
                docType={docType}
                formFields={formFields}
                data={data}
                fieldConfidence={fieldConfidence}
                provenanceFields={provenanceFields}
                provenanceItems={provenanceItems}
                summaryFields={summaryFields}
                rationales={rationales ?? null}
                checks={checks ?? []}
                workspaceId={workspaceId}
                documentId={header.documentId}
                setTarget={setTarget}
                po={po}
              />
            </fieldset>

            {fxBadge && <div className="pt-2">{fxBadge}</div>}
            {canPush && <div className="pt-2">{pushCard}</div>}

            {canCreateRule && <Card className="border-slate-200 shadow-sm">
              <CardHeader><CardTitle>Create a rule from this document</CardTitle><CardDescription>Matches this supplier automatically on future documents.</CardDescription></CardHeader>
              <CardContent><AutomationRuleForm workspaceId={workspaceId} defaultSupplier={defaultSupplier} /></CardContent>
            </Card>}

            {matchKind && bankMatches}
            {documentMatches}

            {!header.reviewLink && <CreateReviewTaskButton workspaceId={workspaceId} documentId={header.documentId} />}
          </div>}

          {tab === "note" && <div {...panelProps("note")} className={`mx-auto space-y-3 p-6 ${layout === "details-only" ? "max-w-2xl" : ""}`}>
            <textarea className="min-h-48 w-full rounded-lg border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm transition-colors focus:border-emerald-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-100" placeholder="A note only your team sees — not sent anywhere, not part of the extracted data."
              value={note} onChange={(event) => setNote(event.target.value)} />
            <button type="button" disabled={savingNote} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-800 disabled:opacity-40" onClick={() => void saveNote()}>
              {savingNote && <Loader2 className="h-4 w-4 animate-spin" />}Save note
            </button>
          </div>}

          {tab === "activity" && <div {...panelProps("activity")} className={`mx-auto p-6 ${layout === "details-only" ? "max-w-2xl" : ""}`}>
            <AuditLog events={history?.auditEvents ?? auditEvents} />
          </div>}

          {tab === "approval" && history && <div {...panelProps("approval")} className={`mx-auto p-4 lg:p-6 ${layout === "details-only" ? "max-w-2xl" : ""}`}>
            <ApprovalTab workspaceId={workspaceId} history={history} state={state} queueTitle={queueTitle} cancelledReason={header.cancelledReason} />
          </div>}

          {tab === "checks" && history && <div {...panelProps("checks")} className={`mx-auto p-6 ${layout === "details-only" ? "max-w-2xl" : ""}`}>
            <ChecksTab workspaceId={workspaceId} gates={history.gates} escalations={history.escalations} />
          </div>}
        </div>
      </div>}
    </div>
  </div>
}

/** A4: the inner form that owns the field-nav state. Split out of SplitPane so the hook can
 * derive its ordering directly from formFields without SplitPane touching field-nav internals. */
function FieldNavForm({ saveReview, docType, formFields, data, fieldConfidence, provenanceFields, provenanceItems, summaryFields, rationales, checks, workspaceId, documentId, setTarget, po }: {
  saveReview: (formData: FormData) => Promise<ActionState<SaveReviewResult | null>>
  docType: string | null
  formFields: DocumentFieldDefinition[]
  data: Record<string, unknown>
  fieldConfidence: Record<string, number>
  provenanceFields: Record<string, Ref>
  provenanceItems: Record<string, (Ref | null)[]>
  summaryFields: DocumentFieldDefinition[]
  rationales: Record<string, FieldRationale> | null
  checks: FieldCheck[]
  workspaceId: string
  documentId: string
  setTarget: (target: ProvenanceTarget) => void
  po: LineItemsPoProps | null
}) {
  const navItems = formFields.map((field) => ({ key: field.key, confidence: fieldConfidence[field.key] ?? null, type: field.type }))
  const nav = useFieldNav(navItems)
  const formRef = useRef<HTMLFormElement>(null)
  const [liveChecks, setLiveChecks] = useState(checks)
  // #258 (B2): Save review is the one in-pane mutation that changes the processing state. The
  // action returns instead of redirecting; success toasts the outcome and asks the queue to
  // refresh (`onMutated` → `QueueScreen.refresh()`), so the row pill, glyph, Status line, stepper
  // and Approval tab re-derive together. Full mode has no queue around it and refreshes itself.
  // Failure keeps the uncontrolled inputs as typed and leaves focus on the button.
  const paneContext = useContext(PaneDocumentContext)
  const router = useRouter()
  const [saveState, saveAction, saving] = useActionState<ActionState<SaveReviewResult | null> | null, FormData>(
    async (_previous, formData) => {
      try { return await saveReview(formData) } catch { return { success: false, error: "Could not save — try again" } }
    }, null)
  useEffect(() => {
    if (!saveState) return
    if (!saveState.success) { toast.error(saveState.error || "Could not save — try again"); return }
    const outcome = saveState.data
    if (outcome?.approved) toast.success("Approved")
    else toast.success(outcome?.missingLabel ? `Saved — still In review: ${outcome.missingLabel}` : "Saved — still In review")
    if (paneContext?.onMutated) paneContext.onMutated("changed")
    else router.refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveState])
  // One summary line in place of the per-field "Extracted" badges the audit had FieldRow drop:
  // says how many fields landed, and how many of those are worth a second look.
  const extractedCount = formFields.filter((field) => data[field.key] !== undefined && data[field.key] !== null && data[field.key] !== "").length

  const recompute = () => {
    if (!formRef.current) return
    setLiveChecks(rebuildLiveChecks(checks, parseLiveCheckValues(new FormData(formRef.current)), true))
  }

  const onEscalate = async (check: FieldCheck) => {
    setLiveChecks((prev) => prev.map((c) => (c.checkCode === check.checkCode ? { ...c, escalated: true } : c)))
    const result = await escalateCheckAction(workspaceId, documentId, check.checkCode)
    if (!result.success) toast.error(result.error || "Could not escalate this check")
  }

  return <form ref={formRef} action={saveAction} className="space-y-3" onKeyDown={nav.onFormKeyDown} onInput={recompute}>
    {extractedCount > 0 && <p className="text-xs text-slate-500">
      All {extractedCount} field{extractedCount === 1 ? "" : "s"} extracted{nav.totalSuspects > 0 ? ` — ${nav.totalSuspects} low-confidence` : ""}.
    </p>}
    {nav.totalSuspects > 0 && <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
      <span><span className="font-semibold">{nav.suspectsRemaining}</span> of {nav.totalSuspects} low-confidence fields to review — Enter confirms and moves to the next.</span>
      <button type="button" className="rounded-md border border-amber-300 bg-white px-2 py-0.5 font-medium text-amber-800 hover:bg-amber-100" onClick={() => nav.focusNext()}>Next suspect</button>
    </div>}
    {formFields.map((field) => field.type === "array"
      ? <LineItemsSection key={field.key} field={field} value={data[field.key]} fieldKey={field.key} summaryFields={summaryFields} fieldValues={data} provenanceFields={provenanceFields} provenanceItems={provenanceItems[field.key] ?? []} onFocusSource={setTarget}
          checks={liveChecks.filter((check) => check.fields.some((f) => f === field.key || f.startsWith(`${field.key}[`)))} onEscalate={onEscalate} po={field.key === "line_items" ? po : null} />
      : <FieldRow key={field.key} field={field} value={data[field.key]} confidence={fieldConfidence[field.key] ?? null} ref={provenanceFields[field.key] ?? null} onFocusSource={setTarget} rationale={rationales?.[field.key] ?? null}
          checks={liveChecks.filter((check) => checkAppliesToField(check, field.key))} onEscalate={onEscalate}
          registerNav={nav.registerField} isCurrent={nav.currentKey === field.key} isCompleted={nav.completedKeys.has(field.key)} />)}
    <div className="flex items-center gap-3 border-t border-slate-100 pt-3">
      <button type="submit" id="save-review-submit" disabled={!docType} aria-busy={saving || undefined} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40" title={!docType ? "Choose Expense or Sale first" : undefined}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CheckCircle2 className="h-4 w-4" aria-hidden />}{saving ? "Saving…" : "Save review"}
      </button>
      {!docType && <span className="text-xs text-amber-600">Choose a document type first</span>}
    </div>
  </form>
}
