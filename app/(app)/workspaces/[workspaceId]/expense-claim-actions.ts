"use server"

import { ActionState } from "@/lib/actions"
import { getCurrentUser } from "@/lib/auth"
import { getWorkspaceCapabilities } from "@/lib/modules/capabilities"
import {
  addExpenseClaimItems, addToExpenseClaim, createExpenseClaim, decideExpenseClaimStage, deleteExpenseClaim, getExpenseClaimDetail,
  listMyDraftClaims, removeExpenseClaimItem, submitExpenseClaim, updateExpenseClaimStatus, withdrawExpenseClaim,
} from "@/models/expense-claims"
import { getDefaultApprovalFlow } from "@/models/approval-defaults"
import { claimRefusalSentence } from "@/lib/claims/refusals"
import type { AddToClaimResult, DocumentClaimFacts, DraftClaimOption } from "@/lib/claims/facts"
import type { WorkspaceRole } from "@/models/workspaces"
import { revalidatePath } from "next/cache"
import { NO_ACCESS, paths, requireMember } from "./action-helpers"

/** Every action here requires the expense-approvals module — same server-side mirror of the
 * sidebar gate as review-actions.ts's requireAccountingMember. */
async function requireExpenseClaimsMember(workspaceId: string, userId: string) {
  const membership = await requireMember(workspaceId, userId)
  if (!membership) return null
  if (!(await getWorkspaceCapabilities(workspaceId)).has("expense-approvals")) return null
  return membership
}

function revalidateExpenseClaims(workspaceId: string) {
  revalidatePath(paths(workspaceId).receipts)
  revalidatePath(paths(workspaceId).expenses)
  revalidatePath(`/workspaces/${workspaceId}/approvals/expense-claims`)
}

export async function createExpenseClaimAction(workspaceId: string, formData: FormData): Promise<ActionState<{ id: string }>> {
  const user = await getCurrentUser()
  if (!(await requireExpenseClaimsMember(workspaceId, user.id))) return { success: false, error: NO_ACCESS }
  const title = String(formData.get("title") || "").trim()
  const documentIds = formData.getAll("documentIds").map(String).filter(Boolean)
  if (!documentIds.length) return { success: false, error: "Select at least one receipt" }
  try {
    const claim = await createExpenseClaim({ workspaceId, submitterId: user.id, title: title || null, documentIds })
    revalidateExpenseClaims(workspaceId)
    return { success: true, data: { id: claim.id } }
  } catch (error) { return { success: false, error: refusal(error) } }
}

/** A draft can only be deleted by whoever submitted it, or a workspace owner — same "yours, or an
 * owner's call" bar as canCreateRule elsewhere, since a claim is personal until it's decided. */
export async function deleteExpenseClaimAction(workspaceId: string, claimId: string, submitterId: string | null): Promise<ActionState<null>> {
  const user = await getCurrentUser()
  const membership = await requireExpenseClaimsMember(workspaceId, user.id)
  if (!membership) return { success: false, error: NO_ACCESS }
  if (submitterId !== user.id && membership.role !== "owner") return { success: false, error: NO_ACCESS }
  try {
    await deleteExpenseClaim(workspaceId, claimId)
    revalidateExpenseClaims(workspaceId)
    return { success: true, data: null }
  } catch (error) { return { success: false, error: refusal(error) } }
}

/** "Yours, or an owner's call" — same bar as delete/submit, since a draft is still personal to
 * whoever's assembling it. */
export async function addExpenseClaimItemsAction(workspaceId: string, claimId: string, submitterId: string | null, documentIds: string[]): Promise<ActionState<null>> {
  const user = await getCurrentUser()
  const membership = await requireExpenseClaimsMember(workspaceId, user.id)
  if (!membership) return { success: false, error: NO_ACCESS }
  if (submitterId !== user.id && membership.role !== "owner") return { success: false, error: NO_ACCESS }
  try {
    await addExpenseClaimItems(workspaceId, claimId, documentIds)
    revalidateExpenseClaims(workspaceId)
    return { success: true, data: null }
  } catch (error) { return { success: false, error: refusal(error) } }
}

export async function removeExpenseClaimItemAction(workspaceId: string, claimId: string, submitterId: string | null, itemId: string): Promise<ActionState<null>> {
  const user = await getCurrentUser()
  const membership = await requireExpenseClaimsMember(workspaceId, user.id)
  if (!membership) return { success: false, error: NO_ACCESS }
  if (submitterId !== user.id && membership.role !== "owner") return { success: false, error: NO_ACCESS }
  try {
    await removeExpenseClaimItem(workspaceId, claimId, itemId)
    revalidateExpenseClaims(workspaceId)
    return { success: true, data: null }
  } catch (error) { return { success: false, error: refusal(error) } }
}

