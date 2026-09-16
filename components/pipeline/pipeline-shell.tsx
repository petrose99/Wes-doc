import { ArrivalPoller } from "@/components/pipeline/arrival-poller"
import { DocumentList, type ContentMatchRow, type PipelineDocumentRow } from "@/components/pipeline/document-list"
import { FilterPanel } from "@/components/pipeline/filter-panel"
import { StageTabs } from "@/components/pipeline/stage-tabs"
import { FileHubUploadButton } from "@/components/files/file-hub-upload-button"
import type { SheetTemplate, WorkspaceUsage } from "@/components/extract/types"
import type { PipelineStage } from "@/lib/documents/stages"
import { ReadyBanner } from "@/components/pipeline/ready-banner"
import { SyncedStageHeader } from "@/components/pipeline/synced-stage-header"
import { PaidStageHeader } from "@/components/pipeline/paid-stage-header"
import Link from "next/link"
import type { BillsSummary, PaidSummary } from "@/models/bills"
import type { TouchlessRateStats } from "@/lib/analytics/workspace-analytics"
import { ListScreenShell } from "@/components/list-screen/list-screen-shell"

/** The one list shell every pipeline tab renders through — a header with the workspace-wide
 * upload entry point, tabs, a filter bar, then the table. A server component: the data (rows,
 * counts) is fetched by the page and handed down; only the list body, its bulk actions, and the
 * upload overlay need client interactivity. */
export function PipelineShell({ workspaceId, stage, counts, rows, contentMatches, query, flaggedOnly, documentSearchEnabled, upload, touchlessStats, billsSummary, paidSummary, baseCurrency, failedCount = 0, visibleStages, backToInvoices = false }: {
  workspaceId: string
  stage: PipelineStage
  counts: Record<PipelineStage, number>
  /** Failed extractions workspace-wide — red sub-badge on the Inbox tab (see StageTabs). */
  failedCount?: number
  /** Stages worth showing for this workspace — Synced/Paid are dropped when they can never fill
   * (no accounting integration and nothing ever synced). */
  visibleStages?: readonly PipelineStage[]
  /** #264: arrived from the Invoices first-use state (`?from=invoices`) — render the way back under the h1. */
  backToInvoices?: boolean
  rows: PipelineDocumentRow[]
  contentMatches: ContentMatchRow[]
  query: string
  flaggedOnly: boolean
  documentSearchEnabled: boolean
  upload: { fileId: string; templates: SheetTemplate[]; usage: WorkspaceUsage; sheetCount: number }
  touchlessStats?: TouchlessRateStats | null
  /** Populated only on the Synced tab — the aging strip answers "what's still owed", which is
   * meaningless once a bill has settled. */
  billsSummary?: BillsSummary | null
  /** Populated only on the Paid tab — see PaidStageHeader for why it isn't the aging strip. */
  paidSummary?: PaidSummary | null
  baseCurrency: string
}) {
  return <ListScreenShell
    /* Documents can arrive without anyone touching this page — see ArrivalPoller. */
    before={<ArrivalPoller />}
    header={<div className="flex flex-wrap items-center gap-3 border-b px-6 py-4">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-slate-900">Documents</h1>
        </div>
        <p className="text-sm text-slate-500">Inbox to paid — one list across every file, one lifecycle for every bill.</p>
        {backToInvoices && <Link href={`/workspaces/${workspaceId}/invoices`} className="inline-flex h-9 items-center text-sm font-medium text-emerald-700 underline-offset-2 hover:underline">← Back to Invoices</Link>}
      </div>
      <div className="ml-auto">
        <FileHubUploadButton
          workspaceId={workspaceId}
          fileId={upload.fileId}
          fileName="Pipeline"
          template={upload.templates[0] ?? null}
          templates={upload.templates}
          usage={upload.usage}
          sheetCount={upload.sheetCount}
          documentSearchEnabled={documentSearchEnabled}
          primary />
      </div>
    </div>}
    navigation={<StageTabs workspaceId={workspaceId} active={stage} counts={counts} failedCount={failedCount} visibleStages={visibleStages} />}
    /* WCAG 4.1.3: announce the active stage's count to screen readers on navigation/refresh —
       the visual tab badges carry this for sighted users, but nothing was announced before. */
    status={<p aria-live="polite" role="status" className="sr-only">
      {`${counts[stage]} document${counts[stage] === 1 ? "" : "s"} on the ${stage} stage`}
    </p>}
    beforeToolbar={<>
      {stage === "approved" && touchlessStats && touchlessStats.totalExtracted > 0 && <div className="flex items-center gap-6 border-b bg-slate-50 px-6 py-2 text-xs text-slate-600">
        <span><strong className="text-slate-900">{(touchlessStats.touchlessRate * 100).toFixed(0)}%</strong> touchless rate (30d)</span>
        <span><strong className="text-slate-900">{touchlessStats.totalReady}</strong> approved (30d)</span>
        <span><strong className="text-slate-900">{touchlessStats.totalPushedTouchless}</strong> synced untouched</span>
        <span><strong className="text-slate-900">{touchlessStats.totalExtracted}</strong> extracted</span>
      </div>}
      {stage === "approved" && counts.approved > 0 && <ReadyBanner workspaceId={workspaceId} count={counts.approved} documentIds={rows.map((r) => r.id)} />}
      {stage === "synced" && billsSummary && <SyncedStageHeader workspaceId={workspaceId} summary={billsSummary} currency={baseCurrency} />}
      {stage === "paid" && paidSummary && <PaidStageHeader workspaceId={workspaceId} summary={paidSummary} currency={baseCurrency} />}
    </>}
    toolbar={<FilterPanel query={query} documentSearchEnabled={documentSearchEnabled} />}>
    <DocumentList workspaceId={workspaceId} stage={stage} rows={rows} contentMatches={contentMatches} query={query} />
  </ListScreenShell>
}
