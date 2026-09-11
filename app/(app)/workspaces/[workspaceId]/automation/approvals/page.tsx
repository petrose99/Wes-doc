import { AutomationFrame, Empty, Panel, Pill } from "@/components/automation/automation-ui"
import { ApprovalWorkflowForm, type ApprovalFormMember } from "@/components/workspace/approval-workflow-form"
import { ApprovalWorkflowRowControls } from "@/components/workspace/approval-workflow-row"
import { getCurrentUser } from "@/lib/auth"
import { getWorkspaceCapabilities, requireModule } from "@/lib/modules/capabilities"
import { decimalToNumber } from "@/lib/money"
import { listApprovalWorkflows } from "@/models/approval-workflows"
import { countOpenReviewTasks } from "@/models/review-tasks"
import { getWorkspaceMembers, requireWorkspaceRole } from "@/models/workspaces"

export const dynamic = "force-dynamic"

/** WP-AP2: approval-workflow configuration moved out of /settings and into the Automation surface,
 * where the rest of the "how much does the pipeline finish without a person" controls live.
 *
 * Beyond the historic name + owner-only per stage, each stage now accepts:
 *  - a list of named approvers (empty = any member per role gate, non-empty = only these people)
 *  - an amount threshold (blank = every bill, set = skip stage below this amount)
 *
 * Both are enforced by lib/approvals/engine.ts's canDecideStage / applicableStages. */
export default async function AutomationApprovalsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  const user = await getCurrentUser()
  const membership = await requireWorkspaceRole(workspaceId, user.id)
  await requireModule(workspaceId, "touchless-automation")
  const owner = membership.role === "owner"
  const capabilities = await getWorkspaceCapabilities(workspaceId)
  if (!capabilities.has("approval-workflows")) {
    return <AutomationFrame workspaceId={workspaceId} active="approvals" reviewCount={0} reviewEnabled={false} showSettings={owner} status="Approval workflows are disabled for this workspace.">
      <Empty title="Not enabled">Turn on the Approval workflows module in Settings → Modules to configure named stages here.</Empty>
    </AutomationFrame>
  }

  const [workflows, members, reviewCount] = await Promise.all([
    listApprovalWorkflows(workspaceId),
    getWorkspaceMembers(workspaceId),
    countOpenReviewTasks(workspaceId),
  ])
  const memberOptions: ApprovalFormMember[] = members.map((m) => ({
    id: m.userId,
    name: m.user.name ?? "",
    email: m.user.email ?? "",
    role: m.role === "owner" ? "owner" : "member",
  }))
  const memberNameById = new Map(memberOptions.map((m) => [m.id, m.name || m.email]))
  const currency = membership.workspace.baseCurrency ?? "USD"
  const formatThreshold = (value: number) => {
    try {
      return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 0 }).format(value)
    } catch {
      return `${value.toFixed(0)} ${currency}`.trim()
    }
  }

  return <AutomationFrame
    workspaceId={workspaceId}
    active="approvals"
    reviewCount={reviewCount}
    reviewEnabled={capabilities.has("review-queue")}
    showSettings={owner}
    status="Route a bill through named stages before it counts as approved. Add named approvers or an amount threshold per stage."
  >
    {owner && (
      <Panel title="Add a workflow" note="Name it, list the stages in order, and pick who decides each one.">
        <ApprovalWorkflowForm workspaceId={workspaceId} members={memberOptions} />
      </Panel>
    )}

    <Panel title="Workflows" note={`${workflows.length} workflow${workflows.length === 1 ? "" : "s"} in this workspace.`}>
      {!workflows.length
        ? <Empty title="No workflows yet">Review tasks use the plain open → in review → approved/rejected flow until one is started on them.</Empty>
        : <div className="divide-y divide-[#f1f5f9]">
            {workflows.map((workflow) => (
              <div key={workflow.id} className="py-4 first:pt-0">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-slate-900">{workflow.name}</span>
                  {owner
                    ? <ApprovalWorkflowRowControls workspaceId={workspaceId} workflowId={workflow.id} workflowName={workflow.name} active={workflow.active} />
                    : <Pill state={workflow.active ? "auto" : "idle"}>{workflow.active ? "Active" : "Inactive"}</Pill>}
                </div>
                <ol className="mt-2.5 space-y-1.5">
                  {workflow.stages.map((stage, index) => {
                    const approverIds = (stage.approverIds ?? []) as string[]
                    const threshold = stage.minAmount === null || stage.minAmount === undefined ? null : decimalToNumber(stage.minAmount)
                    return (
                      <li key={stage.id} className="flex flex-wrap items-center gap-1.5 text-[13px]">
                        <span className="tabular-nums text-slate-400">{index + 1}.</span>
                        <span className="font-medium text-slate-800">{stage.name}</span>
                        {approverIds.length > 0
                          ? <Pill state="auto">{approverIds.map((id) => memberNameById.get(id) ?? id.slice(0, 8)).join(", ")}</Pill>
                          : stage.requireOwner
                            ? <Pill state="idle">Owner only</Pill>
                            : <Pill state="idle">Any member</Pill>}
                        {threshold !== null && <Pill state="waiting">≥ {formatThreshold(threshold)}</Pill>}
                      </li>
                    )
                  })}
                </ol>
              </div>
            ))}
          </div>}
    </Panel>
  </AutomationFrame>
}
