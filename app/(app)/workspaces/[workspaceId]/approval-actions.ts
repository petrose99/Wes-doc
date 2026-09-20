"use server"

import { ActionState } from "@/lib/actions"
import { getCurrentUser } from "@/lib/auth"
import { getWorkspaceCapabilities } from "@/lib/modules/capabilities"
import { createApprovalWorkflow, deleteApprovalWorkflow, updateApprovalWorkflow, updateApprovalWorkflowFields, type WorkflowStageDraft } from "@/models/approval-workflows"
import { revalidatePath } from "next/cache"
import { errorMessage, NO_ACCESS, paths, requireMember } from "./action-helpers"
import { adminPaths } from "@/lib/admin/paths"

/** Building and editing workflows is owner-only, same bar as automation-rules.ts's rule creation
 * — both are workspace-wide policy, not a per-document action any member should be able to change
 * out from under everyone else. */
async function requireApprovalsOwner(workspaceId: string, userId: string) {
  const membership = await requireMember(workspaceId, userId, ["owner"])
  if (!membership) return null
  if (!(await getWorkspaceCapabilities(workspaceId)).has("approval-workflows")) return null
  return membership
}

/** Parses the settings page's dynamic stage-row inputs: `stageName_0`, `stageName_1`, ... paired
 * with `stageRequireOwner_0`, etc., plus a `stageCount` telling us how many rows the form actually
 * rendered. Blank-named rows are dropped (a person adding then abandoning a row shouldn't produce
 * an unnamed stage) — see createApprovalWorkflowAction's own check for what happens if that leaves
 * nothing at all. */
function parseStageRows(formData: FormData): WorkflowStageDraft[] {
  const count = Number(formData.get("stageCount") || 0)
  const stages: WorkflowStageDraft[] = []
  for (let index = 0; index < count; index++) {
    const name = String(formData.get(`stageName_${index}`) || "").trim()
    if (!name) continue
    // WP-AP2: getAll returns [] when nothing was submitted, which matches the "role-only" default
    // in the engine — no extra defaulting needed here.
    const approverIds = formData.getAll(`stageApproverIds_${index}`).map(String).filter(Boolean)
    const minAmountRaw = String(formData.get(`stageMinAmount_${index}`) || "").trim()
    const minAmountParsed = minAmountRaw ? Number(minAmountRaw) : NaN
    const minAmount = Number.isFinite(minAmountParsed) && minAmountParsed >= 0 ? minAmountParsed : null
    stages.push({ name, requireOwner: formData.get(`stageRequireOwner_${index}`) === "on", approverIds, minAmount })
  }
  return stages
}

/** #328: same row-parsing convention as parseStageRows, but keyed to an existing stage's id
 * (`stageId_0`, `stageId_1`, ...) rather than array position — the edit path patches by id, never
 * by index, so a row a person didn't touch can't be silently reordered. A row with no id is
 * dropped (it would mean the client tried to add a stage, which updateApprovalWorkflowFields
 * rejects anyway via the id-set check — dropping it here just keeps the payload honest). */
function parseStageRowsById(formData: FormData): { id: string; name: string; requireOwner?: boolean; approverIds?: string[]; minAmount?: number | null }[] {
  const count = Number(formData.get("stageCount") || 0)
  const stages: { id: string; name: string; requireOwner?: boolean; approverIds?: string[]; minAmount?: number | null }[] = []
  for (let index = 0; index < count; index++) {
    const id = String(formData.get(`stageId_${index}`) || "").trim()
    const name = String(formData.get(`stageName_${index}`) || "").trim()
    if (!id || !name) continue
    const approverIds = formData.getAll(`stageApproverIds_${index}`).map(String).filter(Boolean)
    const minAmountRaw = String(formData.get(`stageMinAmount_${index}`) || "").trim()
    const minAmountParsed = minAmountRaw ? Number(minAmountRaw) : NaN
    const minAmount = Number.isFinite(minAmountParsed) && minAmountParsed >= 0 ? minAmountParsed : null
    stages.push({ id, name, requireOwner: formData.get(`stageRequireOwner_${index}`) === "on", approverIds, minAmount })
  }
  return stages
}

/** #328/#288: patches an existing flow's name and each existing stage's name/requireOwner/
 * approverIds/minAmount in place. Stage order and count stay fixed — updateApprovalWorkflowFields
 * rejects any payload whose stage id set doesn't exactly match what's already there. */
export async function updateApprovalWorkflowAction(workspaceId: string, workflowId: string, formData: FormData): Promise<ActionState<{ id: string }>> {
  const user = await getCurrentUser()
  if (!(await requireApprovalsOwner(workspaceId, user.id))) return { success: false, error: NO_ACCESS }
  const name = String(formData.get("name") || "").trim()
  if (!name) return { success: false, error: "Name the workflow" }
  const stages = parseStageRowsById(formData)
  if (!stages.length) return { success: false, error: "A flow needs at least one named stage" }
  try {
    const workflow = await updateApprovalWorkflowFields({ workspaceId, workflowId, name, stages })
    revalidatePath(paths(workspaceId).approvalWorkflowSettings)
    revalidatePath(adminPaths(workspaceId).approvalFlows)
    return { success: true, data: { id: workflow!.id } }
  } catch (error) { return { success: false, error: errorMessage(error, "Could not save the flow") } }
}

export async function createApprovalWorkflowAction(workspaceId: string, formData: FormData): Promise<ActionState<{ id: string }>> {
  const user = await getCurrentUser()
  if (!(await requireApprovalsOwner(workspaceId, user.id))) return { success: false, error: NO_ACCESS }
  const name = String(formData.get("name") || "").trim()
  if (!name) return { success: false, error: "Name the workflow" }
  const stages = parseStageRows(formData)
  if (!stages.length) return { success: false, error: "Add at least one named stage" }
  try {
    const workflow = await createApprovalWorkflow({ workspaceId, name, stages, createdById: user.id })
    revalidatePath(paths(workspaceId).approvalWorkflowSettings)
    revalidatePath(adminPaths(workspaceId).approvalFlows)
    return { success: true, data: { id: workflow.id } }
  } catch (error) { return { success: false, error: errorMessage(error, "Could not create the workflow") } }
}

export async function setApprovalWorkflowActiveAction(workspaceId: string, workflowId: string, active: boolean): Promise<ActionState<null>> {
  const user = await getCurrentUser()
  if (!(await requireApprovalsOwner(workspaceId, user.id))) return { success: false, error: NO_ACCESS }
  try {
    await updateApprovalWorkflow({ workspaceId, workflowId, active })
    revalidatePath(paths(workspaceId).approvalWorkflowSettings)
    revalidatePath(adminPaths(workspaceId).approvalFlows)
    return { success: true, data: null }
  } catch (error) { return { success: false, error: errorMessage(error, "Could not update the workflow") } }
}

export async function deleteApprovalWorkflowAction(workspaceId: string, workflowId: string): Promise<ActionState<null>> {
  const user = await getCurrentUser()
  if (!(await requireApprovalsOwner(workspaceId, user.id))) return { success: false, error: NO_ACCESS }
  try {
    await deleteApprovalWorkflow(workspaceId, workflowId)
    revalidatePath(paths(workspaceId).approvalWorkflowSettings)
    revalidatePath(adminPaths(workspaceId).approvalFlows)
    return { success: true, data: null }
  } catch (error) { return { success: false, error: errorMessage(error, "Could not delete the workflow") } }
}
