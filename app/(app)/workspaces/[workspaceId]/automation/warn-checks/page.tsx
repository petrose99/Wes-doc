import { notFound } from "next/navigation"

import { AutomationFrame } from "@/components/automation/automation-ui"
import { WarnChecksAdmin } from "@/components/settings/warn-checks-admin"
import { getCurrentUser } from "@/lib/auth"
import { getWorkspaceCapabilities, requireModule } from "@/lib/modules/capabilities"
import { countOpenReviewTasks } from "@/models/review-tasks"
import { listWarnChecks } from "@/models/warn-checks"
import { requireWorkspaceRole } from "@/models/workspaces"

export const dynamic = "force-dynamic"

/** Ticket #56 admin surface — sits under /automation as its own tab so a workspace's own soft
 * rules aren't lost in the middle of the graduated-autonomy settings form. Owner-only, same as
 * /automation/settings. */
export default async function WarnChecksPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  const user = await getCurrentUser()
  const membership = await requireWorkspaceRole(workspaceId, user.id)
  await requireModule(workspaceId, "touchless-automation")
  if (membership.role !== "owner") notFound()

  const capabilities = await getWorkspaceCapabilities(workspaceId)
  const reviewEnabled = capabilities.has("review-queue")
  const [checks, reviewCount] = await Promise.all([
    listWarnChecks(workspaceId),
    reviewEnabled ? countOpenReviewTasks(workspaceId) : 0,
  ])

  return (
    <AutomationFrame
      workspaceId={workspaceId}
      active="settings"
      reviewCount={reviewCount}
      reviewEnabled={reviewEnabled}
      status="Warn checks are the workspace's own soft-gate rules — they never block a bill, but they hold it in the exception queue with your wording."
    >
      <WarnChecksAdmin
        workspaceId={workspaceId}
        initial={checks.map((c) => ({
          id: c.id,
          name: c.name,
          whenExpr: c.whenExpr,
          message: c.message,
          enabled: c.enabled,
          createdAt: c.createdAt.toISOString(),
          author: c.createdBy?.name ?? c.createdBy?.email ?? "Unknown",
        }))}
      />
    </AutomationFrame>
  )
}
