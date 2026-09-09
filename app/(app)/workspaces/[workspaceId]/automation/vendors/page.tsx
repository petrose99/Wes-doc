import { Badge } from "@/components/ui/badge"
import { AutomationTabs } from "@/components/automation/automation-tabs"
import { getCurrentUser } from "@/lib/auth"
import { getWorkspaceCapabilities, requireModule } from "@/lib/modules/capabilities"
import { HISTORY_APPLY_THRESHOLDS } from "@/lib/automation/vendor-history"
import { countOpenReviewTasks } from "@/models/review-tasks"
import { requireWorkspaceRole } from "@/models/workspaces"
import { summarizeVendorHistory } from "@/models/vendor-history"

export const dynamic = "force-dynamic"

/** Phase 3 visibility, folded into /automation as the "Vendors" tab: shows every
 * (vendor, template) with confirmed coding history, plus what the auto-coding engine will
 * do for it — apply the modal value directly (touchless), or fall through to the LLM. */
export default async function AutomationVendorsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  const user = await getCurrentUser()
  await requireWorkspaceRole(workspaceId, user.id)
  await requireModule(workspaceId, "touchless-automation")

  const capabilities = await getWorkspaceCapabilities(workspaceId)
  const reviewEnabled = capabilities.has("review-queue")
  const [rows, reviewCount] = await Promise.all([
    summarizeVendorHistory(workspaceId),
    reviewEnabled ? countOpenReviewTasks(workspaceId) : 0,
  ])

  return <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 md:px-6">
    <header>
      <h1 className="text-2xl font-bold text-slate-900">Automation</h1>
      <p className="mt-1 text-sm text-slate-500">
        What the automation engine will code each vendor to before asking the AI. Applies directly when at least{" "}
        {HISTORY_APPLY_THRESHOLDS.minSupport} prior confirmed documents agree{" "}
        {Math.round(HISTORY_APPLY_THRESHOLDS.minAgreement * 100)}% of the time.
      </p>
    </header>
    <AutomationTabs workspaceId={workspaceId} active="vendors" reviewCount={reviewCount} reviewEnabled={reviewEnabled} />

    {rows.length === 0
      ? <div className="rounded-2xl border border-[#e6ebf1] bg-white p-8 text-center shadow-panel">
          <h2 className="text-base font-semibold text-slate-900">No confirmed history yet</h2>
          <p className="mt-1 text-sm text-slate-500">
            Once a document is coded manually or via a rule, it counts as history. Three
            consistent codings for the same vendor are enough for the engine to apply them
            automatically on the next one.
          </p>
        </div>
      : <div className="rounded-2xl border border-[#e6ebf1] bg-white p-5 shadow-panel">
          <div className="mb-4">
            <h2 className="text-[15px] font-bold text-slate-900">{rows.length} vendor{rows.length === 1 ? "" : "s"} with confirmed history</h2>
            <p className="text-xs text-slate-500">Sorted by how many confirmed documents the workspace has for each vendor + template.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#e6ebf1] text-left text-xs uppercase text-slate-500">
                  <th className="py-2 pr-4 font-medium">Vendor</th>
                  <th className="py-2 pr-4 font-medium">Template</th>
                  <th className="py-2 pr-4 font-medium">Confirmed docs</th>
                  <th className="py-2 pr-4 font-medium">Coding</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.supplier}::${row.templateCode}`} className="border-b border-[#f1f5f9] last:border-b-0">
                    <td className="py-2 pr-4 font-medium text-slate-900">{row.supplier}</td>
                    <td className="py-2 pr-4 text-slate-500">{row.templateCode}</td>
                    <td className="py-2 pr-4">{row.totalConfirmed}</td>
                    <td className="py-2 pr-4">
                      <ul className="space-y-0.5">
                        {Object.entries(row.prior.byKey).map(([key, stat]) => (
                          <li key={key} className="text-xs">
                            <span className="font-medium">{key}:</span>{" "}
                            <span>{stat.modalValue}</span>{" "}
                            <span className="text-slate-500">({Math.round(stat.agreement * 100)}% of {stat.support})</span>
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="py-2 pr-4">
                      {row.willAutoApply
                        ? <Badge className="bg-emerald-100 text-emerald-800">Auto-applies</Badge>
                        : <Badge className="bg-slate-100 text-slate-700">Falls back to AI</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>}
  </main>
}
