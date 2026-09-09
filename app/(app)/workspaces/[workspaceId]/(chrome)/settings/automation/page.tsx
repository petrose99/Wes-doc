import { AutomationConfigForm } from "@/components/settings/automation-config-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getCurrentUser } from "@/lib/auth"
import { deriveAutonomyLevel, getOrCreateAutomationConfig } from "@/models/automation-config"
import { requireWorkspaceRole } from "@/models/workspaces"
import { decimalToNumberOrZero } from "@/lib/money"
import { notFound } from "next/navigation"

export const dynamic = "force-dynamic"

/** Phase 6: expose WorkspaceAutomationConfig as Ramp's graduated autonomy slider. */
export default async function AutomationSettingsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  const user = await getCurrentUser()
  const membership = await requireWorkspaceRole(workspaceId, user.id)
  if (membership.role !== "owner") notFound()

  const config = await getOrCreateAutomationConfig(workspaceId)
  const level = deriveAutonomyLevel(config)

  return <main className="space-y-6">
    <header>
      <h1 className="text-3xl font-bold">Automation</h1>
      <p className="mt-1 text-muted-foreground">Choose how much of the coding + review pipeline runs without a person clicking Approve.</p>
    </header>

    <Card>
      <CardHeader>
        <CardTitle>Autonomy level</CardTitle>
        <CardDescription>
          <strong>Suggest</strong> — every document waits for a reviewer.
          <strong className="ml-2">Auto with approval</strong> — coding runs, reviewer confirms with one click.
          <strong className="ml-2">Touchless</strong> — publish automatically at high confidence.
        </CardDescription>
      </CardHeader>
      <CardContent>
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
      </CardContent>
    </Card>
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
