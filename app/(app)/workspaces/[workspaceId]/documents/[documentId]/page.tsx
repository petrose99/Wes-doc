import { saveDocumentReviewAction } from "@/app/(app)/workspaces/[workspaceId]/actions"
import { SplitPane } from "@/components/pipeline/document-detail/split-pane"
import { FxConversionBadge } from "@/components/documents/fx-conversion-badge"
import { MatchPanel } from "@/components/bank-match/match-panel"
import { DocumentMatchesPanel } from "@/components/matching/document-matches-panel"
import { listDocumentMatchesForDocument } from "@/models/document-matches-query"
import { getCurrentUser } from "@/lib/auth"
import { parseTemplateFields } from "@/lib/document-templates"
import type { BlocksSidecar, DocumentProvenance } from "@/lib/provenance"
import { repairMissingBboxes } from "@/lib/provenance"
import { prisma } from "@/lib/db"
import { buildFieldRationales, type FieldRationale } from "@/lib/rationale"
import { documentBlocksKey, readDocumentBlocks } from "@/lib/document-storage"
import { parseStageAlias, type PipelineStage } from "@/lib/documents/stages"
import { getWorkspaceCapabilities } from "@/lib/modules/capabilities"
import { listBankMatches } from "@/models/bank-matches"
import { listDocumentAuditEvents } from "@/models/audit-events"
import { getWorkspaceDocument, listWorkspaceDocuments } from "@/models/documents"
import { getFewShotExamples } from "@/models/field-corrections"
import { getOpenReviewTaskForDocument } from "@/models/review-tasks"
import { listWorkspaceIntegrationConnections, listWorkspaceIntegrationPushes } from "@/models/integrations"
import { getDocumentPaymentStatuses } from "@/models/ledger-payments"
import { requireWorkspaceRole } from "@/models/workspaces"
import { notFound } from "next/navigation"

/** The pipeline's split-pane document detail: source viewer on the left, tabbed
 * Details/Note/History on the right, provenance-aware field-click highlighting, and prev/next
 * navigation through whatever filtered stage list the reader arrived from (?stage=).
 *
 * Deliberately NOT under the (chrome) route group — that layout's `max-w-4xl` reading-column cap
 * is right for settings pages but leaves no room for a source viewer next to the form. Same URL
 * as before ((chrome) is a route group, so this move doesn't change the path), just outside that
 * layout, so it gets the workspace shell's full-bleed width instead. */
