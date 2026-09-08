import { ArrivalPoller } from "@/components/pipeline/arrival-poller"
import { DocumentList, type ContentMatchRow, type PipelineDocumentRow } from "@/components/pipeline/document-list"
import { FilterPanel } from "@/components/pipeline/filter-panel"
import { StageTabs } from "@/components/pipeline/stage-tabs"
import { FileHubUploadButton } from "@/components/files/file-hub-upload-button"
import type { SheetTemplate, WorkspaceUsage } from "@/components/extract/types"
import type { PipelineStage } from "@/lib/documents/stages"
import { ReadyBanner } from "@/components/pipeline/ready-banner"
import type { TouchlessRateStats } from "@/lib/analytics/workspace-analytics"

/** The one list shell every pipeline tab renders through — a header with the workspace-wide
 * upload entry point, tabs, a filter bar, then the table. A server component: the data (rows,
 * counts) is fetched by the page and handed down; only the list body, its bulk actions, and the
 * upload overlay need client interactivity. */
export function PipelineShell({ workspaceId, stage, counts, rows, contentMatches, query, flaggedOnly, documentSearchEnabled, upload, touchlessStats }: {
  workspaceId: string
  stage: PipelineStage
  counts: Record<PipelineStage, number>
  rows: PipelineDocumentRow[]
  contentMatches: ContentMatchRow[]
  query: string
  flaggedOnly: boolean
  documentSearchEnabled: boolean
  upload: { fileId: string; templates: SheetTemplate[]; usage: WorkspaceUsage; sheetCount: number }
  touchlessStats?: TouchlessRateStats | null
}) {
  return <div className="flex min-h-0 flex-1 flex-col">
    {/* Documents can arrive without anyone touching this page — see ArrivalPoller. */}
    <ArrivalPoller />
    <div className="flex flex-wrap items-center gap-3 border-b px-6 py-4">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-slate-900">Extraction</h1>
        </div>
        <p className="text-sm text-slate-500">Add, review, and extract documents — one list across every file.</p>
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
    </div>
    <StageTabs workspaceId={workspaceId} active={stage} counts={counts} />
    {stage === "ready" && touchlessStats && touchlessStats.totalExtracted > 0 && <div className="flex items-center gap-6 border-b bg-slate-50 px-6 py-2 text-xs text-slate-600">
      <span><strong className="text-slate-900">{(touchlessStats.touchlessRate * 100).toFixed(0)}%</strong> touchless rate (30d)</span>
      <span><strong className="text-slate-900">{touchlessStats.totalReady}</strong> ready</span>
      <span><strong className="text-slate-900">{touchlessStats.totalPushedTouchless}</strong> auto-pushed</span>
      <span><strong className="text-slate-900">{touchlessStats.totalExtracted}</strong> extracted</span>
    </div>}
    {stage === "ready" && counts.ready > 0 && <ReadyBanner workspaceId={workspaceId} count={counts.ready} documentIds={rows.map((r) => r.id)} />}
    <FilterPanel query={query} documentSearchEnabled={documentSearchEnabled} />
    <DocumentList workspaceId={workspaceId} stage={stage} rows={rows} contentMatches={contentMatches} query={query} />
  </div>
}
