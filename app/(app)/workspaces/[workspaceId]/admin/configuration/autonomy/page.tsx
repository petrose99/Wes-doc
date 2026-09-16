import { AdminPage, ModuleOff, ReadOnlyBand } from "@/components/admin/admin-ui"
import { AutomationConfigForm } from "@/components/settings/automation-config-form"
import { getAdminContext } from "@/lib/admin/context"
import { adminPaths } from "@/lib/admin/paths"
import { decimalToNumberOrZero } from "@/lib/money"
import { deriveAutonomyLevel, getOrCreateAutomationConfig } from "@/models/automation-config"

export const dynamic = "force-dynamic"

/** #231 Q10 (#252): Admin › Configuration › Autonomy — the graduated-autonomy ladder that was
 * Controls › Settings, on the Admin shell. A member sees it read-only (#231 Q19) instead of the
 * 404 the old page returned. */
export default async function AutonomyPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  const context = await getAdminContext(workspaceId)
  if (!context.capabilities.has("touchless-automation")) {
    return <AdminPage title="Autonomy"><ModuleOff what="Touchless automation" href={adminPaths(workspaceId).whatsOn} /></AdminPage>
  }
  const config = await getOrCreateAutomationConfig(workspaceId)
  const level = deriveAutonomyLevel(config)

  return <AdminPage title="Autonomy" intro="How much of the coding and review pipeline is allowed to finish without a person clicking Approve.">
    {!context.owner && <ReadOnlyBand owners={context.owners} />}
    <AutomationConfigForm
      workspaceId={workspaceId}
      readOnly={!context.owner}
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
  </AdminPage>
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
