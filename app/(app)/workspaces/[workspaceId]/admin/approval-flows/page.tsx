import { AdminPage, ModuleOff, ReadOnlyBand } from "@/components/admin/admin-ui"
import { Panel } from "@/components/automation/automation-ui"
import { ApprovalFlowsEditor, type FlowSummary } from "@/components/workspace/approval-flows-editor"
import type { ApprovalFormMember } from "@/components/workspace/approval-workflow-form"
import { DefaultApprovalFlow, type DefaultFlowOption } from "@/components/workspace/default-approval-flow"
import { getDefaultApprovalFlow } from "@/models/approval-defaults"
import { getAdminContext } from "@/lib/admin/context"
import { adminPaths } from "@/lib/admin/paths"
import { decimalToNumber } from "@/lib/money"
import { listApprovalWorkflows } from "@/models/approval-workflows"

export const dynamic = "force-dynamic"

/** #231 Q12 (#252): Admin › Approval Flows — the workflow list and editor, on the Admin shell.
 * #253 adds the Default flow selector and its consequence sentence at the top. One term on the
 * page: "flow" (the section is Approval Flows) — the model and engine still say "workflow".
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
    return <AdminPage title="Approval Flows"><ModuleOff what="Approval flows" href={adminPaths(workspaceId).whatsOn} /></AdminPage>
  }

  const workflows = await listApprovalWorkflows(workspaceId)
  const memberOptions: ApprovalFormMember[] = members.map((m) => ({
    id: m.userId,
    name: m.user.name ?? "",
    email: m.user.email ?? "",
    role: m.role === "owner" ? "owner" : "member",
  }))
  const currency = membership.workspace.baseCurrency ?? "USD"
  const formatThreshold = (value: number) => {
    try {
      return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 0 }).format(value)
    } catch {
      return `${value.toFixed(0)} ${currency}`.trim()
    }
  }

  const defaultFlow = await getDefaultApprovalFlow(workspaceId)
  const flowSummaries: FlowSummary[] = workflows.map((workflow) => ({
    id: workflow.id,
    name: workflow.name,
    active: workflow.active,
    stages: workflow.stages.map((stage) => ({
      id: stage.id,
      name: stage.name,
      requireOwner: stage.requireOwner,
      approverIds: (stage.approverIds ?? []) as string[],
      minAmount: stage.minAmount === null || stage.minAmount === undefined ? null : decimalToNumber(stage.minAmount),
    })),
  }))
  const thresholds: Record<string, string> = {}
  for (const flow of flowSummaries) for (const stage of flow.stages) if (stage.minAmount !== null) thresholds[stage.id] = formatThreshold(stage.minAmount)
  const flowOptions: DefaultFlowOption[] = workflows.map((workflow) => ({
    id: workflow.id,
    name: workflow.name,
    active: workflow.active,
    stageCount: workflow.stages.length,
  }))

  return <AdminPage title="Approval Flows" intro="Route an invoice through named stages before it counts as approved, with named approvers or an amount threshold per stage. One flow can start on its own; the rest start by hand from the Invoices bulk bar.">
    {!owner && <ReadOnlyBand owners={context.owners} />}

    <Panel title="Default flow" note="The one flow that starts on its own. Off until you choose one.">
      <DefaultApprovalFlow workspaceId={workspaceId} options={flowOptions} currentId={defaultFlow?.id ?? null} readOnly={!owner} />
    </Panel>

    <ApprovalFlowsEditor
      workspaceId={workspaceId}
      flows={flowSummaries}
      members={memberOptions}
      defaultFlowId={defaultFlow?.id ?? null}
      owner={owner}
      formatThreshold={thresholds} />
  </AdminPage>
}