export default async function DocumentPage({ params, searchParams }: {
  params: Promise<{ workspaceId: string; documentId: string }>
  searchParams: Promise<{ stage?: string; page?: string; bb?: string }>
}) {
  const { workspaceId, documentId } = await params
  const { stage: stageParam, page: pageParam, bb: bbParam } = await searchParams
  const user = await getCurrentUser()
  const membership = await requireWorkspaceRole(workspaceId, user.id)
  const document = await getWorkspaceDocument(workspaceId, documentId)
  if (!document) notFound()

  const stage: PipelineStage | null = parseStageAlias(stageParam)

  const capabilities = await getWorkspaceCapabilities(workspaceId)
  const canPush = document.status === "reviewed" && capabilities.has("accounting-push")
    && capabilities.pushableTemplateCodes.includes(document.template?.code ?? "")
  const [connections, pushes, auditEvents, neighbors, paymentStatuses] = await Promise.all([
    canPush ? listWorkspaceIntegrationConnections(workspaceId) : Promise.resolve([]),
    canPush ? listWorkspaceIntegrationPushes(workspaceId, documentId) : Promise.resolve([]),
    listDocumentAuditEvents(workspaceId, documentId),
    stage ? listWorkspaceDocuments(workspaceId, { stage }) : Promise.resolve([]),
    canPush ? getDocumentPaymentStatuses(workspaceId, [documentId]) : Promise.resolve(new Map()),
  ])

  const fields = parseTemplateFields(document.fieldSnapshot)
  const confidence = document.confidence as { missingRequiredFields?: string[]; fieldConfidence?: Record<string, number>; conflictingFields?: string[] } | null
  const fieldConfidence = confidence?.fieldConfidence || {}
  const conflictingLabels = (confidence?.conflictingFields || []).map((key) => fields.find((field) => field.key === key)?.label || key)
  const data = (document.reviewedData || document.rawExtraction || {}) as Record<string, unknown>
  const rawProvenance = document.provenance as DocumentProvenance | null
  const blocksJson = rawProvenance ? await readDocumentBlocks(documentBlocksKey(workspaceId, documentId)) : null
  const sidecar: BlocksSidecar | null = blocksJson ? (() => { try { return JSON.parse(blocksJson) as BlocksSidecar } catch { return null } })() : null
  const provenance = rawProvenance && sidecar ? repairMissingBboxes(rawProvenance, sidecar, data) : rawProvenance
  const codingData = (document.codingData as Record<string, unknown> | null) ?? {}

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

  const saveReview = async (formData: FormData) => { "use server"; await saveDocumentReviewAction(workspaceId, documentId, formData) }
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

  const neighborIndex = neighbors.findIndex((doc) => doc.id === documentId)
  const stageQuery = stage ? `?stage=${stage}` : ""
  const prevHref = stage && neighborIndex > 0 ? `/workspaces/${workspaceId}/documents/${neighbors[neighborIndex - 1].id}${stageQuery}` : null
  const nextHref = stage && neighborIndex >= 0 && neighborIndex < neighbors.length - 1 ? `/workspaces/${workspaceId}/documents/${neighbors[neighborIndex + 1].id}${stageQuery}` : null
  // Where a stage-changing action (Archive / Move to Ready) sends the reader next: the following
  // document in the same filtered queue if there is one, otherwise back to the list — mirroring
  // the "advance to the next item" behavior of a review queue, rather than stranding them on a
  // document that no longer belongs on the tab they were just working through.
  const afterActionHref = nextHref ?? (stage ? `/workspaces/${workspaceId}/pipeline?stage=${stage}` : `/workspaces/${workspaceId}/pipeline`)
  const position = stage && neighborIndex >= 0 ? { index: neighborIndex + 1, total: neighbors.length } : null

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
    const checksDetail = readinessStatus === "blocked" && readinessBlockers[0] ? readinessBlockers[0] : readinessStatus === "ready" ? "all clear" : undefined
    // Approval
    const approvalState: import("@/components/pipeline/document-detail/stage-indicator").StageStep["state"] =
      openReviewTask && openReviewTask.status !== "approved" ? "blocked"
      : document.status === "reviewed" ? "done"
      : "current"
    const approvalDetail = openReviewTask ? (openReviewTask.status === "in_review" ? "in review" : "awaiting approval") : (document.status === "reviewed" ? "signed off" : undefined)
    // Sync
    const syncState: import("@/components/pipeline/document-detail/stage-indicator").StageStep["state"] =
      succeededPushCount > 0 ? "done"
      : failedPushCount > 0 ? "blocked"
      : approvalState === "done" ? "current"
      : "upcoming"
    const syncDetail = succeededPushCount > 0 ? `pushed × ${succeededPushCount}` : failedPushCount > 0 ? "push failed" : undefined
    // Pay
    const payState: import("@/components/pipeline/document-detail/stage-indicator").StageStep["state"] =
      confirmedPaid || ledgerPaid ? "done"
      : syncState === "done" ? "current"
      : "upcoming"
    const payDetail = confirmedPaid ? "confirmed paid" : ledgerPaid ? "paid in ledger" : undefined
    return [
      { key: "extracted", label: "Extracted", state: "done" },
      { key: "checks", label: "Checks", state: checksState, detail: checksDetail },
      { key: "approval", label: "Approval", state: approvalState, detail: approvalDetail },
      { key: "sync", label: "Sync", state: syncState, detail: syncDetail },
      ...(hasPayStep ? [{ key: "pay" as const, label: "Pay", state: payState, detail: payDetail }] : []),
    ]
  })()

  return <SplitPane
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
    prevHref={prevHref}
    nextHref={nextHref}
    position={position}
    stage={stage}
    afterActionHref={afterActionHref}
    header={{
      filename: document.filename, documentId: document.id, fileId: document.fileId, status: document.status,
      flagged: document.flaggedAt !== null,
      reviewLink: reviewQueueEnabled && openReviewTask ? { href: `/workspaces/${workspaceId}/review/${openReviewTask.id}`, label: openReviewTask.status === "in_review" ? "In review" : "Open — view review task" } : null,
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
    documentMatches={documentMatches.length ? <DocumentMatchesPanel workspaceId={workspaceId} matches={documentMatches} /> : null}
    stageIndicator={stageIndicator}
  />
}
