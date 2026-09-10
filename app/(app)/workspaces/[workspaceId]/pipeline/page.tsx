import { PipelineShell } from "@/components/pipeline/pipeline-shell"
import type { PipelineDocumentRow } from "@/components/pipeline/document-list"
import type { SheetTemplate } from "@/components/extract/types"
import { getCurrentUser } from "@/lib/auth"
import config from "@/lib/config"
import { parseTemplateFields } from "@/lib/document-templates"
import { PIPELINE_STAGES, parseStageAlias, type PipelineStage } from "@/lib/documents/stages"
import { searchDocumentsByContent } from "@/lib/retrieval"
import { activeJobDocumentIds, countDocumentsByStage, documentIdsInStage, flaggedFieldsFromConfidence, listWorkspaceDocuments, summarizeDocumentForReview } from "@/models/documents"
import { listWorkspaceBills } from "@/models/bills"
import { ensurePipelineFile, getFileTemplates } from "@/models/files"
import { getListPreference } from "@/models/list-preferences"
import { getTouchlessRateStats } from "@/lib/analytics/workspace-analytics"
import { getWorkspaceUsage, requireWorkspaceRole } from "@/models/workspaces"

export const dynamic = "force-dynamic"

function parseStage(raw: string | undefined, counts?: Record<PipelineStage, number>): PipelineStage {
  const aliased = parseStageAlias(raw)
  if (aliased) return aliased
  // Land the reader on the first non-empty stage so a fresh workspace doesn't open on a blank
  // Inbox when a document is already on Review. Order matches how the work moves: Review first
  // (needs someone), then Inbox, then Approved, Synced, Paid.
  if (counts) {
    for (const stage of ["review", "inbox", "approved", "synced", "paid"] as const) {
      if (counts[stage] > 0) return stage
    }
  }
  return "inbox"
}

/** The workspace-wide document pipeline: Inbox → To review → Ready → Approvals → Archive.
 * Replaces folder-scoped navigation (Workspace → Folder → File) as the primary upload→review
 * surface — folder stays available as a filter/column, never as navigation, on the Files browser. */
