import { getCurrentUser } from "@/lib/auth"
import { getAutomationMetrics } from "@/lib/analytics/workspace-analytics"
import { getWorkspaceCapabilities, requireModule } from "@/lib/modules/capabilities"
import { PIPELINE_STAGES } from "@/lib/documents/stages"
import { deriveAutonomyLevel, getOrCreateAutomationConfig } from "@/models/automation-config"
import { countDocumentsByStage } from "@/models/documents"
import { countOpenReviewTasks } from "@/models/review-tasks"
import { requireWorkspaceRole } from "@/models/workspaces"
import { AutomationFrame, Empty, Figure, Funnel, Ledger, LedgerRow, Panel } from "@/components/automation/automation-ui"
import { ControlsSpine } from "@/components/automation/controls-spine"
import Link from "next/link"

export const dynamic = "force-dynamic"

export default async function AutomationDashboardPage({ params }: {
  params: Promise<{ workspaceId: string }>
}) {
  const { workspaceId } = await params
  const user = await getCurrentUser()
  const membership = await requireWorkspaceRole(workspaceId, user.id)
  await requireModule(workspaceId, "touchless-automation")

  const capabilities = await getWorkspaceCapabilities(workspaceId)
  const reviewEnabled = capabilities.has("review-queue")
  const [metrics, reviewCount, stageCounts, config] = await Promise.all([
    getAutomationMetrics(workspaceId, 30),
    reviewEnabled ? countOpenReviewTasks(workspaceId) : 0,
    countDocumentsByStage(workspaceId),
    getOrCreateAutomationConfig(workspaceId),
  ])
  // The pipeline's own visibleStages rule, mirrored exactly (pipeline/page.tsx) — the spine and
  // the Documents tabs must never disagree about whether Synced/Paid exist for this workspace.
  const showLedgerStages = capabilities.has("accounting-push") || stageCounts.synced > 0 || stageCounts.paid > 0
  const visibleStages = showLedgerStages ? PIPELINE_STAGES : PIPELINE_STAGES.filter((s) => s !== "synced" && s !== "paid")
  const touchlessPercent = Math.round(metrics.touchless.touchlessRate * 100)
  const matchPercent = Math.round(metrics.matchCoverage.matchRate * 100)
  const extracted = metrics.touchless.totalExtracted
  const share = (n: number) => (extracted > 0 ? n / extracted : 0)

  return <AutomationFrame
    workspaceId={workspaceId}
    active="metrics"
    reviewCount={reviewCount}
    reviewEnabled={reviewEnabled}
    showSettings={membership.role === "owner"}
    status="Controls are the rules that decide which documents move through the pipeline on their own and which wait for a person. This tab maps where each rule acts, then shows how the last 30 days actually ran."
  >
    <Panel
      title="The pipeline and its levers"
      note="Documents move left to right, the same five stages as the Documents tab. Each arrow names the rule that decides whether a document passes that handoff by itself. Click a rule to adjust it; click a stage to see the documents sitting there."
    >
      <ControlsSpine
        workspaceId={workspaceId}
        counts={stageCounts}
        visibleStages={visibleStages}
        level={deriveAutonomyLevel(config)}
        minConfidence={config.minConfidence}
        canOpenSettings={membership.role === "owner"}
      />
      <p className="mt-3 text-xs text-slate-500">
        <Link href={`/workspaces/${workspaceId}/automation/matches`} className="font-medium text-emerald-700 underline-offset-2 hover:text-emerald-800 hover:underline">Matching</Link>
        {" "}— purchase-order, receipt and bank ties — runs alongside every step, feeding the checks that hold a document back.
      </p>
    </Panel>

    {extracted === 0
      ? <Empty title="Nothing extracted yet">
          These figures start moving as soon as documents reach the pipeline. Upload or email one in,
          and the first pass through coding will show up here.
        </Empty>
      : <>
        <Panel
          title="The last 30 days"
          note="How well the rules above are working: of everything extracted, how much moved through without a person touching it."
        >
          <section className="grid gap-8 md:grid-cols-[minmax(0,300px)_minmax(0,1fr)] md:items-center">
            <Figure
              value={`${touchlessPercent}%`}
              caption={<>
                {metrics.touchless.totalPushedTouchless} of {extracted} documents published themselves.
                The rest needed a person somewhere along the way.
              </>}
            />
            <Funnel
              total={extracted}
              stages={[
                { label: "Extracted", value: extracted },
                { label: "Passed every check", value: metrics.touchless.totalReady },
                { label: "Synced untouched", value: metrics.touchless.totalPushedTouchless },
              ]}
            />
          </section>
        </Panel>

        <div className="grid gap-x-10 gap-y-10 md:grid-cols-2 lg:grid-cols-3">
          <Panel title="Where documents are sitting" note="Every extracted document lands in exactly one of these three states.">
            <Ledger>
              <LedgerRow label="Approved — ready to sync" value={metrics.readiness.ready} share={share(metrics.readiness.ready)} state="auto" href={`/workspaces/${workspaceId}/pipeline?stage=approved`} />
              <LedgerRow label="Blocked in Review" value={metrics.readiness.blocked} share={share(metrics.readiness.blocked)} state="blocked" href={`/workspaces/${workspaceId}/pipeline?stage=review`} />
              <LedgerRow label="In Inbox — not yet evaluated" value={metrics.readiness.pending} share={share(metrics.readiness.pending)} state="idle" href={`/workspaces/${workspaceId}/pipeline?stage=inbox`} />
            </Ledger>
          </Panel>

          <Panel title="Policy decisions" note="What the policy check concluded on the documents it was asked about.">
            <Ledger>
              <LedgerRow label="Approved" value={metrics.policyVerdicts.pass} state="auto" />
              <LedgerRow label="Rejected" value={metrics.policyVerdicts.violation} state="blocked" />
              <LedgerRow
                label="Could not be evaluated"
                value={metrics.policyVerdicts.error}
                state={metrics.policyVerdicts.error > 0 ? "waiting" : "idle"}
                note={metrics.policyVerdicts.error > 0 ? "These go to a reviewer rather than publishing." : undefined}
              />
            </Ledger>
          </Panel>

          <Panel title="Matching" note="Documents the pipeline could tie to a purchase order, receipt or bank line.">
            <Ledger>
              <LedgerRow
                label="Matched to another document"
                value={`${matchPercent}%`}
                note={`${metrics.matchCoverage.matchedDocuments} of ${metrics.matchCoverage.totalDocuments} documents`}
                share={metrics.matchCoverage.matchRate}
                state="auto"
              />
              <LedgerRow
                label="Not matched to anything"
                value={metrics.matchCoverage.totalDocuments - metrics.matchCoverage.matchedDocuments}
                state="idle"
              />
            </Ledger>
          </Panel>
        </div>

      </>}
  </AutomationFrame>
}
