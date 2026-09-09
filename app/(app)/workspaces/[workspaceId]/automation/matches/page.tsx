import { AutomationTabs } from "@/components/automation/automation-tabs"
import { getCurrentUser } from "@/lib/auth"
import { getWorkspaceCapabilities, requireModule } from "@/lib/modules/capabilities"
import { summarizeMatching } from "@/models/matching-metrics"
import { countOpenReviewTasks } from "@/models/review-tasks"
import { requireWorkspaceRole } from "@/models/workspaces"

export const dynamic = "force-dynamic"

/** Phase 4 visibility, folded into /automation as the "Matches" tab: DocumentMatch rollup +
 * BankMatch reconciliation state. */
export default async function AutomationMatchesPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  const user = await getCurrentUser()
  await requireWorkspaceRole(workspaceId, user.id)
  await requireModule(workspaceId, "touchless-automation")

  const capabilities = await getWorkspaceCapabilities(workspaceId)
  const reviewEnabled = capabilities.has("review-queue")
  const [summary, reviewCount] = await Promise.all([
    summarizeMatching(workspaceId),
    reviewEnabled ? countOpenReviewTasks(workspaceId) : 0,
  ])

  const maxBucket = Math.max(1, ...summary.confidenceBuckets.map((b) => b.count))
  const reconciledPct = summary.bankAccepted > 0 ? Math.round((summary.bankReconciled / summary.bankAccepted) * 100) : 0

  return <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 md:px-6">
    <header>
      <h1 className="text-2xl font-bold text-slate-900">Automation</h1>
      <p className="mt-1 text-sm text-slate-500">Document matching + bank reconciliation activity.</p>
    </header>
    <AutomationTabs workspaceId={workspaceId} active="matches" reviewCount={reviewCount} reviewEnabled={reviewEnabled} />

    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className="rounded-2xl border border-[#e6ebf1] bg-white p-5 shadow-panel">
        <h2 className="mb-2 text-[15px] font-bold text-slate-900">Document matching</h2>
        <p className="text-xs text-slate-500">2/3-way PO ↔ invoice ↔ receipt matches surfaced by the pipeline.</p>
        <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
          <Stat label="Total" value={summary.total} />
          <Stat label="Resolved" value={summary.byStatus.resolved ?? 0} />
          <Stat label="Pending" value={summary.byStatus.pending ?? 0} />
        </div>
        <div className="mt-4">
          <h3 className="text-xs font-semibold uppercase text-slate-500">By type</h3>
          <ul className="mt-1 space-y-0.5 text-sm">
            {Object.entries(summary.byType).length === 0
              ? <li className="text-slate-500">No matches yet.</li>
              : Object.entries(summary.byType).map(([type, count]) => (
                  <li key={type} className="flex justify-between">
                    <span className="text-slate-600">{type}</span>
                    <span className="tabular-nums">{count}</span>
                  </li>
                ))}
          </ul>
        </div>
      </div>

      <div className="rounded-2xl border border-[#e6ebf1] bg-white p-5 shadow-panel">
        <h2 className="mb-2 text-[15px] font-bold text-slate-900">Bank reconciliation</h2>
        <p className="text-xs text-slate-500">Bank statement lines matched to invoices/receipts, and how many have gone all the way to reconciled.</p>
        <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
          <Stat label="Suggested" value={summary.bankTotal} />
          <Stat label="Accepted" value={summary.bankAccepted} />
          <Stat label="Reconciled" value={summary.bankReconciled} />
        </div>
        <div className="mt-4">
          <p className="text-xs text-slate-500">Reconciled rate (of accepted): <span className="font-semibold text-slate-900">{reconciledPct}%</span></p>
        </div>
      </div>
    </div>

    <div className="rounded-2xl border border-[#e6ebf1] bg-white p-5 shadow-panel">
      <h2 className="mb-4 text-[15px] font-bold text-slate-900">Confidence distribution (document matches)</h2>
      {summary.total === 0
        ? <p className="text-sm text-slate-500">No matches to plot yet — they appear as soon as the pipeline generates candidates.</p>
        : <div className="space-y-2">
            {summary.confidenceBuckets.map((b) => (
              <div key={b.label}>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-600">{b.label}</span>
                  <span className="tabular-nums text-slate-500">{b.count}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.round((b.count / maxBucket) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>}
    </div>
  </main>
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg border border-[#e6ebf1] bg-slate-50 p-3">
    <div className="text-xs uppercase text-slate-500">{label}</div>
    <div className="text-xl font-bold text-slate-900 tabular-nums">{value}</div>
  </div>
}
