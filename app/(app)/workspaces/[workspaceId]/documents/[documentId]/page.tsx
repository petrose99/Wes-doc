import { getSelectionAuditPanelDataAction, saveDocumentReviewAction } from "@/app/(app)/workspaces/[workspaceId]/actions"
import { SplitPane } from "@/components/pipeline/document-detail/split-pane"
import { PaneFrame } from "@/components/queue/detail-pane"
import { StatusLine } from "@/components/queue/status-line"
import { LEDGER_FACT_LABELS, PROCESSING_STATE_LABELS, processingState } from "@/lib/documents/processing-state"
import { processingFact } from "@/lib/documents/processing-fact"
import { getProcessingStateInput } from "@/models/processing-state"
import { labelForDestinationPath, readOrigin, withParam, type Origin } from "@/lib/navigation/origin"
import { describeOrigin } from "@/lib/navigation/origin-server"
import { OriginStrip } from "@/components/queue/origin-strip"
import type { DocumentHistory } from "@/components/queue/history-tabs"
import { FxConversionBadge } from "@/components/documents/fx-conversion-badge"
import { MatchPanel } from "@/components/bank-match/match-panel"
import { DocumentMatchesPanel } from "@/components/matching/document-matches-panel"
import { listDocumentMatchesForDocument } from "@/models/document-matches-query"
import { PoConsumptionPanel } from "@/components/matching/po-consumption-panel"
import type { LineItemsPoProps } from "@/components/pipeline/document-detail/line-items-section"
import { resolveDocType } from "@/lib/doc-types"
import { summarizeInvoicePoLinks, summarizePoConsumption, type PoConsumption } from "@/models/po-matching"
import { getCurrentUser } from "@/lib/auth"
import { parseTemplateFields } from "@/lib/document-templates"
import { applyFieldTable, isFieldTableType } from "@/lib/configuration/field-table"
import { getSavedFieldTable } from "@/models/field-configs"
import type { BlocksSidecar, DocumentProvenance } from "@/lib/provenance"
import { repairMissingBboxes } from "@/lib/provenance"
import { prisma } from "@/lib/db"
import { buildFieldRationales, type FieldRationale } from "@/lib/rationale"
import { fieldsFromCheckDetail, type FieldCheck } from "@/components/pipeline/document-detail/check-types"
import type { CheckStatus } from "@/lib/checks/types"
import { documentBlocksKey, readDocumentBlocks } from "@/lib/document-storage"
import { getWorkspaceCapabilities } from "@/lib/modules/capabilities"
import { listBankMatches } from "@/models/bank-matches"
import { listDocumentAuditEvents } from "@/models/audit-events"
import { getWorkspaceDocument } from "@/models/documents"
import { getFewShotExamples } from "@/models/field-corrections"
import { getOpenReviewTaskForDocument } from "@/models/review-tasks"
import { listWorkspaceInstitutions } from "@/models/institutions"
import { listWorkspaceIntegrationConnections, listWorkspaceIntegrationPushes } from "@/models/integrations"
import { getDocumentPaymentStatuses } from "@/models/ledger-payments"
import { requireWorkspaceRole } from "@/models/workspaces"
import { documentDestinationPath } from "@/lib/typed-destinations"
import { notFound, redirect } from "next/navigation"

/** The pipeline's split-pane document detail: source viewer on the left, tabbed
 * Details/Note/History on the right, provenance-aware field-click highlighting. Rendered inside a
 * Queue screen's Detail pane (`embedded`), or standalone under `?full=1` — the pane's *Open in a
 * new tab* — inside the same `PaneFrame` header the pane uses, so the document has one header
 * implementation everywhere (#259). Legacy `?stage=` / `?page=` deep links land on the queue.
 *
 * Deliberately NOT under the (chrome) route group — that layout's `max-w-4xl` reading-column cap
 * is right for settings pages but leaves no room for a source viewer next to the form. Same URL
 * as before ((chrome) is a route group, so this move doesn't change the path), just outside that
 * layout, so it gets the workspace shell's full-bleed width instead. */