export default async function PipelinePage({ params, searchParams }: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<{ stage?: string; q?: string; flagged?: string }>
}) {
  const { workspaceId } = await params
  const { stage: stageParam, q, flagged } = await searchParams
  const user = await getCurrentUser()
  const membership = await requireWorkspaceRole(workspaceId, user.id)

  const query = q?.trim() || ""
  const flaggedOnly = flagged === "1"
  const documentSearchEnabled = config.embeddings.enabled

  // Counts feed both the tab badges and the default-stage fallback, so they have to land before
  // the stage is resolved.
  const counts = await countDocumentsByStage(workspaceId)
  const stage = parseStage(stageParam, stageParam ? undefined : counts)

  // The upload button's target: one app-managed container per workspace (kind: "pipeline"), so
  // uploading from here never forces a spreadsheet/file choice — see models/files.ts.
  const [pipelineFile, usage, documents, preference] = await Promise.all([
    ensurePipelineFile(workspaceId, user.id),
    getWorkspaceUsage(workspaceId),
    listWorkspaceDocuments(workspaceId, { stage, query: query || undefined }),
    getListPreference(user.id, workspaceId, `pipeline:${stage}`),
  ])
  const [pipelineTemplates, touchlessStats, billsSummary] = await Promise.all([
    getFileTemplates(workspaceId, pipelineFile.id),
    stage === "approved" ? getTouchlessRateStats(workspaceId) : Promise.resolve(null),
    (stage === "synced" || stage === "paid") ? listWorkspaceBills({ workspaceId, limit: 1 }).then((res) => res.summary).catch(() => null) : Promise.resolve(null),
  ])

  // Content search runs alongside the ordinary filename/OCR-text match, not instead of it — the
  // same "advanced" hybrid (vector + lexical, RRF-fused) search the Files browser uses, scoped
  // down to whichever stage is being viewed so a hit from an archived document doesn't show up on
  // Inbox. Deduped against the rows already matched by name so a document is never listed twice.
  const rawContentMatches = documentSearchEnabled && query
    ? await searchDocumentsByContent(workspaceId, query, { limit: 20, actorId: user.id })
    : []
  const matchedIds = documentSearchEnabled && query
    ? await documentIdsInStage(workspaceId, rawContentMatches.map((match) => match.documentId), stage)
    : new Set<string>()
  const rowIds = new Set(documents.map((doc) => doc.id))
  const contentMatches = rawContentMatches
    .filter((match) => matchedIds.has(match.documentId) && !rowIds.has(match.documentId))
    .map((match) => ({ documentId: match.documentId, filename: match.filename, page: match.page, bbox: match.bbox, snippet: match.snippet }))

  const filtered = flaggedOnly ? documents.filter((doc) => doc.flaggedAt !== null) : documents
  const activeJobs = stage === "inbox" ? await activeJobDocumentIds(workspaceId, filtered.map((doc) => doc.id)) : new Set<string>()

  const rows: PipelineDocumentRow[] = filtered.map((doc) => ({
    id: doc.id,
    fileId: doc.fileId,
    filename: doc.filename,
    status: doc.status,
    receivedAt: doc.receivedAt.toISOString(),
    templateName: doc.template?.name ?? null,
    flagged: doc.flaggedAt !== null,
    hasActiveJob: activeJobs.has(doc.id),
    missingRequiredFields: flaggedFieldsFromConfidence(doc.confidence),
    lowConfidenceFieldCount: flaggedFieldsFromConfidence(doc.confidence).length,
    readinessStatus: (doc as Record<string, unknown>).readinessStatus as string | null ?? null,
    readinessBlockers: parseReadinessBlockers((doc as Record<string, unknown>).readinessDetail),
    // Every stage but Inbox shows this — a document still in Inbox hasn't been extracted yet, so
    // there's nothing to summarize. Computed for every row is cheap (pure JSON reads) and keeps
    // this map a single pass rather than a second one keyed by stage.
    review: stage === "inbox" ? null : summarizeDocumentForReview(doc, membership.workspace.baseCurrency),
  }))

  // preference is read for a future column-picker refinement; the fixed column set ships first.
  void preference

  // Every worksheet the pipeline container has (ensurePipelineFile tops it up with the full
  // finance set) becomes a "Document type" choice in the upload popup — so an expense receipt, a
  // sales invoice, and a bank statement are filed under their own template/documentType rather
  // than all silently landing as whichever template happened to be first. That template/
  // documentType is exactly what an accounting export keys off (lib/integration-bill-mapping.ts),
  // so choosing it here is what makes the distinction "known in the database".
  const uploadTemplates: SheetTemplate[] = pipelineTemplates.flatMap((candidate) => {
    const version = candidate.versions[0]
    if (!version) return []
    return [{ id: candidate.id, code: candidate.code, name: candidate.name, multiRow: candidate.multiRow, documentCount: rows.length, fields: parseTemplateFields(version.fields), prompt: version.prompt || "" }]
  })

  return <PipelineShell
    workspaceId={workspaceId}
    stage={stage}
    counts={counts}
    rows={rows}
    contentMatches={contentMatches}
    query={query}
    flaggedOnly={flaggedOnly}
    documentSearchEnabled={documentSearchEnabled}
    upload={{ fileId: pipelineFile.id, templates: uploadTemplates, usage, sheetCount: pipelineTemplates.length }}
    touchlessStats={touchlessStats}
    billsSummary={billsSummary}
    baseCurrency={membership.workspace.baseCurrency ?? "USD"}
  />
}

function parseReadinessBlockers(detail: unknown): string[] {
  if (!Array.isArray(detail)) return []
  return detail
    .filter((b): b is { detail: string } => typeof b === "object" && b !== null && typeof b.detail === "string")
    .map((b) => b.detail)
}
