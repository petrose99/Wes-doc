"use server"

import { ActionState } from "@/lib/actions"
import { isPaidStatus, isPaymentConfirmationRequired, isPushableDocument } from "@/lib/doc-types"
import { canDecideStage, findCurrentStage } from "@/lib/approvals/engine"
import { maybeAutopublish } from "@/lib/automation/autopublish"
import { refreshDocumentReadiness } from "@/lib/readiness/refresh"
import { creditSupplierForCleanApproval } from "@/models/suppliers"
import { getCurrentUser } from "@/lib/auth"
import { parseTemplateFields } from "@/lib/document-templates"
import { learnSupplierAccountRuleFromApproval, setDocumentPaymentStatus } from "@/models/documents"
import { getWorkspaceCapabilities } from "@/lib/modules/capabilities"
import { prisma } from "@/lib/db"
import { listApprovalWorkflows, startWorkflowOnReviewTask } from "@/models/approval-workflows"
import { listWorkspaceIntegrationConnections } from "@/models/integrations"
import { assignReviewTask, bulkUpdateReviewTaskStatus, createReviewTask, decideReviewTaskStage, getReviewTask, maybeConfirmAiCoding, parseReviewTaskStatus, updateReviewTaskStatus } from "@/models/review-tasks"
import { revalidatePath } from "next/cache"
import { errorMessage, NO_ACCESS, paths, requireMember } from "./action-helpers"

/** Review-queue actions, kept out of actions.ts for the same reason dictation-actions.ts is: a
 * smaller "use server" surface is easier to audit for what it lets a caller do. Every action here
 * requires the review-queue module — a workspace without it has no review queue (the sidebar
 * already omits the entry; this is the same gate on the server side, since a URL can be guessed). */
async function requireAccountingMember(workspaceId: string, userId: string) {
  const membership = await requireMember(workspaceId, userId)
  if (!membership) return null
  if (!(await getWorkspaceCapabilities(workspaceId)).has("review-queue")) return null
  return membership
}

export async function createReviewTaskAction(workspaceId: string, documentId: string, detail: string): Promise<ActionState<{ id: string }>> {
  const user = await getCurrentUser()
  if (!(await requireAccountingMember(workspaceId, user.id))) return { success: false, error: NO_ACCESS }
  try {
    const task = await createReviewTask({ workspaceId, documentId, reason: "manual", detail: detail.trim() || null, createdById: user.id })
    revalidatePath(paths(workspaceId).review)
    return { success: true, data: { id: task.id } }
  } catch (error) { return { success: false, error: errorMessage(error, "Could not create a review task") } }
}

export async function updateReviewTaskStatusAction(workspaceId: string, taskId: string, status: string): Promise<ActionState<null>> {
  const user = await getCurrentUser()
  if (!(await requireAccountingMember(workspaceId, user.id))) return { success: false, error: NO_ACCESS }
  const parsed = parseReviewTaskStatus(status)
  if (!parsed) return { success: false, error: "Invalid status" }
  try {
    const task = await updateReviewTaskStatus({ workspaceId, taskId, status: parsed, actorId: user.id })
    if (parsed === "approved") await maybeConfirmAiCoding(workspaceId, task.documentId, user.id)
    // A1.1: an approval the reviewer made no corrections on is the signal the clean streak is
    // meant to measure. Credited before readiness re-runs so this document is judged against the
    // threshold its own approval just earned.
    if (parsed === "approved") await creditSupplierForCleanApproval(workspaceId, task.documentId)
    if (parsed === "approved") await learnSupplierAccountRuleFromApproval(workspaceId, task.documentId)
    await refreshDocumentReadiness({ workspaceId, documentId: task.documentId })
    if (parsed === "approved") await maybeAutopublish(workspaceId, task.documentId, user.id)
    revalidatePath(paths(workspaceId).review)
    return { success: true, data: null }
  } catch (error) { return { success: false, error: errorMessage(error, "Could not update the review task") } }
}