export async function DocumentDetailPage({ params, searchParams, embedded = false, history = null, initialTab, queueTitle }: {
  params: Promise<{ workspaceId: string; documentId: string }>
  searchParams: Promise<{ stage?: string; page?: string; bb?: string; from?: string; full?: string }>
  /** #225: rendered inside a Queue screen's Detail pane (see `getQueueDetailAction`). */
  embedded?: boolean
  history?: DocumentHistory | null
  /** #236: which tab the embedded pane opens on — Approvals opens straight to "approval",
   * PO Mismatches to "checks". Undefined keeps every other queue's existing "details" default. */
  initialTab?: "details" | "note" | "activity" | "approval" | "checks"
  /** #258: "Invoices" / "Receipts" — names the queue in the Approval tab's in-review guidance. */
  queueTitle?: string
}) {
  const { workspaceId, documentId } = await params
  const query = await searchParams
  const { page: pageParam, bb: bbParam } = query
  const user = await getCurrentUser()
  const membership = await requireWorkspaceRole(workspaceId, user.id)
  const document = await getWorkspaceDocument(workspaceId, documentId)
  if (!document) goneOrNotFound(query, workspaceId, documentId)

  const capabilities = await getWorkspaceCapabilities(workspaceId)
  const canPush = document.status === "reviewed" && capabilities.has("accounting-push")
    && capabilities.pushableTemplateCodes.includes(document.template?.code ?? "")
  const [, pushes, auditEvents, paymentStatuses, processing, fullHistory] = await Promise.all([
    canPush ? listWorkspaceIntegrationConnections(workspaceId) : Promise.resolve([]),
    canPush ? listWorkspaceIntegrationPushes(workspaceId, documentId) : Promise.resolve([]),
    listDocumentAuditEvents(workspaceId, documentId),
    canPush ? getDocumentPaymentStatuses(workspaceId, [documentId]) : Promise.resolve(new Map()),
    // #258: the same inputs the queue row derives its state from, so the stepper's Approval node
    // and full mode's Status line print the row's word.
    getProcessingStateInput(workspaceId, documentId),
    // #258: full mode loads the same history the pane does — "the same pane at full width" needs
    // the Approval tab (and the Status line's actor) there too. The embedded pane's caller
    // (`getQueueDetailAction`) already passes it.
    embedded ? Promise.resolve(null) : getSelectionAuditPanelDataAction(workspaceId, documentId),
  ])
  const documentHistory = history ?? fullHistory
  const state = processing ? processingState(processing) : null

  // #252: Admin › Configuration › Fields overlays Required and not-editable on the template's
  // own definitions. Only read when the workspace has saved a table for this type.
  const configuredType = resolveDocType(document)
  const fieldTable = isFieldTableType(configuredType) ? await getSavedFieldTable(workspaceId, configuredType) : null
  const fields = applyFieldTable(parseTemplateFields(document.fieldSnapshot), fieldTable)
  const confidence = document.confidence as { missingRequiredFields?: string[]; fieldConfidence?: Record<string, number>; conflictingFields?: string[] } | null
  const fieldConfidence = confidence?.fieldConfidence || {}
  const conflictingLabels = (confidence?.conflictingFields || []).map((key) => fields.find((field) => field.key === key)?.label || key)
  const data = (document.reviewedData || document.rawExtraction || {}) as Record<string, unknown>
  const rawProvenance = document.provenance as DocumentProvenance | null
  const blocksJson = rawProvenance ? await readDocumentBlocks(documentBlocksKey(workspaceId, documentId)) : null
  const sidecar: BlocksSidecar | null = blocksJson ? (() => { try { return JSON.parse(blocksJson) as BlocksSidecar } catch { return null } })() : null
  const provenance = rawProvenance && sidecar ? repairMissingBboxes(rawProvenance, sidecar, data) : rawProvenance
  const codingData = (document.codingData as Record<string, unknown> | null) ?? {}

  // #217: the Institution picker + saved-layout drift banner only apply to bank statements —
  // skip the extra query for every other document type.
  const institutions = codingData.documentType === "bank_statement" ? await listWorkspaceInstitutions(workspaceId) : []
  const institutionName = document.institutionId ? institutions.find((institution) => institution.id === document.institutionId)?.name ?? null : null

  const templateCode = document.template?.code ?? ""
  const fewShotExamples = templateCode ? await getFewShotExamples(workspaceId, templateCode) : []
  const appliedRuleId = (document as Record<string, unknown>).appliedRuleId as string | null
  const appliedRule = appliedRuleId ? await prisma.automationRule.findUnique({ where: { id: appliedRuleId }, select: { name: true } }) : null
  const appliedRuleName = appliedRule?.name ?? null
  const fieldKeys = fields.map((f) => f.key)
  const codingSource = (document as Record<string, unknown>).codingSource as string | null
  const codingConfidence = (document as Record<string, unknown>).codingConfidence as number | null
  const aiVerdict = codingSource === "ai" ? await prisma.agentVerdict.findFirst({
    where: { workspaceId, documentId, agentKind: "coding" },
    orderBy: { createdAt: "desc" },
    select: { rationale: true },
  }) : null
  const aiRationale = (() => {
    const r = aiVerdict?.rationale as { text?: unknown } | string | null | undefined
    if (typeof r === "string") return r
    return typeof r?.text === "string" ? r.text : null
  })()
  const rationaleList = buildFieldRationales({
    codingData: Object.keys(codingData).length > 0 ? codingData : null,
    appliedRuleId,
    appliedRuleName,
    fieldConfidences: fieldConfidence,
    provenance: rawProvenance as Record<string, unknown> | null,
    fewShotExamples,
    fieldKeys,
    codingSource,
    codingConfidence,
    aiRationale,
  })
  const rationales: Record<string, FieldRationale> = {}
  for (const r of rationaleList) rationales[r.fieldKey] = r

  // #202: per-cell check results — CheckResult.fields (persisted in `detail.fields`, see
  // models/document-checks.ts) is what lets the UI anchor a check to the exact field it compared
  // instead of a checkCode -> fieldKeys lookup table that could drift from the check itself.
  const checkResults = await prisma.documentCheckResult.findMany({ where: { workspaceId, documentId } })
  const checks: FieldCheck[] = checkResults.map((row) => ({
    id: row.id,
    checkCode: row.checkCode,
    status: row.status === "escalated" ? "warn" : (row.status as CheckStatus),
    message: row.message,
    fields: fieldsFromCheckDetail(row.detail),
    detail: (row.detail && typeof row.detail === "object" ? row.detail as Record<string, unknown> : undefined),
    escalated: row.status === "escalated",
  }))

  // #258: every render of this page is the queue's pane or the `?full=1` route — both stay put
  // and refresh in place after Save review (the retired `/review` inbox was the redirect's home).
  const saveReview = async (formData: FormData) => { "use server"; return saveDocumentReviewAction(workspaceId, documentId, formData, { stay: true }) }
  const supplierValue = data.vendor ?? data.merchant
  const supplier = typeof supplierValue === "string" ? supplierValue.trim() : ""
  const canCreateRule = capabilities.has("supplier-rules") && membership.role === "owner" && supplier.length > 0

  const reviewQueueEnabled = capabilities.has("review-queue")
  const openReviewTask = reviewQueueEnabled ? await getOpenReviewTaskForDocument(workspaceId, documentId) : null

  const matchKind = document.template?.code === "bank_statement" && capabilities.has("bank-match") ? "bank" as const
    : document.template?.code === "supplier_statement" && capabilities.has("statement-packs") ? "supplier_statement" as const
    : null
  const bankMatches = matchKind ? await listBankMatches(workspaceId, documentId) : []
  // WP-AP1: DocumentMatch rows involving this document (as source OR target). Read-only for now;
  // resolveDocumentMatches runs during extraction (models/document-matches.ts).
  const documentMatches = await listDocumentMatchesForDocument(workspaceId, documentId)

  // #228 / #250: an invoice's Purchase Order link — View PO row, Purchase Orders chip, Match
  // manually — and a PO's consumption (Ordered / Invoiced / Remaining, Matched invoices).
  const docType = resolveDocType(document)
  let po: LineItemsPoProps | null = null
  let poConsumption: PoConsumption | null = null
  if (docType === "invoice") {
    const summary = (await summarizeInvoicePoLinks(workspaceId, [documentId])).get(documentId) ?? null
    const poDocument = summary?.link ? await prisma.document.findFirst({ where: { id: summary.link.poDocumentId, workspaceId }, select: { reviewedData: true, rawExtraction: true } }) : null
    const poData = (poDocument?.reviewedData ?? poDocument?.rawExtraction ?? {}) as Record<string, unknown>
    const poLineOptions = Array.isArray(poData.line_items) ? (poData.line_items as unknown[]).map((raw, index) => {
      const row = (raw ?? {}) as Record<string, unknown>
      const description = typeof row.description === "string" && row.description.trim() ? row.description.trim() : `PO line ${index + 1}`
      return { index, label: `${index + 1} · ${description}` }
    }) : []
    po = { workspaceId, documentId, summary, currency: typeof data.currency_code === "string" ? data.currency_code.toUpperCase() : typeof data.currency === "string" ? data.currency.toUpperCase() : null, poLineOptions }
  } else if (docType === "purchase_order") {
    poConsumption = (await summarizePoConsumption(workspaceId, [documentId])).get(documentId) ?? null
  }

  // A content-search result (Files browser, AP-aging chart, pipeline list) links here with an
  // ad-hoc page/bbox — a hit that matched full-text search rather than a named field, so there is
  // no provenance.fields entry to key off. Seeds the viewer's initial highlight the same way a
  // field click would. `bb` is validated the same defensive way the old sheet route's
  // parseSourceParams did: exactly four floats in 0-1 space, since that is the space every field
  // Ref's bbox is normalized into (lib/provenance.ts) — a chunk-level bbox from
  // searchDocumentsByContent (lib/retrieval.ts) is NOT normalized the same way and would otherwise
  // render as a wildly-mispositioned highlight, so an out-of-range value falls back to null
  // (whole-page outline) rather than trusting it.
  const pageNumber = pageParam ? Number(pageParam) : NaN
  const bboxParts = bbParam ? bbParam.split(",").map(Number) : null
  const bbox = bboxParts && bboxParts.length === 4 && bboxParts.every((n) => Number.isFinite(n) && n >= 0 && n <= 1) ? (bboxParts as [number, number, number, number]) : null
  const initialTarget = Number.isFinite(pageNumber) ? { page: pageNumber, bbox, quote: "" } : null

  // Full mode's way back is the OriginStrip above the frame (#268 spec §2.4): the origin surface
  // when the link carried a valid `from` (#244), else this document's own queue with the row
  // selected. `queueHref` (the list without the row) only serves *Delete*'s landing.
  const typedDestinationHref = documentDestinationPath(`/workspaces/${workspaceId}`, document)
  const queueHref = typedDestinationHref.slice(0, typedDestinationHref.lastIndexOf("/"))
  const origin: Origin = (await describeOrigin(workspaceId, readOrigin(query, workspaceId)))
    ?? { href: typedDestinationHref, label: labelForDestinationPath(typedDestinationHref) }

  // Five-step lifecycle indicator. Derived server-side so the client SplitPane doesn't have to
  // pull in review-task / integration-push readers. `checks` uses readinessStatus (added by the
  // readiness engine); `approval` folds the open review task into the current step; `sync` reads
  // the succeeded pushes we already loaded above; `pay` reads confirmedPaymentStatus AND the
  // ledger's paymentStatuses map, so a "paid in ledger" bill lands on Pay-done even when nobody
  // clicked "confirm paid".
  const succeededPushCount = pushes.filter((p) => p.status === "succeeded").length
  const failedPushCount = pushes.filter((p) => p.status === "failed").length
  const ledgerPaid = (() => {
    const ps = paymentStatuses.get(documentId)?.paymentStatus?.toLowerCase()
    return ps === "paid" || ps === "reconciled"
  })()
  const confirmedPaid = document.paymentStatus === "paid"
  const readinessStatus = (document as unknown as { readinessStatus: string | null }).readinessStatus
  const readinessDetail = (document as unknown as { readinessDetail: unknown }).readinessDetail
  const readinessBlockers = Array.isArray(readinessDetail)
    ? readinessDetail.filter((b): b is { detail: string } => typeof b === "object" && b !== null && typeof (b as { detail?: unknown }).detail === "string").map((b) => b.detail)
    : []
  const extracted = document.status === "reviewed" || document.status === "needs_review" || document.status === "ready_for_review"
  // A bank statement's lifecycle ends at Sync — nobody "pays" a statement — so its indicator
  // is four steps, not five with a forever-upcoming Pay.
  const hasPayStep = codingData.documentType !== "bank_statement"
  const stageIndicator = ((): import("@/components/pipeline/document-detail/stage-indicator").StageStep[] => {
    if (!extracted) return [
      { key: "extracted", label: "Extracted", state: document.status === "failed" ? "blocked" : "current", detail: document.status === "failed" ? (document.errorCode ?? "extraction failed") : "in progress" },
      { key: "checks", label: "Checks", state: "upcoming" },
      { key: "approval", label: "Approval", state: "upcoming" },
      { key: "sync", label: "Sync", state: "upcoming" },
      ...(hasPayStep ? [{ key: "pay", label: "Pay", state: "upcoming" } as const] : []),
    ]
    // Checks
    const checksState: import("@/components/pipeline/document-detail/stage-indicator").StageStep["state"] =
      readinessStatus === "ready" ? "done"
      : readinessStatus === "blocked" ? "blocked"
      : "current"
    const checksDetail = readinessStatus === "blocked" && readinessBlockers[0] ? readinessBlockers[0] : readinessStatus === "ready" ? "All clear" : undefined
    // Approval
    // #258: the Approval node says the one word the row, the Status line and the Approval tab
    // say — `PROCESSING_STATE_LABELS` via the same `processingState()` — never its own phrasing.
    const approvalState: import("@/components/pipeline/document-detail/stage-indicator").StageStep["state"] =
      state === "cancelled" || state === "needs_attention" ? "blocked"
      : state === "approved" || state === "touchless" ? "done"
      : openReviewTask && openReviewTask.status !== "approved" ? "blocked"
      : document.status === "reviewed" ? "done"
      : "current"
    const approvalDetail = state ? PROCESSING_STATE_LABELS[state] : undefined
    // Sync
    const syncState: import("@/components/pipeline/document-detail/stage-indicator").StageStep["state"] =
      succeededPushCount > 0 ? "done"
      : failedPushCount > 0 ? "blocked"
      : approvalState === "done" ? "current"
      : "upcoming"
    const syncDetail = succeededPushCount > 0 ? `${LEDGER_FACT_LABELS.synced} × ${succeededPushCount}` : failedPushCount > 0 ? "Post failed" : undefined
    // Pay
    const payState: import("@/components/pipeline/document-detail/stage-indicator").StageStep["state"] =
      confirmedPaid || ledgerPaid ? "done"
      : syncState === "done" ? "current"
      : "upcoming"
    const payDetail = confirmedPaid ? LEDGER_FACT_LABELS.paid : ledgerPaid ? `${LEDGER_FACT_LABELS.paid} in ledger` : undefined
    return [
      { key: "extracted", label: "Extracted", state: "done" },
      { key: "checks", label: "Checks", state: checksState, detail: checksDetail },
      { key: "approval", label: "Approval", state: approvalState, detail: approvalDetail },
      { key: "sync", label: "Sync", state: syncState, detail: syncDetail },
      ...(hasPayStep ? [{ key: "pay" as const, label: "Pay", state: payState, detail: payDetail }] : []),
    ]
  })()

  const splitPane = <SplitPane
    workspaceId={workspaceId}
    source={{ documentId: document.id, filename: document.filename, mimeType: document.mimeType }}
    fields={fields}
    data={data}
    fieldConfidence={fieldConfidence}
    provenanceFields={provenance?.fields ?? {}}
    provenanceItems={provenance?.items ?? {}}
    initialTarget={initialTarget}
    conflictingLabels={conflictingLabels}
    missingRequiredFields={confidence?.missingRequiredFields ?? []}
    saveReview={saveReview}
    documentType={(codingData.documentType === "expense" || codingData.documentType === "sale" || codingData.documentType === "bank_statement") ? codingData.documentType : null}
    note={document.note ?? ""}
    auditEvents={auditEvents.map((event) => ({ ...event, createdAt: event.createdAt.toISOString() }))}
    header={{
      filename: document.filename, documentId: document.id, fileId: document.fileId, status: document.status,
      flagged: document.flaggedAt !== null,
      archived: document.archivedAt !== null,
      cancelled: document.cancelledAt !== null,
      cancelledReason: document.cancelledReason ?? null,
      // #236: /review is retired — the same open ReviewTask is now viewed from the Approvals
      // destination's Detail pane (its Approval tab reads "No approval started." gracefully for
      // a workflow-less task, since most ReviewTasks aren't Approvals at all — decision #1).
      reviewLink: reviewQueueEnabled && openReviewTask ? { href: `/workspaces/${workspaceId}/approvals/invoices/${documentId}`, label: openReviewTask.status === "in_review" ? "In review" : "Open — view review task" } : null,
    }}
    canPush={canPush}
    paymentStatus={paymentStatuses.get(documentId)?.paymentStatus ?? null}
    pushCard={null}
    fxBadge={<FxConversionBadge
      docCurrency={typeof data.currency_code === "string" ? data.currency_code.toUpperCase() : null}
      docTotal={typeof data.total === "number" ? data.total : (typeof data.total === "string" ? Number(data.total) : null)}
      baseCurrency={membership.workspace.baseCurrency}
      baseCurrencyTotal={document.baseCurrencyTotal !== null ? Number(document.baseCurrencyTotal) : null}
      fxRate={document.fxRate !== null ? Number(document.fxRate) : null}
      fxRateAt={document.fxRateAt ? document.fxRateAt.toISOString().slice(0, 10) : null}
      fxRateSource={document.fxRateSource}
    />}
    canCreateRule={canCreateRule}
    defaultSupplier={supplier}
    rationales={rationales}
    checks={checks}
    matchKind={matchKind}
    bankMatches={matchKind ? <MatchPanel
      workspaceId={workspaceId}
      statementDocumentId={documentId}
      kind={matchKind}
      matches={bankMatches.map((match) => ({
        id: match.id, transactionIndex: match.transactionIndex, kind: match.kind, confidence: match.confidence,
        dateDeltaDays: match.dateDeltaDays, status: match.status,
        statementLineId: match.statementLineId,
        // Phase 5: expose paymentStatus so the panel can render the Reconciled pill on an
        // accepted match without a second query.
        matchedDocument: { id: match.matchedDocument.id, filename: match.matchedDocument.filename, paymentStatus: match.matchedDocument.paymentStatus },
      }))}
    /> : null}
    documentMatches={poConsumption
      ? <PoConsumptionPanel workspaceId={workspaceId} consumption={poConsumption} origin={`/workspaces/${workspaceId}/purchase-orders/${documentId}`} />
      : documentMatches.length && docType !== "invoice" ? <DocumentMatchesPanel workspaceId={workspaceId} matches={documentMatches} /> : null}
    po={po}
    stageIndicator={stageIndicator}
    institutions={institutions}
    institutionId={document.institutionId}
    institutionName={institutionName}
    history={documentHistory}
    initialTab={initialTab}
    state={state ?? undefined}
    queueTitle={queueTitle}
  />
  if (embedded) return splitPane

  // #259 full mode = read + secondary actions: the same header and ⋯ as the pane (minus *Open in
  // a new tab*), no 1-of-N or ↑/↓, and no decision footer — Approve/Reject stays on the queue,
  // where #227 put it.
  const invoiceNumber = typeof data.invoice_number === "string" ? data.invoice_number.trim() : ""
  const name = supplier
    ? { title: supplier, suffix: invoiceNumber || document.filename }
    : { title: document.filename, suffix: invoiceNumber || null }
  // #258: the Status line in full mode is server-rendered with the actor already known — the
  // same `StatusLine` the pane shows, fed by the same `processingFact`.
  const ledger = succeededPushCount > 0 ? "synced" : confirmedPaid || ledgerPaid ? "paid" : null
  const status = processing && state
    ? <StatusLine state={state} fact={processingFact({ ...processing, now: new Date() })} ledger={ledger} openCheckCodes={processing.openCheckCodes} cancelledReason={processing.cancelledReason} />
    : undefined
  return <div className="flex h-screen min-h-0 flex-col">
    <OriginStrip origin={origin} />
    <PaneFrame mode="full" name={name} backHref={queueHref} status={status}>{splitPane}</PaneFrame>
  </div>
}

