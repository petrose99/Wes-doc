import { getCurrentUser } from "@/lib/auth"
import { getAutomationMetrics, getSupplierTrust, type SupplierTrustRow } from "@/lib/analytics/workspace-analytics"
import { getWorkspaceCapabilities, requireModule } from "@/lib/modules/capabilities"
import { PIPELINE_STAGES } from "@/lib/documents/stages"
import { SUPPLIER_COLD_START_COUNT, SUPPLIER_TRUST_STREAK } from "@/lib/readiness/supplier-thresholds"
import { deriveAutonomyLevel, getOrCreateAutomationConfig } from "@/models/automation-config"
import { countDocumentsByStage } from "@/models/documents"
import { countOpenReviewTasks } from "@/models/review-tasks"
import { requireWorkspaceRole } from "@/models/workspaces"
import { AutomationFrame, Empty, Figure, Funnel, Ledger, LedgerRow, Panel, Pill, Sheet, Th } from "@/components/automation/automation-ui"
import { ControlsSpine } from "@/components/automation/controls-spine"
import Link from "next/link"

export const dynamic = "force-dynamic"

/** One supplier's standing in the trust ladder. The point of the row is to answer "why is this
 * vendor still going to review, and how much longer" without anyone reading the readiness code. */
function SupplierRow({ row }: { row: SupplierTrustRow }) {
  const standing = row.coldStart
    ? { state: "waiting" as const, label: "Cold start" }
    : row.trusted
      ? { state: "auto" as const, label: "Trusted" }
      : { state: "idle" as const, label: "Building trust" }
  return <tr>
    <td className="py-2.5 pr-4 font-medium text-slate-900">{row.name}</td>
    <td className="py-2.5 pr-4"><Pill state={standing.state}>{standing.label}</Pill></td>
    <td className="py-2.5 pr-4 text-slate-600">
      {row.coldStart
        ? `${row.touchlessSeen} of ${SUPPLIER_COLD_START_COUNT} seen, ${row.remainingToGraduate} to go`
        : "Past cold start"}
    </td>
    <td className="py-2.5 pr-4 tabular-nums text-slate-600">{row.consecutiveClean} of {SUPPLIER_TRUST_STREAK}</td>
    <td className="py-2.5 text-right tabular-nums text-slate-600">{row.effectiveMinConfidence.toFixed(2)}</td>
  </tr>
}

export default async function AutomationDashboardPage({ params }: {
  params: Promise<{ workspaceId: string }>
}) {
  const { workspaceId } = await params
  const user = await getCurrentUser()
  const membership = await requireWorkspaceRole(workspaceId, user.id)
  await requireModule(workspaceId, "touchless-automation")

  const capabilities = await getWorkspaceCapabilities(workspaceId)
  const reviewEnabled = capabilities.has("review-queue")
  const [metrics, supplierTrust, reviewCount, stageCounts, config] = await Promise.all([
    getAutomationMetrics(workspaceId, 30),
    getSupplierTrust(workspaceId),
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
    status="How much of the last 30 days of invoice coding went through without anyone clicking Approve, and what is holding the rest back."
  >
    <Panel
      title="Where controls act"
      note="The same five stages as Documents — each handoff names the control that decides it. Stages open that tab of the pipeline; controls open their own tab here."
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

        <Panel
          title="Supplier trust"
          note={<>
            A supplier&rsquo;s first {SUPPLIER_COLD_START_COUNT} documents always go to a reviewer, whatever their confidence.
            After that its invoices can publish untouched, and the confidence bar it must clear drops once{" "}
            {SUPPLIER_TRUST_STREAK} in a row come back clean.
          </>}
        >
          {supplierTrust.length === 0
            ? <Empty title="No suppliers recognised yet">
                Suppliers are created as documents are extracted. The trust ladder starts on the first one.
              </Empty>
            : <Sheet head={<>
                <Th>Supplier</Th>
                <Th>Standing</Th>
                <Th>Trust progress</Th>
                <Th>Clean streak</Th>
                <Th align="right">Confidence bar</Th>
              </>}>
                {supplierTrust.map((row) => <SupplierRow key={row.supplierId} row={row} />)}
              </Sheet>}
        </Panel>
      </>}
  </AutomationFrame>
}
