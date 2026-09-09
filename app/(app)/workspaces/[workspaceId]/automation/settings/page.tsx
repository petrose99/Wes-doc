import { AutomationConfigForm } from "@/components/settings/automation-config-form"
import { AutomationFrame } from "@/components/automation/automation-ui"
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

  return <AutomationFrame
    workspaceId={workspaceId}
    active="settings"
    reviewCount={reviewCount}
    reviewEnabled={reviewEnabled}
    status="How much of the coding and review pipeline is allowed to finish without a person clicking Approve."
  >
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
  </AutomationFrame>
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
