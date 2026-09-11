import { AutomationFrame, Empty, Figure, Panel } from "@/components/automation/automation-ui"
import { VendorHistorySheet } from "@/components/automation/vendor-history-sheet"
import { getCurrentUser } from "@/lib/auth"
import { getWorkspaceCapabilities, requireModule } from "@/lib/modules/capabilities"
import { HISTORY_APPLY_THRESHOLDS } from "@/lib/automation/vendor-history"
import { listPinnedRuleIdsBySupplier } from "@/models/automation-rules"
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
  const membership = await requireWorkspaceRole(workspaceId, user.id)
  await requireModule(workspaceId, "touchless-automation")

  const capabilities = await getWorkspaceCapabilities(workspaceId)
  const reviewEnabled = capabilities.has("review-queue")
  const isOwner = membership.role === "owner"
  const [rows, reviewCount, pinnedRuleIds] = await Promise.all([
    summarizeVendorHistory(workspaceId),
    reviewEnabled ? countOpenReviewTasks(workspaceId) : 0,
    isOwner ? listPinnedRuleIdsBySupplier(workspaceId) : Promise.resolve(new Map<string, string>()),
  ])
  const autoCount = rows.filter((row) => row.willAutoApply).length

  return <AutomationFrame
    workspaceId={workspaceId}
    active="vendors"
    reviewCount={reviewCount}
    reviewEnabled={reviewEnabled}
    showSettings={isOwner}
    status={<>
      What each vendor gets coded to before the AI is asked. A coding applies on its own once at least{" "}
      {HISTORY_APPLY_THRESHOLDS.minSupport} confirmed documents agree {Math.round(HISTORY_APPLY_THRESHOLDS.minAgreement * 100)}% of the time.
    </>}
  >
    {rows.length === 0
      ? <Empty title="No confirmed history yet">
          A document counts as history once it is coded, whether by hand or by a rule. Three consistent
          codings for the same vendor are enough for the engine to apply them to the next one on its own.
        </Empty>
      : <>
        <Figure
          layout="inline"
          value={`${autoCount}`}
          state={autoCount > 0 ? "auto" : "idle"}
          caption={<>
            of the {rows.length} vendors with confirmed history now{" "}
            {autoCount === 1 ? "codes itself" : "code themselves"}. The rest still go to the AI on every document.
          </>}
        />

        <Panel
          title="Confirmed coding history"
          note={<>
            Each row is one vendor and document type. The percentage is how consistently past documents
            were coded that way, and the count is how many there were, so 100% of 5 means all five
            agreed. Sorted by how much history the workspace has.
          </>}
        >
          <VendorHistorySheet
            workspaceId={workspaceId}
            rows={rows}
            pinnedRuleIds={Object.fromEntries(pinnedRuleIds)}
            isOwner={isOwner}
          />
        </Panel>
      </>}
  </AutomationFrame>
}
