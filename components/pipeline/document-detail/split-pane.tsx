"use client"

import { AutomationRuleForm } from "@/components/workspace/automation-rule-form"
import { CreateReviewTaskButton } from "@/components/documents/create-review-task-button"
import { DeleteDocumentButton } from "@/components/documents/delete-document-button"
import { FieldRow } from "@/components/pipeline/document-detail/field-row"
import { LineItemsSection } from "@/components/pipeline/document-detail/line-items-section"
import { checkAppliesToField, type FieldCheck } from "@/components/pipeline/document-detail/check-types"
import { parseLiveCheckValues, rebuildLiveChecks } from "@/components/pipeline/document-detail/live-checks"
import { StageIndicator, type StageStep } from "@/components/pipeline/document-detail/stage-indicator"
import { useFieldNav } from "@/components/pipeline/document-detail/use-field-nav"
import { archiveDocumentsAction, flagDocumentsAction, moveDocumentsToStageAction, updateDocumentNoteAction } from "@/app/(app)/workspaces/[workspaceId]/pipeline-actions"
import { escalateCheckAction, setDocumentTypeAction } from "@/app/(app)/workspaces/[workspaceId]/actions"
import { InstitutionAssert } from "@/components/pipeline/document-detail/institution-assert"
import { StatementDriftBanner } from "@/components/pipeline/document-detail/statement-drift-banner"
import { ApprovalStepChain, AuditLog, ChecksTab, type DocumentHistory } from "@/components/queue/history-tabs"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { SourceViewer, type ProvenanceTarget, type SourceDocument } from "@/components/viewer/source-preview"
import type { DocumentFieldDefinition } from "@/lib/document-templates"
import type { PipelineStage } from "@/lib/documents/stages"
import type { Ref } from "@/lib/provenance"
import type { FieldRationale } from "@/lib/rationale"
import { Archive, ArrowDown, ArrowLeft, ArrowUp, Building2, CheckCircle2, ChevronLeft, ChevronRight, Eye, EyeOff, Flag, Loader2, Maximize2, Minimize2, PanelLeftClose, PanelLeftOpen } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useRef, useState, type ReactNode } from "react"
import { toast } from "sonner"