export async function bulkUpdateReviewTaskStatusAction(workspaceId: string, taskIds: string[], status: string): Promise<ActionState<{ updated: number; blockedTaskIds: string[] }>> {
  const user = await getCurrentUser()
  if (!(await requireAccountingMember(workspaceId, user.id))) return { success: false, error: NO_ACCESS }
  const parsed = parseReviewTaskStatus(status)
  if (!parsed) return { success: false, error: "Invalid status" }
  if (!taskIds.length) return { success: false, error: "Nothing selected" }
  try {
    // A bulk approve withholds one document at a time for a missing payment confirmation rather
    // than failing outright — see bulkUpdateReviewTaskStatus. blockedTaskIds is what lets the
    // client revert its optimistic state for exactly the rows that did not move.
    const result = await bulkUpdateReviewTaskStatus({ workspaceId, taskIds, status: parsed, actorId: user.id })
    if (parsed === "approved") await Promise.all(result.documentIds.map((documentId) => maybeConfirmAiCoding(workspaceId, documentId, user.id)))
    if (parsed === "approved") await Promise.all(result.documentIds.map((documentId) => creditSupplierForCleanApproval(workspaceId, documentId)))
    if (parsed === "approved") await Promise.all(result.documentIds.map((documentId) => learnSupplierAccountRuleFromApproval(workspaceId, documentId)))
    await Promise.all(result.documentIds.map((documentId) => refreshDocumentReadiness({ workspaceId, documentId })))
    if (parsed === "approved") await Promise.all(result.documentIds.map((documentId) => maybeAutopublish(workspaceId, documentId, user.id)))
    revalidatePath(paths(workspaceId).review)
    return { success: true, data: { updated: result.updated, blockedTaskIds: result.blockedTaskIds } }
  } catch (error) { return { success: false, error: errorMessage(error, "Could not update the selected review tasks") } }
}

/** A reviewer's paid/unpaid confirmation, separate from the status-change action above so setting
 * it never has to also be a status change — it can happen well before the task is decided, or
 * after, to correct an earlier answer. */
export async function setDocumentPaymentStatusAction(workspaceId: string, documentId: string, status: string): Promise<ActionState<null>> {
  const user = await getCurrentUser()
  if (!(await requireAccountingMember(workspaceId, user.id))) return { success: false, error: NO_ACCESS }
  if (!isPaidStatus(status)) return { success: false, error: "Invalid payment status" }
  try {
    await setDocumentPaymentStatus({ workspaceId, documentId, status, actorId: user.id })
    revalidatePath(paths(workspaceId).review)
    return { success: true, data: null }
  } catch (error) { return { success: false, error: errorMessage(error, "Could not record payment status") } }
}

/** Everything the split-view detail pane (components/workspace/review-inbox.tsx) needs for one
 * task, in a single round trip: the source preview info, extracted fields/values, non-passing
 * checks, and whether/where this document can be pushed — so the client doesn't have to fetch a
 * document, its checks, and its connections separately every time the selection changes. */
