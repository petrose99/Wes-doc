import { AdminPage, ModuleOff, ReadOnlyBand } from "@/components/admin/admin-ui"
import { Empty, Panel, Pill } from "@/components/automation/automation-ui"
import { ApprovalWorkflowForm, type ApprovalFormMember } from "@/components/workspace/approval-workflow-form"
import { ApprovalWorkflowRowControls } from "@/components/workspace/approval-workflow-row"
import { getAdminContext } from "@/lib/admin/context"
import { adminPaths } from "@/lib/admin/paths"
import { decimalToNumber } from "@/lib/money"
import { listApprovalWorkflows } from "@/models/approval-workflows"

export const dynamic = "force-dynamic"

/** #231 Q12 (#252): Admin › Approval Flows — the workflow list and editor, on the Admin shell.
 * The Default flow selector and its consequence sentence are #253's; until then the fact in
 * force is stated under the title: approvals start by hand from the Invoices bulk bar.
 *
 * Beyond the historic name + owner-only per stage, each stage now accepts:
 *  - a list of named approvers (empty = any member per role gate, non-empty = only these people)
 *  - an amount threshold (blank = every bill, set = skip stage below this amount)
 *
 * Both are enforced by lib/approvals/engine.ts's canDecideStage / applicableStages. */
export default async function ApprovalFlowsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  const context = await getAdminContext(workspaceId)
  const { owner, membership, members } = context
  if (!context.capabilities.has("approval-workflows")) {
    return <AdminPage title="Approval Flows"><ModuleOff what="Approval workflows" href={adminPaths(workspaceId).whatsOn} /></AdminPage>
  }

  const workflows = await listApprovalWorkflows(workspaceId)
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

  return <AdminPage title="Approval Flows" intro="Route an invoice through named stages before it counts as approved, with named approvers or an amount threshold per stage. Approvals start by hand from the Invoices bulk bar.">
    {!owner && <ReadOnlyBand owners={context.owners} />}

    <Panel title="Workflows" note={`${workflows.length} workflow${workflows.length === 1 ? "" : "s"} in this workspace.`}>
      {!workflows.length
        ? <Empty title="No workflows yet">Until one exists, an approval started from the Invoices bulk bar is a single decision by an owner.</Empty>
        : <div className="divide-y divide-hairline-soft">
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

    {owner && (
      <Panel title="Add a workflow" note="Name it, list the stages in order, and pick who decides each one.">
        <ApprovalWorkflowForm workspaceId={workspaceId} members={memberOptions} />
      </Panel>
    )}
  </AdminPage>
}
