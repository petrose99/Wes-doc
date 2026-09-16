"use server"

import { ActionState } from "@/lib/actions"
import { getCurrentUser } from "@/lib/auth"
import { getWorkspaceCapabilities } from "@/lib/modules/capabilities"
import { prisma } from "@/lib/db"
import { cancelApprovalOnDocument, sendReviewTaskBackForReview } from "@/models/review-tasks"
import { startApprovalOnInvoice } from "@/models/approval-workflows"
import { revalidatePath } from "next/cache"
import { errorMessage, NO_ACCESS, paths, requireMember } from "../../action-helpers"

/** #236: the Approvals destination's own action surface, mirroring review-actions.ts's
 * `requireAccountingMember` gate — every action here requires the review-queue module, the same
 * capability the old /review route was gated on, since #236 folds that surface into this one. */
async function requireApprovalsMember(workspaceId: string, userId: string) {
  const membership = await requireMember(workspaceId, userId)
  if (!membership) return null
  if (!(await getWorkspaceCapabilities(workspaceId)).has("review-queue")) return null
  return membership
}

function revalidateApprovals(workspaceId: string) {
  revalidatePath(paths(workspaceId).approvalsInvoices)
  revalidatePath(paths(workspaceId).approvalsPoMismatches)
}

/** Decision #7's "Start Approval" bulk action: one `startApprovalOnInvoice` call per selected
 * invoice, so one already-in-flight document withholds only itself — the itemized receipt
 * (#185's pattern) is what tells the operator which ones actually started. */
export async function bulkStartApprovalsAction(workspaceId: string, documentIds: string[], workflowId: string): Promise<ActionState<{ started: string[]; skipped: string[] }>> {
  const user = await getCurrentUser()
  const membership = await requireApprovalsMember(workspaceId, user.id)
  if (!membership) return { success: false, error: NO_ACCESS }
  if (!(await getWorkspaceCapabilities(workspaceId)).has("approval-workflows")) return { success: false, error: NO_ACCESS }
  if (!documentIds.length) return { success: false, error: "Nothing selected" }
  const started: string[] = []
  const skipped: string[] = []
  for (const documentId of documentIds.slice(0, 200)) {
    try {
      await startApprovalOnInvoice({ workspaceId, documentId, workflowId, actorId: user.id })
      started.push(documentId)
    } catch {
      skipped.push(documentId)
    }
  }
  revalidateApprovals(workspaceId)
  return { success: true, data: { started, skipped } }
}

/** Decision #7's "Cancel": withdraws an Approval that hasn't had a single stage decided yet.
 * `cancelApprovalOnDocument` refuses once a stage has advanced, so a selection mixing fresh and
 * already-progressed Approvals only cancels the former — the rest land in `skipped`. */
export async function bulkCancelApprovalsAction(workspaceId: string, documentIds: string[]): Promise<ActionState<{ cancelled: string[]; skipped: string[] }>> {
  const user = await getCurrentUser()
  const membership = await requireApprovalsMember(workspaceId, user.id)
  if (!membership) return { success: false, error: NO_ACCESS }
  if (!documentIds.length) return { success: false, error: "Nothing selected" }
  const tasks = await prisma.reviewTask.findMany({
    where: { workspaceId, documentId: { in: documentIds.slice(0, 200) }, workflowId: { not: null }, status: "in_review" },
    select: { id: true, documentId: true },
  })
  const taskIdByDocument = new Map(tasks.map((task) => [task.documentId, task.id]))
  const cancelled: string[] = []
  const skipped: string[] = []
  for (const documentId of documentIds) {
    const taskId = taskIdByDocument.get(documentId)
    if (!taskId) { skipped.push(documentId); continue }
    try {
      await cancelApprovalOnDocument({ workspaceId, taskId, actorId: user.id })
      cancelled.push(documentId)
    } catch {
      skipped.push(documentId)
    }
  }
  revalidateApprovals(workspaceId)
  return { success: true, data: { cancelled, skipped } }
}

/** CONTEXT.md's "Send back for review" — the header-overflow action on the Approval tab
 * (decision #6). Always requires a reason; `sendReviewTaskBackForReview` is the model's own
 * refusal surface for a task that isn't actually mid-workflow. */
export async function sendApprovalBackForReviewAction(workspaceId: string, taskId: string, formData: FormData): Promise<ActionState<null>> {
  const user = await getCurrentUser()
  const membership = await requireApprovalsMember(workspaceId, user.id)
  if (!membership) return { success: false, error: NO_ACCESS }
  const reason = String(formData.get("reason") ?? "").trim()
  if (!reason) return { success: false, error: "A reason is required." }
  try {
    await sendReviewTaskBackForReview({ workspaceId, taskId, actorId: user.id, reason })
    revalidateApprovals(workspaceId)
    return { success: true, data: null }
  } catch (error) { return { success: false, error: errorMessage(error, "Could not send this back for review") } }
}