export async function getReviewTaskDetailAction(workspaceId: string, taskId: string) {
  const user = await getCurrentUser()
  const membership = await requireAccountingMember(workspaceId, user.id)
  if (!membership) return null
  const task = await getReviewTask(workspaceId, taskId)
  if (!task) return null

  const capabilities = await getWorkspaceCapabilities(workspaceId)
  const fields = parseTemplateFields(task.document.fieldSnapshot)
  const values = (task.document.reviewedData ?? task.document.rawExtraction ?? {}) as Record<string, unknown>
  const workflowsEnabled = capabilities.has("approval-workflows")
  const [checkResults, connections, appliedRule, template, availableWorkflows, lastPush, stageDecisionEvents] = await Promise.all([
    prisma.documentCheckResult.findMany({ where: { workspaceId, documentId: task.document.id }, orderBy: { checkCode: "asc" } }),
    capabilities.has("accounting-push") ? listWorkspaceIntegrationConnections(workspaceId) : Promise.resolve([]),
    task.document.appliedRuleId ? prisma.automationRule.findUnique({ where: { id: task.document.appliedRuleId }, select: { name: true } }) : Promise.resolve(null),
    task.document.templateId ? prisma.documentTemplate.findUnique({ where: { id: task.document.templateId }, select: { code: true } }) : Promise.resolve(null),
    workflowsEnabled ? listApprovalWorkflows(workspaceId, { activeOnly: true }) : Promise.resolve([]),
    // Server-side hydration for the push receipt: the most recent succeeded push for this
    // document, if any. Without it, a hard reload after a push wiped the client-side receipt
    // and the peak "money moved here, at this time" moment vanished with it.
    capabilities.has("accounting-push") ? prisma.integrationPush.findFirst({
      where: { workspaceId, documentId: task.document.id, status: "succeeded" },
      orderBy: { completedAt: "desc" },
      select: { completedAt: true, provider: true, connection: { select: { tenantName: true, provider: true } } },
    }) : Promise.resolve(null),
    // #209: per-actor decision history for the mobile approval timeline — sourced from the audit
    // trail decideReviewTaskStage already writes, rather than a new table.
    workflowsEnabled && task.workflowId ? prisma.documentAuditEvent.findMany({
      where: { workspaceId, documentId: task.document.id, type: "review_task_stage_decided" },
      orderBy: { createdAt: "asc" },
      select: { detail: true, createdAt: true, actor: { select: { name: true, email: true } } },
    }) : Promise.resolve([]),
  ])
  const activeConnection = connections.find((connection) => connection.status === "connected") ?? null
  const canPush = task.document.status === "reviewed" && Boolean(activeConnection)
    && isPushableDocument({ docType: task.document.docType, template })
  const supplierValue = values.vendor ?? values.merchant
  const supplier = typeof supplierValue === "string" ? supplierValue.trim() : ""

  // Stage progress for a task already on a workflow — null for a plain task, which keeps using
  // the four-button status control unchanged. canDecideCurrentStage folds in the actor's own role
  // so the client never has to re-derive the "owner" gate itself.
  const workflow = task.workflow && task.currentStageIndex !== null ? (() => {
    const stages = task.workflow!.stages.map((stage) => ({ stageIndex: stage.stageIndex, name: stage.name, requireOwner: stage.requireOwner, approverIds: stage.approverIds ?? [], minAmount: stage.minAmount !== null && stage.minAmount !== undefined ? Number(stage.minAmount) : null }))
    const currentStage = findCurrentStage(stages, task.currentStageIndex!)
    // Per-stage actor + decision, for the mobile vertical timeline (#209) — the desktop chain only
    // ever needed the current stage's name, but a timeline has to show who cleared each prior one.
    const decisions = stageDecisionEvents.map((event) => {
      const detail = event.detail as { stageIndex: number; stageName: string; decision: "approve" | "reject" } | null
      return detail ? { stageIndex: detail.stageIndex, stageName: detail.stageName, decision: detail.decision, actorName: event.actor?.name || event.actor?.email || "Unknown", decidedAt: event.createdAt.toISOString() } : null
    }).filter((decision): decision is NonNullable<typeof decision> => decision !== null)
    return {
      id: task.workflow!.id, name: task.workflow!.name, stages, currentStageIndex: task.currentStageIndex!,
      canDecideCurrentStage: currentStage ? canDecideStage({ stage: currentStage, actorRole: membership.role === "owner" ? "owner" : "member", actorId: user.id }) : false,
      decisions,
    }
  })() : null

  const codingSource = (task.document as Record<string, unknown>).codingSource as string | null
  const codingConfidence = (task.document as Record<string, unknown>).codingConfidence as number | null

  return {
    id: task.id, status: task.status, assigneeId: task.assigneeId, detail: task.detail,
    reason: task.reason,
    document: {
      id: task.document.id, filename: task.document.filename, mimeType: task.document.mimeType,
      storageKey: task.document.storageKey, status: task.document.status,
      fields: fields.filter((field) => field.type !== "array"),
      values,
      supplier,
      codingSource,
      codingConfidence,
      paymentStatus: task.document.paymentStatus as "paid" | "unpaid" | null,
      // Same doc-type read isPushableDocument above already made, reused rather than resolved
      // twice — see lib/doc-types.ts's isPaymentConfirmationRequired for what it actually checks.
      paymentConfirmationRequired: isPaymentConfirmationRequired({ docType: task.document.docType, template }),
    },
    checkResults: checkResults.map((check) => ({ id: check.id, checkCode: check.checkCode, status: check.status, message: check.message })),
    appliedRuleName: appliedRule?.name ?? null,
    canPush,
    activeConnectionId: activeConnection?.id ?? null,
    // Provider/tenant so the client can render a real "Pushed to <destination>" receipt after a
    // successful push, rather than a disabled button being the whole confirmation.
    activeConnection: activeConnection ? { provider: activeConnection.provider, name: activeConnection.tenantName || activeConnection.provider } : null,
    // Prior successful push, so the receipt survives a hard reload. `completedAt` can be null on
    // a very old row where the field wasn't backfilled; guard against that. The destination
    // name is read off the push's own connection (which may differ from activeConnection if the
    // workspace has since reconnected under a new tenant).
    lastSuccessfulPush: lastPush && lastPush.completedAt ? {
      destination: lastPush.connection?.tenantName || lastPush.connection?.provider || lastPush.provider,
      at: lastPush.completedAt.toISOString(),
    } : null,
    canCreateRule: capabilities.has("supplier-rules") && membership.role === "owner" && supplier.length > 0,
    workflow,
    availableWorkflows: task.status === "open" && !task.workflowId ? availableWorkflows.map((wf) => ({ id: wf.id, name: wf.name, stageCount: wf.stages.length })) : [],
  }
}