/** Every refusal is a sentence naming the receipt where the server knows it (spec §2). */
function refusal(error: unknown): string {
  const code = error instanceof Error ? error.message : String(error)
  const merchant = error && typeof error === "object" && "merchant" in error ? (error as { merchant?: string }).merchant : null
  return claimRefusalSentence(code, merchant)
}

/** The workflow is the workspace's default flow (#253), resolved server-side at submit time. */
export async function submitExpenseClaimAction(workspaceId: string, claimId: string, submitterId: string | null): Promise<ActionState<null>> {
  const user = await getCurrentUser()
  const membership = await requireExpenseClaimsMember(workspaceId, user.id)
  if (!membership) return { success: false, error: NO_ACCESS }
  if (submitterId !== user.id && membership.role !== "owner") return { success: false, error: NO_ACCESS }
  try {
    const flow = await getDefaultApprovalFlow(workspaceId)
    await submitExpenseClaim({ workspaceId, claimId, actorId: user.id, workflowId: flow?.active ? flow.id : null })
    revalidateExpenseClaims(workspaceId)
    return { success: true, data: null }
  } catch (error) { return { success: false, error: refusal(error) } }
}

/** Deciding a claim — plain or workflow-staged — is never the submitter's own call: unlike
 * create/delete/submit, which are "this is your claim", a decision is someone else reviewing it.
 * Both decideExpenseClaimStage and updateExpenseClaimStatus already refuse the wrong claim state
 * on their own; this just picks which one applies. */
export async function decideExpenseClaimAction(workspaceId: string, claimId: string, hasWorkflow: boolean, decision: "approve" | "reject", reason?: string | null): Promise<ActionState<null>> {
  const user = await getCurrentUser()
  const membership = await requireExpenseClaimsMember(workspaceId, user.id)
  if (!membership) return { success: false, error: NO_ACCESS }
  const actorRole = membership.role === "owner" ? "owner" : "member"
  try {
    if (hasWorkflow) {
      await decideExpenseClaimStage({ workspaceId, claimId, decision, actorId: user.id, actorRole, reason })
    } else {
      if (actorRole !== "owner") return { success: false, error: claimRefusalSentence("stage_requires_owner") }
      await updateExpenseClaimStatus({ workspaceId, claimId, status: decision === "approve" ? "approved" : "rejected", actorId: user.id, reason })
    }
    revalidateExpenseClaims(workspaceId)
    return { success: true, data: null }
  } catch (error) { return { success: false, error: refusal(error) } }
}

/** S2: add the selected receipts to a new or existing draft — the model holds back what it can't add. */
export async function addToExpenseClaimAction(workspaceId: string, input: { documentIds: string[]; target: { new: { title?: string | null } } | { claimId: string } }): Promise<ActionState<AddToClaimResult>> {
  const user = await getCurrentUser()
  const membership = await requireExpenseClaimsMember(workspaceId, user.id)
  if (!membership) return { success: false, error: NO_ACCESS }
  try {
    const result = await addToExpenseClaim({ workspaceId, actorId: user.id, documentIds: input.documentIds, target: input.target })
    revalidateExpenseClaims(workspaceId)
    return { success: true, data: result }
  } catch (error) { return { success: false, error: refusal(error) } }
}

export async function withdrawExpenseClaimAction(workspaceId: string, claimId: string, submitterId: string | null): Promise<ActionState<null>> {
  const user = await getCurrentUser()
  const membership = await requireExpenseClaimsMember(workspaceId, user.id)
  if (!membership) return { success: false, error: NO_ACCESS }
  if (submitterId !== user.id && membership.role !== "owner") return { success: false, error: NO_ACCESS }
  try {
    await withdrawExpenseClaim({ workspaceId, claimId, actorId: user.id })
    revalidateExpenseClaims(workspaceId)
    return { success: true, data: null }
  } catch (error) { return { success: false, error: refusal(error) } }
}

export async function listMyDraftClaimsAction(workspaceId: string): Promise<ActionState<DraftClaimOption[]>> {
  const user = await getCurrentUser()
  const membership = await requireExpenseClaimsMember(workspaceId, user.id)
  if (!membership) return { success: false, error: NO_ACCESS }
  try {
    return { success: true, data: await listMyDraftClaims(workspaceId, user.id) }
  } catch (error) { return { success: false, error: refusal(error) } }
}

export async function getExpenseClaimDetailAction(workspaceId: string, claimId: string): Promise<ActionState<DocumentClaimFacts | null>> {
  const user = await getCurrentUser()
  const membership = await requireExpenseClaimsMember(workspaceId, user.id)
  if (!membership) return { success: false, error: NO_ACCESS }
  try {
    return { success: true, data: await getExpenseClaimDetail(workspaceId, claimId, { userId: user.id, role: membership.role as WorkspaceRole }) }
  } catch (error) { return { success: false, error: refusal(error) } }
}