/** #268 spec §3.0: a hop that lands on a deleted or foreign id never shows the framework 404.
 * With a valid `from`, the origin page gets `gone=<id>` and renders "That document was deleted."
 * as its row notice; without one, `not-found.tsx` beside this page renders inside the shell. */
function goneOrNotFound(query: { from?: string }, workspaceId: string, documentId: string): never {
  const from = readOrigin(query, workspaceId)
  if (from) redirect(withParam(from, "gone", documentId))
  notFound()
}

export default async function LegacyDocumentPage({ params, searchParams }: {
  params: Promise<{ workspaceId: string; documentId: string }>
  searchParams: Promise<{ stage?: string; page?: string; bb?: string; from?: string }>
}) {
  const { workspaceId, documentId } = await params
  const query = await searchParams
  const document = await getWorkspaceDocument(workspaceId, documentId)
  if (!document) goneOrNotFound(query, workspaceId, documentId)

  const redirectQuery = new URLSearchParams()
  // #268 H-d: `from` rides along so the typed queue renders the Origin link for a search hop.
  for (const key of ["stage", "page", "bb", "from"] as const) {
    if (query[key]) redirectQuery.set(key, query[key]!)
  }
  const suffix = redirectQuery.toString() ? `?${redirectQuery.toString()}` : ""
  redirect(`${documentDestinationPath(`/workspaces/${workspaceId}`, document)}${suffix}`)
}
