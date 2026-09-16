"use client"

import { Empty, Panel, Pill } from "@/components/automation/automation-ui"
import { ApprovalWorkflowForm, type ApprovalFlowDraft, type ApprovalFormMember } from "@/components/workspace/approval-workflow-form"
import { ApprovalWorkflowRowControls } from "@/components/workspace/approval-workflow-row"
import { useState } from "react"

export type FlowSummary = {
  id: string
  name: string
  active: boolean
  stages: { id: string; name: string; requireOwner: boolean; approverIds: string[]; minAmount: number | null }[]
}

/** #253: the Flows list and the Add a flow form, held together on the client so a row's
 * Duplicate can hand its stages to the form below. The list is the ledger grammar — a rule per
 * flow, its stages as an ordered list with a pill per rule — and the default flow is marked here
 * as well as in the selector above, so a reader scrolling the list sees which one starts on its
 * own without scrolling back up (critique H6). */
export function ApprovalFlowsEditor({ workspaceId, flows, members, defaultFlowId, owner, formatThreshold }: {
  workspaceId: string
  flows: FlowSummary[]
  members: ApprovalFormMember[]
  defaultFlowId: string | null
  owner: boolean
  /** Pre-formatted per flow stage id, because currency formatting stays on the server. */
  formatThreshold: Record<string, string>
}) {
  const [draft, setDraft] = useState<ApprovalFlowDraft | null>(null)
  const memberNameById = new Map(members.map((m) => [m.id, m.name || m.email]))

  const duplicate = (flow: FlowSummary) => setDraft({
    name: `${flow.name} (copy)`,
    stages: flow.stages.map((stage) => ({ name: stage.name, requireOwner: stage.requireOwner, approverIds: stage.approverIds, minAmount: stage.minAmount === null ? "" : String(stage.minAmount) })),
  })

  return <>
    <Panel title="Flows" note={`${flows.length} flow${flows.length === 1 ? "" : "s"} in this workspace. A flow's stages are fixed once it exists — to change them, duplicate it, edit the copy and delete the original.`}>
      {!flows.length
        ? <Empty title="No flows yet">Until one exists, an approval started from the Invoices bulk bar is a single decision by an owner.</Empty>
        : <div className="divide-y divide-hairline-soft">
            {flows.map((flow) => (
              <div key={flow.id} className="py-4 first:pt-0">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900">{flow.name}</span>
                    {defaultFlowId === flow.id && <Pill state={flow.active ? "auto" : "waiting"}>{flow.active ? "Default" : "Default, but inactive"}</Pill>}
                  </span>
                  {owner
                    ? <ApprovalWorkflowRowControls workspaceId={workspaceId} workflowId={flow.id} workflowName={flow.name} active={flow.active} isDefault={defaultFlowId === flow.id} onDuplicate={() => duplicate(flow)} />
                    : <Pill state={flow.active ? "auto" : "idle"}>{flow.active ? "Active" : "Inactive"}</Pill>}
                </div>
                <ol className="mt-2.5 space-y-1.5">
                  {flow.stages.map((stage, index) => (
                    <li key={stage.id} className="flex flex-wrap items-center gap-1.5 text-[13px]">
                      <span className="tabular-nums text-slate-400">{index + 1}.</span>
                      <span className="font-medium text-slate-800">{stage.name}</span>
                      {stage.approverIds.length > 0
                        ? <Pill state="auto">{stage.approverIds.map((id) => memberNameById.get(id) ?? id.slice(0, 8)).join(", ")}</Pill>
                        : stage.requireOwner
                          ? <Pill state="idle">Owner only</Pill>
                          : <Pill state="idle">Any member</Pill>}
                      {formatThreshold[stage.id] && <Pill state="waiting">≥ {formatThreshold[stage.id]}</Pill>}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>}
    </Panel>

    {owner && (
      <Panel title="Add a flow" note="Name it, list the stages in order, and pick who decides each one.">
        <ApprovalWorkflowForm workspaceId={workspaceId} members={members} draft={draft} />
      </Panel>
    )}
  </>
}
