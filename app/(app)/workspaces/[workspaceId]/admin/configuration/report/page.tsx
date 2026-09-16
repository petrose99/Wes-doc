import { AdminPage, ModuleOff } from "@/components/admin/admin-ui"
import { getAutomationMetrics } from "@/lib/analytics/workspace-analytics"
import { getAdminContext } from "@/lib/admin/context"
import { adminPaths } from "@/lib/admin/paths"
import { PIPELINE_STAGES } from "@/lib/documents/stages"
import { deriveAutonomyLevel, getOrCreateAutomationConfig } from "@/models/automation-config"
import { countDocumentsByStage } from "@/models/documents"
import { Figure, Funnel, Ledger, LedgerRow, Panel } from "@/components/automation/automation-ui"
import { ControlsSpine } from "@/components/automation/controls-spine"
import Link from "next/link"

export const dynamic = "force-dynamic"

/** #252: what was Controls › Overview — the pipeline spine with its levers and the last 30
 * days of untouched flow — kept reachable as Configuration › Report. Not in #231's Admin IA and
 * reporting is out of scope on the map, so retiring it is the owner's signature (#256), not this
 * ticket's call. */
export default async function AutomationReportPage({ params }: {
  params: Promise<{ workspaceId: string }>
}) {
  const { workspaceId } = await params
  const context = await getAdminContext(workspaceId)
  const { capabilities, membership } = context
  if (!capabilities.has("touchless-automation")) {
    return <AdminPage title="Report"><ModuleOff what="Touchless automation" href={adminPaths(workspaceId).whatsOn} /></AdminPage>
  }
  const [metrics, stageCounts, config] = await Promise.all([
    getAutomationMetrics(workspaceId, 30),
    countDocumentsByStage(workspaceId),
    getOrCreateAutomationConfig(workspaceId),
  ])
  // Mirrors pipeline/page.tsx's visibleStages rule so the two surfaces never disagree about
  // whether Synced/Paid exist for this workspace.
  const showLedgerStages = capabilities.has("accounting-push") || stageCounts.synced > 0 || stageCounts.paid > 0
  const visibleStages = showLedgerStages ? PIPELINE_STAGES : PIPELINE_STAGES.filter((s) => s !== "synced" && s !== "paid")

  const touchlessPercent = Math.round(metrics.touchless.touchlessRate * 100)
  const matchPercent = Math.round(metrics.matchCoverage.matchRate * 100)
  const extracted = metrics.touchless.totalExtracted
  const share = (n: number) => (extracted > 0 ? n / extracted : 0)
  const autonomyLevel = deriveAutonomyLevel(config)

  // Named diagnosis for "why isn't anything flowing untouched?" — the page's primary question,
  // which the old grid never answered. Every claim here reads from `stageCounts` (live), the
  // same source the spine draws from, so the diagnosis can never contradict the map it sits
  // under. Ranked by which lever a reader can pull first: a review backlog outranks an autonomy
  // setting outranks a vendor problem, because clearing blockers moves numbers immediately.
  // `null` means untouched flow is working as configured and no diagnosis is needed.
  const diagnosis: { text: string; href: string; linkLabel: string } | null = (() => {
    if (extracted === 0) return null
    if (touchlessPercent > 0) return null
    if (stageCounts.review > 0) return {
      text: `${stageCounts.review} document${stageCounts.review === 1 ? "" : "s"} waiting in Review. Clear them, or adjust the rule that flagged them.`,
      href: `/workspaces/${workspaceId}/pipeline?stage=review`,
      linkLabel: "Open Review",
    }
    if (autonomyLevel === "suggest") return {
      text: "Autonomy is set to Suggest, so a person must publish every document. Raise it to Auto or Touchless to let clean documents flow.",
      href: adminPaths(workspaceId).autonomy,
      linkLabel: membership.role === "owner" ? "Open Autonomy" : "Ask an owner",
    }
    return {
      text: "No vendor has earned trust yet, so every document goes to a person. Vendors start clearing that bar after their first few reviewed documents.",
      href: adminPaths(workspaceId).suppliers,
      linkLabel: "See Suppliers",
    }
  })()

  // Collapse rules for dead-weight panels. When a whole ledger's numbers are all zero it does
  // not deserve a full three-row block; a single quiet line names the state and gets out of the
  // way, so the eye finds the objects that actually carry a number.
  const policyTotal = metrics.policyVerdicts.pass + metrics.policyVerdicts.violation + metrics.policyVerdicts.error
  const matchTotal = metrics.matchCoverage.totalDocuments

  return <AdminPage title="Report" intro="Where documents stand right now against the levers that decide whether they move on their own, and how much moved untouched in the last 30 days.">
    <Panel title="The pipeline and its levers">
      <ControlsSpine
        workspaceId={workspaceId}
        counts={stageCounts}
        visibleStages={visibleStages}
        level={autonomyLevel}
        minConfidence={config.minConfidence}
        canOpenSettings={membership.role === "owner"}
      />
    </Panel>

    {/* Adaptive layout. Three shapes, one per state:
     *   1. Nothing extracted — a single instruction, no panels.
     *   2. Extracted but nothing flowed untouched yet — the 0%, the diagnosis, one link. The
     *      breakdown panels are hidden entirely: everything they would say is either 0 (noise)
     *      or already stated by the diagnosis.
     *   3. Something did flow — the full report, with each panel scope-labelled "in the last 30
     *      days" to end the "is this live or a snapshot?" confusion that broke trust before. */}
    {extracted === 0 ? (
      <p className="max-w-[52ch] text-sm leading-relaxed text-slate-500">
        No documents have reached the pipeline yet. Upload or email one in — the first pass will
        show up here.
      </p>
    ) : diagnosis ? (
      <section aria-labelledby="untouched-heading">
        <h2 id="untouched-heading" className="sr-only">Untouched flow, last 30 days</h2>
        <Figure
          value={`${touchlessPercent}%`}
          state="idle"
          caption={<>
            of the {extracted} extracted document{extracted === 1 ? "" : "s"} published themselves in the last 30 days.
          </>}
        />
        <p className="mt-4 max-w-[62ch] text-sm leading-relaxed text-slate-700">
          {diagnosis.text}{" "}
          <Link href={diagnosis.href} className="font-medium text-emerald-700 underline-offset-2 hover:text-emerald-800 hover:underline">
            {diagnosis.linkLabel} →
          </Link>
        </p>
      </section>
    ) : (
      <>
        <Panel title="The last 30 days">
          <section className="grid gap-8 md:grid-cols-[minmax(0,300px)_minmax(0,1fr)] md:items-center">
            <Figure
              value={`${touchlessPercent}%`}
              caption={<>
                {metrics.touchless.totalPushedTouchless} of {extracted} document{extracted === 1 ? "" : "s"} published themselves.
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
          {/* Every panel below is a 30-day snapshot, not a live count — the scope now sits in
              each title so a reader never has to hold "is this now or the last month?" in their
              head. The old ambiguity was the source of the on-screen contradiction with the
              spine (which is live). */}
          <Panel title="Where they landed · last 30 days">
            <Ledger>
              <LedgerRow label="Approved — ready to sync" value={metrics.readiness.ready} share={share(metrics.readiness.ready)} state="auto" href={`/workspaces/${workspaceId}/pipeline?stage=approved`} />
              <LedgerRow label="Blocked in Review" value={metrics.readiness.blocked} share={share(metrics.readiness.blocked)} state="blocked" href={`/workspaces/${workspaceId}/pipeline?stage=review`} />
              <LedgerRow label="Still in Inbox" value={metrics.readiness.pending} share={share(metrics.readiness.pending)} state="idle" href={`/workspaces/${workspaceId}/pipeline?stage=inbox`} />
            </Ledger>
          </Panel>

          <Panel title="Policy decisions · last 30 days">
            {policyTotal === 0
              ? <p className="text-[13px] leading-relaxed text-slate-500">No documents were checked against a policy in the last 30 days.</p>
              : <Ledger>
                  <LedgerRow label="Approved" value={metrics.policyVerdicts.pass} state="auto" />
                  <LedgerRow label="Rejected" value={metrics.policyVerdicts.violation} state="blocked" />
                  <LedgerRow
                    label="Could not be evaluated"
                    value={metrics.policyVerdicts.error}
                    state={metrics.policyVerdicts.error > 0 ? "waiting" : "idle"}
                    note={metrics.policyVerdicts.error > 0 ? "Sent to a reviewer instead of publishing." : undefined}
                  />
                </Ledger>}
          </Panel>

          <Panel title="Matching · last 30 days">
            {matchTotal === 0
              ? <p className="text-[13px] leading-relaxed text-slate-500">No documents to match yet.</p>
              : <Ledger>
                  <LedgerRow
                    label="Matched to a PO, receipt or bank line"
                    value={`${matchPercent}%`}
                    note={`${metrics.matchCoverage.matchedDocuments} of ${matchTotal}`}
                    share={metrics.matchCoverage.matchRate}
                    state="auto"
                  />
                  <LedgerRow
                    label="Unmatched"
                    value={matchTotal - metrics.matchCoverage.matchedDocuments}
                    state="idle"
                  />
                </Ledger>}
          </Panel>
        </div>
      </>
    )}
  </AdminPage>
}