type Tab = "details" | "note" | "activity" | "approval" | "checks"
type PanelLayout = "split" | "source-only" | "details-only"

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
  saveReview, documentType: initialDocumentType, note: initialNote, auditEvents, prevHref, nextHref, position, stage, afterActionHref,
  header, canPush, pushCard, canCreateRule, defaultSupplier, matchKind, bankMatches, documentMatches, paymentStatus, rationales, checks, fxBadge, stageIndicator,
  institutions, institutionId, institutionName, embedded = false, history,
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
  saveReview: (formData: FormData) => Promise<void>
  documentType: "expense" | "sale" | "bank_statement" | null
  note: string
  auditEvents: Array<{ id: string; label: string; createdAt: string; actorName: string | null }>
  prevHref: string | null
  nextHref: string | null
  position: { index: number; total: number } | null
  stage: PipelineStage | "archive" | null
  afterActionHref: string
  header: { filename: string; documentId: string; fileId: string; status: string; flagged: boolean; reviewLink: { href: string; label: string } | null }
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
  /** #225: rendered inside a Queue screen's Detail pane rather than as a standalone route. The
   * pane owns the frame (title, close, ↑/↓, the sticky Approve/Reject bar), so embedded mode
   * drops the Back link, prev/next, the standalone Approve button and the `h-screen` root, and
   * stacks source over fields below `lg` where the pane is a full-screen sheet. */
  embedded?: boolean
  /** #225: the Approval / Audit / Checks tabs' data, loaded with the document so they sit in the
   * same tab strip as Details and Note. Only supplied in embedded mode. */
  history?: DocumentHistory | null
}) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>("details")
  const [target, setTarget] = useState<ProvenanceTarget | null>(initialTarget)
  const [note, setNote] = useState(initialNote)
  const [savingNote, setSavingNote] = useState(false)
  const [flagged, setFlagged] = useState(header.flagged)
  const [docType, setDocType] = useState<"expense" | "sale" | "bank_statement" | "other" | null>(initialDocumentType)
  const [savingDocType, setSavingDocType] = useState(false)
  const [busyAction, setBusyAction] = useState<"flag" | "archive" | "ready" | null>(null)
  const [layout, setLayout] = useState<PanelLayout>("split")

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

  const toggleFlag = async () => {
    setBusyAction("flag")
    const next = !flagged
    try {
      const result = await flagDocumentsAction(workspaceId, [header.documentId], next)
      if (!result.success) { toast.error(result.error || "Could not update the flag"); return }
      setFlagged(next)
    } catch {
      toast.error("Could not reach the server")
    } finally {
      setBusyAction(null)
    }
  }

  const archive = async () => {
    setBusyAction("archive")
    try {
      const result = await archiveDocumentsAction(workspaceId, [header.documentId], true)
      if (!result.success) { toast.error(result.error || "Could not archive this document"); return }
      toast.success("Archived")
      if (!embedded) router.push(afterActionHref)
      router.refresh()
    } catch {
      toast.error("Could not reach the server")
    } finally {
      setBusyAction(null)
    }
  }

  const moveToReady = async () => {
    setBusyAction("ready")
    try {
      const result = await moveDocumentsToStageAction(workspaceId, [header.documentId], "approved")
      if (!result.success) { toast.error(result.error || "Could not approve this document"); return }
      // Validation can hold the document back (missing required fields / no document type) — say
      // so instead of announcing an approval the Review tab immediately contradicts.
      if ((result.data?.heldBack ?? 0) > 0) {
        toast.warning("Not approved yet — fill in the missing required fields (and pick a document type) first.")
        router.refresh()
        return
      }
      toast.success("Approved")
      router.push(afterActionHref)
      router.refresh()
    } catch {
      toast.error("Could not reach the server")
    } finally {
      setBusyAction(null)
    }
  }

  const cycleLayout = () => {
    setLayout((prev) => {
      if (prev === "split") return "details-only"
      if (prev === "details-only") return "source-only"
      return "split"
    })
  }

  const tabButton = (value: Tab, label: string, count?: number) => <button type="button" key={value} role="tab" aria-selected={tab === value}
    className={`flex items-center gap-1.5 whitespace-nowrap rounded-t-md border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${tab === value ? "border-emerald-700 text-emerald-800" : "border-transparent text-slate-600 hover:text-slate-900"}`}
    onClick={() => setTab(value)}>
    {label}
    {!!count && <span className="rounded-full bg-amber-100 px-1.5 py-px text-xs font-semibold tabular-nums text-amber-800">{count}</span>}
  </button>

  const toolbarBtn = "inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-800 disabled:pointer-events-none disabled:opacity-40 transition-colors"

  const statusColor = header.status === "reviewed" ? "bg-emerald-100 text-emerald-800 border-emerald-200"
    : header.status === "needs_review" || header.status === "ready_for_review" ? "bg-amber-100 text-amber-800 border-amber-200"
    : "bg-slate-100 text-slate-700 border-slate-200"

  const showSource = layout === "split" || layout === "source-only"
  const showDetails = layout === "split" || layout === "details-only"

  return <div className={`flex flex-col overflow-hidden ${embedded ? "h-full min-h-0 bg-white" : "h-screen bg-slate-50"}`}>
    {/* Top bar */}
    <div className={`flex items-center gap-2 border-b border-slate-200 px-4 py-2 ${embedded ? "overflow-x-auto sm:flex-wrap" : "flex-wrap"}`}>
      {embedded && <span className="min-w-0 flex-1 sm:hidden" aria-hidden />}
      {!embedded && <>
        <Link href={stage ? `/workspaces/${workspaceId}/pipeline?stage=${stage}` : `/workspaces/${workspaceId}/pipeline`} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" />Back
        </Link>
        <div className="mx-2 h-5 w-px bg-slate-200" />
      </>}

      {embedded
        ? <span className="hidden min-w-0 flex-1 truncate text-sm text-slate-600 sm:inline" title={header.filename}>{header.filename}</span>
        : <h1 className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800" title={header.filename}>{header.filename}</h1>}

      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusColor}`}>
        {header.status.replaceAll("_", " ")}
      </span>

      {docType && <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${docType === "expense" ? "border-red-200 bg-red-50 text-red-700" : docType === "sale" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : docType === "bank_statement" ? "border-blue-200 bg-blue-50 text-blue-700" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
        {docType === "expense" ? <ArrowUp className="h-3 w-3" /> : docType === "sale" ? <ArrowDown className="h-3 w-3" /> : docType === "bank_statement" ? <Building2 className="h-3 w-3" /> : null}
        {DOC_TYPE_LABELS[docType]}
      </span>}

      {/* #220: "synced" means the push succeeded but the ledger hasn't confirmed a payment status
          yet — distinct from (and must not fall into) the "Unpaid" bucket below, which is a
          confirmed negative answer, not an absence of one. */}
      {paymentStatus && <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${paymentStatus === "paid" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : paymentStatus === "partial" ? "border-amber-200 bg-amber-50 text-amber-700" : paymentStatus === "synced" ? "border-slate-200 bg-slate-50 text-slate-700" : "border-red-200 bg-red-50 text-red-700"}`}>
        {paymentStatus === "paid" ? "Paid" : paymentStatus === "partial" ? "Partially paid" : paymentStatus === "synced" ? "Synced" : "Unpaid"}
      </span>}

      <div className="mx-2 h-5 w-px bg-slate-200" />

      <button type="button" title={flagged ? "Remove flag" : "Flag for attention"} aria-label={flagged ? "Remove flag" : "Flag for attention"} aria-pressed={flagged} disabled={busyAction === "flag"} onClick={() => void toggleFlag()}
        className={`rounded-lg p-1.5 transition-colors ${flagged ? "bg-indigo-50 text-indigo-600" : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"}`}>
        <Flag className={`h-4 w-4 ${flagged ? "fill-indigo-400" : ""}`} />
      </button>

      {/* Keyed off the document's own status, not the ?stage= the reader arrived from — a doc
          opened from search (no stage param) still needs its Approve button. Hidden once the
          document is reviewed: it's already approved, re-approving is a no-op. */}
      {!embedded && header.status !== "reviewed" && header.status !== "queued" && header.status !== "failed" && stage !== "archive" && <button type="button" disabled={busyAction === "ready"} onClick={() => void moveToReady()} className={toolbarBtn}>
        {busyAction === "ready" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Approve
      </button>}
      {stage !== "archive" && <button type="button" disabled={busyAction === "archive"} onClick={() => void archive()} className={toolbarBtn}>
        {busyAction === "archive" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}Archive
      </button>}

      {header.reviewLink && <Link className="text-xs text-emerald-600 underline" href={header.reviewLink.href}>{header.reviewLink.label}</Link>}

      <DeleteDocumentButton workspaceId={workspaceId} fileId={header.fileId} documentId={header.documentId} filename={header.filename} />

      <div className="mx-2 h-5 w-px bg-slate-200" />

      {/* Layout toggle */}
      <button type="button" onClick={cycleLayout} title={layout === "split" ? "Expand details" : layout === "details-only" ? "Show source only" : "Split view"} aria-label={layout === "split" ? "Expand details" : layout === "details-only" ? "Show source only" : "Split view"} className="hidden rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 lg:inline-flex">
        {layout === "split" ? <Maximize2 className="h-4 w-4" /> : layout === "details-only" ? <PanelLeftOpen className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
      </button>

      {!embedded && <>
        {position && <span className="text-xs tabular-nums text-slate-500">{position.index}/{position.total}</span>}
        <Link href={prevHref ?? "#"} aria-disabled={!prevHref} aria-label="Previous document" className={`rounded-lg p-1 ${prevHref ? "text-slate-500 hover:bg-slate-100 hover:text-slate-700" : "pointer-events-none text-slate-300"}`}><ChevronLeft className="h-4 w-4" /></Link>
        <Link href={nextHref ?? "#"} aria-disabled={!nextHref} aria-label="Next document" className={`rounded-lg p-1 ${nextHref ? "text-slate-500 hover:bg-slate-100 hover:text-slate-700" : "pointer-events-none text-slate-300"}`}><ChevronRight className="h-4 w-4" /></Link>
      </>}
    </div>

    {/* Five-step lifecycle: Extracted → Checks → Approval → Sync → Pay. See stage-indicator.tsx. */}
    {stageIndicator && stageIndicator.length > 0 && <div className="border-b border-slate-200">
      <StageIndicator steps={stageIndicator} />
    </div>}

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

    {/* Main content area. Embedded below `lg` (the pane is a full-screen sheet there) the source
        stacks above the fields at a fixed height so both stay reachable without a second sheet. */}
    <div className={`flex min-h-0 flex-1 overflow-hidden ${embedded ? "flex-col lg:flex-row" : ""}`}>
      {/* Source panel */}
      {showSource && <div className={`flex min-h-0 flex-col overflow-hidden border-slate-200 transition-[flex-basis] duration-200 ${embedded ? "h-[38vh] shrink-0 border-b lg:h-auto lg:shrink lg:border-b-0 lg:border-r" : "border-r bg-white"} ${layout === "source-only" ? "flex-1" : "lg:basis-[52%]"}`}>
        {layout !== "split" && <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
          <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Source document</span>
          <button type="button" onClick={() => setLayout("split")} className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600" title="Split view">
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>}
        <SourceViewer source={source} target={target} />
      </div>}

      {/* Details panel */}
      {showDetails && <div className={`flex min-h-0 flex-col overflow-hidden transition-[flex-basis] duration-200 ${embedded ? "" : "bg-white"} ${layout === "details-only" ? "flex-1" : embedded ? "min-h-0 flex-1 lg:flex-none lg:basis-[48%]" : "basis-[48%]"}`}>
        <div className="flex items-center shadow-[inset_0_-1px_0_0_theme(colors.slate.100)]">
          <div className="flex gap-0.5 overflow-x-auto px-3 pt-1" role="tablist" aria-label="Document detail">
            {tabButton("details", "Details")}
            {tabButton("note", "Note")}
            {embedded && history
              ? <>
                {tabButton("approval", "Approval")}
                {tabButton("activity", "Audit")}
                {tabButton("checks", "Checks", history.gates.length)}
              </>
              : tabButton("activity", "Activity")}
          </div>
          {layout !== "split" && <button type="button" onClick={() => setLayout("split")} className="ml-auto mr-3 rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600" title="Split view">
            <PanelLeftOpen className="h-4 w-4" />
          </button>}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {tab === "details" && <div className={`mx-auto space-y-4 p-4 ${layout === "details-only" ? "max-w-2xl" : ""}`}>
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

            {/* Review form — A4.1 field navigation: land on the lowest-confidence field first,
                Enter = confirm-and-advance. Non-array fields are what the nav visits; the array
                editor has its own confidence signal and its own keyboard flow. */}
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
            />

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

          {tab === "note" && <div className={`mx-auto space-y-3 p-6 ${layout === "details-only" ? "max-w-2xl" : ""}`}>
            <textarea className="min-h-48 w-full rounded-lg border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm transition-colors focus:border-emerald-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-100" placeholder="A note only your team sees — not sent anywhere, not part of the extracted data."
              value={note} onChange={(event) => setNote(event.target.value)} />
            <button type="button" disabled={savingNote} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-800 disabled:opacity-40" onClick={() => void saveNote()}>
              {savingNote && <Loader2 className="h-4 w-4 animate-spin" />}Save note
            </button>
          </div>}

          {tab === "activity" && <div className={`mx-auto p-6 ${layout === "details-only" ? "max-w-2xl" : ""}`}>
            <AuditLog events={history?.auditEvents ?? auditEvents} />
          </div>}

          {tab === "approval" && history && <div className={`mx-auto p-6 ${layout === "details-only" ? "max-w-2xl" : ""}`}>
            <ApprovalStepChain decisions={history.stageDecisions} pendingStages={history.pendingStages} />
          </div>}

          {tab === "checks" && history && <div className={`mx-auto p-6 ${layout === "details-only" ? "max-w-2xl" : ""}`}>
            <ChecksTab workspaceId={workspaceId} gates={history.gates} />
          </div>}
        </div>
      </div>}
    </div>
  </div>
}

/** A4: the inner form that owns the field-nav state. Split out of SplitPane so the hook can
 * derive its ordering directly from formFields without SplitPane touching field-nav internals. */
function FieldNavForm({ saveReview, docType, formFields, data, fieldConfidence, provenanceFields, provenanceItems, summaryFields, rationales, checks, workspaceId, documentId, setTarget }: {
  saveReview: (formData: FormData) => void | Promise<void>
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
}) {
  const navItems = formFields.map((field) => ({ key: field.key, confidence: fieldConfidence[field.key] ?? null, type: field.type }))
  const nav = useFieldNav(navItems)
  const formRef = useRef<HTMLFormElement>(null)
  const [liveChecks, setLiveChecks] = useState(checks)
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

  return <form ref={formRef} action={saveReview} className="space-y-3" onKeyDown={nav.onFormKeyDown} onInput={recompute}>
    {extractedCount > 0 && <p className="text-xs text-slate-500">
      All {extractedCount} field{extractedCount === 1 ? "" : "s"} extracted{nav.totalSuspects > 0 ? ` — ${nav.totalSuspects} low-confidence` : ""}.
    </p>}
    {nav.totalSuspects > 0 && <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
      <span><span className="font-semibold">{nav.suspectsRemaining}</span> of {nav.totalSuspects} low-confidence fields to review — Enter confirms and moves to the next.</span>
      <button type="button" className="rounded-md border border-amber-300 bg-white px-2 py-0.5 font-medium text-amber-800 hover:bg-amber-100" onClick={() => nav.focusNext()}>Next suspect</button>
    </div>}
    {formFields.map((field) => field.type === "array"
      ? <LineItemsSection key={field.key} field={field} value={data[field.key]} fieldKey={field.key} summaryFields={summaryFields} fieldValues={data} provenanceFields={provenanceFields} provenanceItems={provenanceItems[field.key] ?? []} onFocusSource={setTarget}
          checks={liveChecks.filter((check) => check.fields.some((f) => f === field.key || f.startsWith(`${field.key}[`)))} onEscalate={onEscalate} />
      : <FieldRow key={field.key} field={field} value={data[field.key]} confidence={fieldConfidence[field.key] ?? null} ref={provenanceFields[field.key] ?? null} onFocusSource={setTarget} rationale={rationales?.[field.key] ?? null}
          checks={liveChecks.filter((check) => checkAppliesToField(check, field.key))} onEscalate={onEscalate}
          registerNav={nav.registerField} isCurrent={nav.currentKey === field.key} isCompleted={nav.completedKeys.has(field.key)} />)}
    <div className="flex items-center gap-3 border-t border-slate-100 pt-3">
      <button type="submit" disabled={!docType} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40" title={!docType ? "Choose Expense or Sale first" : undefined}>
        <CheckCircle2 className="h-4 w-4" />Save review
      </button>
      {!docType && <span className="text-xs text-amber-600">Choose a document type first</span>}
    </div>
  </form>
}
