import { AutomationConfigForm } from "@/components/settings/automation-config-form"
import { AutomationTabs } from "@/components/automation/automation-tabs"
import { getCurrentUser } from "@/lib/auth"
import { getWorkspaceCapabilities, requireModule } from "@/lib/modules/capabilities"
import { decimalToNumberOrZero } from "@/lib/money"
import { deriveAutonomyLevel, getOrCreateAutomationConfig } from "@/models/automation-config"
import { countOpenReviewTasks } from "@/models/review-tasks"
import { requireWorkspaceRole } from "@/models/workspaces"
import { notFound } from "next/navigation"

export const dynamic = "force-dynamic"

/** Phase 6, folded into /automation as the "Settings" tab: expose WorkspaceAutomationConfig
 * as Ramp's graduated autonomy slider (Suggest → Auto with approval → Touchless). Owner-only. */
export default async function AutomationSettingsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  const user = await getCurrentUser()
  const membership = await requireWorkspaceRole(workspaceId, user.id)
  await requireModule(workspaceId, "touchless-automation")
  if (membership.role !== "owner") notFound()

  const capabilities = await getWorkspaceCapabilities(workspaceId)
  const reviewEnabled = capabilities.has("review-queue")
  const [config, reviewCount] = await Promise.all([
    getOrCreateAutomationConfig(workspaceId),
    reviewEnabled ? countOpenReviewTasks(workspaceId) : 0,
  ])
  const level = deriveAutonomyLevel(config)

  return <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 md:px-6">
    <header>
      <h1 className="text-2xl font-bold text-slate-900">Automation</h1>
      <p className="mt-1 text-sm text-slate-500">Choose how much of the coding + review pipeline runs without a person clicking Approve.</p>
    </header>
    <AutomationTabs workspaceId={workspaceId} active="settings" reviewCount={reviewCount} reviewEnabled={reviewEnabled} />

    <div className="rounded-2xl border border-[#e6ebf1] bg-white p-5 shadow-panel">
      <div className="mb-4">
        <h2 className="text-[15px] font-bold text-slate-900">Autonomy level</h2>
        <p className="text-xs text-slate-500">
          <strong>Suggest</strong> — every document waits for a reviewer.{" "}
          <strong>Auto with approval</strong> — coding runs, reviewer confirms with one click.{" "}
          <strong>Touchless</strong> — publish automatically at high confidence.
        </p>
      </div>
      <AutomationConfigForm
        workspaceId={workspaceId}
        initial={{
          level,
          minConfidence: config.minConfidence,
          qaSampleRate: config.qaSampleRate,
          requirePolicyPass: config.requirePolicyPass,
          blockOnWarnChecks: config.blockOnWarnChecks,
          policyText: config.policyText,
          amountBands: normalizeAmountBands(config.amountBands),
        }}
      />
    </div>
  </main>
}

function normalizeAmountBands(raw: unknown): Array<{ min: number; max: number | null; minConfidence: number; requireVerifiedSupplier?: boolean }> {
  if (!Array.isArray(raw)) return []
  const rows: Array<{ min: number; max: number | null; minConfidence: number; requireVerifiedSupplier?: boolean }> = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const rec = item as Record<string, unknown>
    const min = decimalToNumberOrZero(rec.min as never)
    const max = rec.max == null ? null : decimalToNumberOrZero(rec.max as never)
    const minConfidence = decimalToNumberOrZero(rec.minConfidence as never)
    if (Number.isFinite(min) && Number.isFinite(minConfidence)) {
      rows.push({ min, max, minConfidence, requireVerifiedSupplier: rec.requireVerifiedSupplier === true })
    }
  }
  return rows
}
