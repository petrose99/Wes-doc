import { getCurrentUser } from "@/lib/auth"
import { getAutomationMetrics, getSupplierTrust, type SupplierTrustRow } from "@/lib/analytics/workspace-analytics"
import { getWorkspaceCapabilities, requireModule } from "@/lib/modules/capabilities"
import { SUPPLIER_COLD_START_COUNT, SUPPLIER_TRUST_STREAK } from "@/lib/readiness/supplier-thresholds"
import { countOpenReviewTasks } from "@/models/review-tasks"
import { requireWorkspaceRole } from "@/models/workspaces"
import { AutomationTabs } from "@/components/automation/automation-tabs"
import { Activity, CheckCircle2, GitCompareArrows, ShieldCheck, XCircle } from "lucide-react"

export const dynamic = "force-dynamic"

function Stat({ label, value, sub, icon: Icon, color }: {
  label: string
  value: string | number
  sub?: string
  icon: typeof Activity
  color: string
}) {
  return <div className="rounded-xl border border-[#e6ebf1] bg-white p-4 shadow-panel">
    <div className="mb-2 flex items-center gap-2">
      <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${color}`}>
        <Icon className="h-4 w-4" />
      </div>
      <span className="text-sm font-medium text-slate-600">{label}</span>
    </div>
    <div className="text-2xl font-bold text-slate-900">{value}</div>
    {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
  </div>
}

function ProgressBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return <div className="space-y-1">
    <div className="flex justify-between text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      <span className="text-slate-500">{pct}% ({value}/{max})</span>
    </div>
    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  </div>
}

/** One supplier's standing in the trust ladder. The point of the row is to answer "why is this
 * vendor still going to review, and how much longer" without anyone reading the readiness code. */
function SupplierRow({ row }: { row: SupplierTrustRow }) {
  const badge = row.coldStart
    ? { label: "Cold start", className: "bg-amber-50 text-amber-700" }
    : row.trusted
      ? { label: "Trusted", className: "bg-emerald-50 text-emerald-700" }
      : { label: "Building trust", className: "bg-blue-50 text-blue-700" }
  return <tr className="border-b border-[#f1f5f9] last:border-0">
    <td className="py-2.5 pr-3 font-medium text-slate-900">{row.name}</td>
    <td className="py-2.5 pr-3">
      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}>{badge.label}</span>
    </td>
    <td className="py-2.5 pr-3 text-slate-600">
      {row.coldStart
        ? `${row.touchlessSeen} of ${SUPPLIER_COLD_START_COUNT} — ${row.remainingToGraduate} more to go`
        : "Past cold start"}
    </td>
    <td className="py-2.5 pr-3 text-slate-600">{row.consecutiveClean} of {SUPPLIER_TRUST_STREAK}</td>
    <td className="py-2.5 tabular-nums text-slate-600">{row.effectiveMinConfidence.toFixed(2)}</td>
  </tr>
}

export default async function AutomationDashboardPage({ params }: {
  params: Promise<{ workspaceId: string }>
}) {
  const { workspaceId } = await params
  const user = await getCurrentUser()
  await requireWorkspaceRole(workspaceId, user.id)
  await requireModule(workspaceId, "touchless-automation")

  const capabilities = await getWorkspaceCapabilities(workspaceId)
  const reviewEnabled = capabilities.has("review-queue")
  const [metrics, supplierTrust, reviewCount] = await Promise.all([
    getAutomationMetrics(workspaceId, 30),
    getSupplierTrust(workspaceId),
    reviewEnabled ? countOpenReviewTasks(workspaceId) : 0,
  ])
  const touchlessPercent = Math.round(metrics.touchless.touchlessRate * 100)
  const matchPercent = Math.round(metrics.matchCoverage.matchRate * 100)

  return <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 md:px-6">
    <header>
      <h1 className="text-2xl font-bold text-slate-900">Automation</h1>
      <p className="mt-1 text-sm text-slate-500">Touchless automation performance and review queue.</p>
    </header>
    <AutomationTabs workspaceId={workspaceId} active="metrics" reviewCount={reviewCount} reviewEnabled={reviewEnabled} />

    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Stat icon={Activity} label="Touchless rate" value={`${touchlessPercent}%`} sub={`${metrics.touchless.totalPushedTouchless} of ${metrics.touchless.totalExtracted} documents`} color="bg-emerald-50 text-emerald-700" />
      <Stat icon={CheckCircle2} label="Ready" value={metrics.readiness.ready} sub={`${metrics.readiness.blocked} blocked · ${metrics.readiness.pending} pending`} color="bg-blue-50 text-blue-700" />
      <Stat icon={GitCompareArrows} label="Match coverage" value={`${matchPercent}%`} sub={`${metrics.matchCoverage.matchedDocuments} of ${metrics.matchCoverage.totalDocuments} matched`} color="bg-violet-50 text-violet-700" />
      <Stat icon={ShieldCheck} label="Policy pass" value={metrics.policyVerdicts.pass} sub={`${metrics.policyVerdicts.violation} rejected · ${metrics.policyVerdicts.error} errors`} color="bg-amber-50 text-amber-700" />
    </div>

    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="rounded-2xl border border-[#e6ebf1] bg-white p-5 shadow-panel">
        <h2 className="mb-4 text-[15px] font-bold text-slate-900">Document readiness</h2>
        <div className="space-y-3">
          <ProgressBar label="Ready to sync" value={metrics.readiness.ready} max={metrics.touchless.totalExtracted} color="bg-emerald-600" />
          <ProgressBar label="Blocked" value={metrics.readiness.blocked} max={metrics.touchless.totalExtracted} color="bg-red-500" />
          <ProgressBar label="Pending evaluation" value={metrics.readiness.pending} max={metrics.touchless.totalExtracted} color="bg-slate-400" />
        </div>
      </div>

      <div className="rounded-2xl border border-[#e6ebf1] bg-white p-5 shadow-panel">
        <h2 className="mb-4 text-[15px] font-bold text-slate-900">Touchless funnel</h2>
        <div className="space-y-3">
          <ProgressBar label="Extracted" value={metrics.touchless.totalExtracted} max={metrics.touchless.totalExtracted} color="bg-slate-500" />
          <ProgressBar label="Ready (passed all checks)" value={metrics.touchless.totalReady} max={metrics.touchless.totalExtracted} color="bg-blue-500" />
          <ProgressBar label="Pushed touchless" value={metrics.touchless.totalPushedTouchless} max={metrics.touchless.totalExtracted} color="bg-emerald-600" />
        </div>
      </div>
    </div>

    <div className="rounded-2xl border border-[#e6ebf1] bg-white p-5 shadow-panel">
      <h2 className="mb-4 text-[15px] font-bold text-slate-900">Policy evaluation breakdown</h2>
      <div className="grid grid-cols-3 gap-4">
        <div className="flex items-center gap-3 rounded-xl bg-emerald-50 p-4">
          <CheckCircle2 className="h-5 w-5 text-emerald-700" />
          <div>
            <div className="text-lg font-bold text-emerald-900">{metrics.policyVerdicts.pass}</div>
            <div className="text-xs text-emerald-700">Approved</div>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl bg-red-50 p-4">
          <XCircle className="h-5 w-5 text-red-700" />
          <div>
            <div className="text-lg font-bold text-red-900">{metrics.policyVerdicts.violation}</div>
            <div className="text-xs text-red-700">Rejected</div>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl bg-amber-50 p-4">
          <Activity className="h-5 w-5 text-amber-700" />
          <div>
            <div className="text-lg font-bold text-amber-900">{metrics.policyVerdicts.error}</div>
            <div className="text-xs text-amber-700">Errors</div>
          </div>
        </div>
      </div>
    </div>

    <div className="rounded-xl border border-[#e6ebf1] bg-white p-5 shadow-panel">
      <h2 className="text-sm font-semibold text-slate-900">Supplier trust</h2>
      <p className="mt-0.5 text-xs text-slate-500">
        A supplier&rsquo;s first {SUPPLIER_COLD_START_COUNT} documents always go to a reviewer, whatever their confidence.
        After that its invoices can push untouched, and the confidence bar it must clear drops once {SUPPLIER_TRUST_STREAK} in a row come back clean.
      </p>
      {supplierTrust.length === 0
        ? <p className="mt-4 text-sm text-slate-500">No suppliers recognised yet — they are created as documents are extracted.</p>
        : <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-[#e6ebf1] text-left text-xs font-medium text-slate-500">
                  <th className="pb-2 pr-3 font-medium">Supplier</th>
                  <th className="pb-2 pr-3 font-medium">Status</th>
                  <th className="pb-2 pr-3 font-medium">Trust progress</th>
                  <th className="pb-2 pr-3 font-medium">Clean streak</th>
                  <th className="pb-2 font-medium">Confidence bar</th>
                </tr>
              </thead>
              <tbody>
                {supplierTrust.map((row) => <SupplierRow key={row.supplierId} row={row} />)}
              </tbody>
            </table>
          </div>}
    </div>
  </main>
}