/** Attaches an existing workflow to an open, plain (no-workflow-yet) task — see
 * models/approval-workflows.ts's startWorkflowOnReviewTask for the state it refuses. */
export async function startWorkflowOnReviewTaskAction(workspaceId: string, taskId: string, workflowId: string): Promise<ActionState<null>> {
  const user = await getCurrentUser()
  if (!(await requireAccountingMember(workspaceId, user.id))) return { success: false, error: NO_ACCESS }
  if (!(await getWorkspaceCapabilities(workspaceId)).has("approval-workflows")) return { success: false, error: NO_ACCESS }
  try {
    await startWorkflowOnReviewTask({ workspaceId, taskId, workflowId, actorId: user.id })
    revalidatePath(paths(workspaceId).review)
    return { success: true, data: null }
  } catch (error) { return { success: false, error: errorMessage(error, "Could not start that workflow") } }
}

/** The workflow-aware counterpart to updateReviewTaskStatusAction — approve/reject the task's
 * *current* stage rather than writing a status directly. Autopublish fires the same way, only once
 * the decision actually resolves the task as "approved" (the last stage clearing), never on an
 * intermediate stage advance. */
export async function decideReviewTaskStageAction(workspaceId: string, taskId: string, decision: "approve" | "reject", note?: string): Promise<ActionState<null>> {
  const user = await getCurrentUser()
  const membership = await requireAccountingMember(workspaceId, user.id)
  if (!membership) return { success: false, error: NO_ACCESS }
  if (note && note.length > 2_000) return { success: false, error: "Note is too long" }
  try {
    const task = await decideReviewTaskStage({ workspaceId, taskId, decision, actorId: user.id, actorRole: membership.role === "owner" ? "owner" : "member", note: note ?? null })
    if (task.status === "approved") await maybeConfirmAiCoding(workspaceId, task.documentId, user.id)
    if (task.status === "approved") await learnSupplierAccountRuleFromApproval(workspaceId, task.documentId)
    await refreshDocumentReadiness({ workspaceId, documentId: task.documentId })
    if (task.status === "approved") await maybeAutopublish(workspaceId, task.documentId, user.id)
    revalidatePath(paths(workspaceId).review)
    return { success: true, data: null }
  } catch (error) { return { success: false, error: errorMessage(error, "Could not record that decision") } }
}

export async function assignReviewTaskAction(workspaceId: string, taskId: string, assigneeId: string | null): Promise<ActionState<null>> {
  const user = await getCurrentUser()
  if (!(await requireAccountingMember(workspaceId, user.id))) return { success: false, error: NO_ACCESS }
  try {
    await assignReviewTask({ workspaceId, taskId, assigneeId, actorId: user.id })
    revalidatePath(paths(workspaceId).review)
    return { success: true, data: null }
  } catch (error) { return { success: false, error: errorMessage(error, "Could not assign the review task") } }
}
