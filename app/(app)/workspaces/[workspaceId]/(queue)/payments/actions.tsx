"use server"

import { revalidatePath } from "next/cache"
import { getCurrentUser } from "@/lib/auth"
import type { ActionState } from "@/lib/actions"
import { errorMessage, NO_ACCESS, requireMember } from "@/app/(app)/workspaces/[workspaceId]/action-helpers"
import { saveBillPayPreference, setPayFromOnRows } from "@/models/bill-pay"
import { validateAmountToPay } from "@/lib/payments/eligibility"
import {
  approvePaymentBatch, createPaymentBatches, getPaymentBatch, markClaimsPaid, markInvoicesPaid, markPaymentBatchPaid, rejectPaymentBatch, removePaymentRecord, removePaymentRecordsForClaim, removePaymentRecordsForDocument, unmarkPaymentBatchPaid,
  type CreateBatchesResult, type MarkClaimsPaidResult, type MarkPaidResult,
} from "@/models/payment-batches"
import { PaymentBatchDetail } from "@/components/payments/batch-detail"

/** #251: the Payments destination's server actions. Every refusal comes back as `ActionState`
 * so the queue renders it in place — nothing is thrown to `error.tsx` (the incumbent's P0). */

const MESSAGES: Record<string, string> = {
  owner_only: "Only an owner can decide a payment batch.",
  payment_batch_not_found: "That batch no longer exists.",
  payment_batch_not_pending: "This batch has already been decided.",
  payment_batch_not_approved: "This batch isn't approved yet, so it can't be marked paid.",
  reason_required: "A reason is required.",
  payer_account_not_found: "That payer account no longer exists.",
  payment_record_not_found: "That payment record no longer exists.",
  payment_batch_not_paid: "This batch isn't marked paid.",
  document_not_found: "That invoice no longer exists.",
}
const message = (error: unknown, fallback: string) => (error instanceof Error && MESSAGES[error.message]) || errorMessage(error, fallback)

const paths = (workspaceId: string) => ({
  billPay: `/workspaces/${workspaceId}/payments/bill-pay`,
  batches: `/workspaces/${workspaceId}/payments/batches`,
  invoices: `/workspaces/${workspaceId}/invoices`,
})

function revalidatePayments(workspaceId: string) {
  const p = paths(workspaceId)
  revalidatePath(p.billPay); revalidatePath(p.batches); revalidatePath(p.invoices)
  // The rail badge (batches pending approval) lives on the layout.
  revalidatePath("/workspaces/[workspaceId]", "layout")
}

export async function setAmountToPayAction(workspaceId: string, documentId: string, amount: number | null, due: number): Promise<ActionState<null>> {
  const user = await getCurrentUser()
  if (!(await requireMember(workspaceId, user.id))) return { success: false, error: NO_ACCESS }
  if (amount !== null) { const problem = validateAmountToPay(amount, due); if (problem) return { success: false, error: problem } }
  try {
    await saveBillPayPreference({ workspaceId, actorId: user.id, documentId, amountToPay: amount })
  } catch (error) { return { success: false, error: message(error, "Couldn't save the amount") } }
  revalidatePath(paths(workspaceId).billPay)
  return { success: true, data: null }
}

export async function setPayFromAction(workspaceId: string, documentIds: string[], payFromAccountId: string): Promise<ActionState<{ updated: number }>> {
  const user = await getCurrentUser()
  if (!(await requireMember(workspaceId, user.id))) return { success: false, error: NO_ACCESS }
  if (documentIds.length === 0) return { success: false, error: "Select at least one invoice." }
  try {
    await setPayFromOnRows({ workspaceId, actorId: user.id, documentIds, payFromAccountId })
  } catch (error) { return { success: false, error: message(error, "Couldn't set Pay From") } }
  revalidatePath(paths(workspaceId).billPay)
  return { success: true, data: { updated: documentIds.length } }
}

export async function createPaymentBatchesAction(workspaceId: string, input: { documentIds: string[]; name: string | null; comment: string | null }): Promise<ActionState<CreateBatchesResult>> {
  const user = await getCurrentUser()
  if (!(await requireMember(workspaceId, user.id))) return { success: false, error: NO_ACCESS }
  if (input.documentIds.length === 0) return { success: false, error: "Select at least one invoice." }
  try {
    const result = await createPaymentBatches({ workspaceId, actorId: user.id, documentIds: input.documentIds, name: input.name, comment: input.comment })
    revalidatePayments(workspaceId)
    return { success: true, data: result }
  } catch (error) { return { success: false, error: message(error, "Couldn't create the batch") } }
}

export async function markInvoicesPaidAction(workspaceId: string, input: { documentIds: string[]; paidOn: string; reference: string | null }): Promise<ActionState<MarkPaidResult>> {
  const user = await getCurrentUser()
  if (!(await requireMember(workspaceId, user.id, ["owner"]))) return { success: false, error: MESSAGES.owner_only }
  const paidOn = new Date(input.paidOn)
  if (Number.isNaN(paidOn.getTime())) return { success: false, error: "Enter the date the payment was made." }
  if (paidOn.getTime() > Date.now() + 24 * 60 * 60 * 1000) return { success: false, error: "The paid date can't be in the future." }
  try {
    const result = await markInvoicesPaid({ workspaceId, actorId: user.id, documentIds: input.documentIds, paidOn, reference: input.reference })
    revalidatePayments(workspaceId)
    return { success: true, data: result }
  } catch (error) { return { success: false, error: message(error, "Couldn't record the payment") } }
}

/** #331: the claim-row analog of markInvoicesPaidAction — same owner-only, same-day guard. */
export async function markClaimsPaidAction(workspaceId: string, input: { claimIds: string[]; paidOn: string; reference: string | null }): Promise<ActionState<MarkClaimsPaidResult>> {
  const user = await getCurrentUser()
  if (!(await requireMember(workspaceId, user.id, ["owner"]))) return { success: false, error: MESSAGES.owner_only }
  const paidOn = new Date(input.paidOn)
  if (Number.isNaN(paidOn.getTime())) return { success: false, error: "Enter the date the payment was made." }
  if (paidOn.getTime() > Date.now() + 24 * 60 * 60 * 1000) return { success: false, error: "The paid date can't be in the future." }
  try {
    const result = await markClaimsPaid({ workspaceId, actorId: user.id, claimIds: input.claimIds, paidOn, reference: input.reference })
    revalidatePayments(workspaceId)
    return { success: true, data: result }
  } catch (error) { return { success: false, error: message(error, "Couldn't record the payment") } }
}

/** #331: the claim-row analog of removePaymentRecordsForDocumentAction. */
export async function removePaymentRecordsForClaimAction(workspaceId: string, claimId: string, formData: FormData): Promise<ActionState<{ removed: number; batchHeld: number }>> {
  const user = await getCurrentUser()
  if (!(await requireMember(workspaceId, user.id, ["owner"]))) return { success: false, error: MESSAGES.owner_only }
  const reason = String(formData.get("reason") || "").trim()
  if (!reason) return { success: false, error: MESSAGES.reason_required }
  try {
    const result = await removePaymentRecordsForClaim({ workspaceId, actorId: user.id, claimId, reason })
    revalidatePayments(workspaceId)
    if (result.removed === 0) return { success: false, error: "These payments were recorded by a batch — remove them from the batch on Payment Batches." }
    return { success: true, data: result }
  } catch (error) { return { success: false, error: message(error, "Couldn't remove the payment records") } }
}

export async function approvePaymentBatchAction(workspaceId: string, batchId: string): Promise<ActionState<null>> {
  const user = await getCurrentUser()
  if (!(await requireMember(workspaceId, user.id, ["owner"]))) return { success: false, error: MESSAGES.owner_only }
  try {
    await approvePaymentBatch({ workspaceId, actorId: user.id, batchId })
  } catch (error) { return { success: false, error: message(error, "Couldn't approve this batch") } }
  revalidatePayments(workspaceId)
  return { success: true, data: null }
}

export async function rejectPaymentBatchAction(workspaceId: string, batchId: string, formData: FormData): Promise<ActionState<null>> {
  const user = await getCurrentUser()
  if (!(await requireMember(workspaceId, user.id, ["owner"]))) return { success: false, error: MESSAGES.owner_only }
  const reason = String(formData.get("reason") || "").trim()
  if (!reason) return { success: false, error: MESSAGES.reason_required }
  try {
    await rejectPaymentBatch({ workspaceId, actorId: user.id, batchId, reason })
  } catch (error) { return { success: false, error: message(error, "Couldn't reject this batch") } }
  revalidatePayments(workspaceId)
  return { success: true, data: null }
}

export async function markPaymentBatchPaidAction(workspaceId: string, batchId: string, input: { paidOn: string; reference: string | null }): Promise<ActionState<null>> {
  const user = await getCurrentUser()
  if (!(await requireMember(workspaceId, user.id, ["owner"]))) return { success: false, error: MESSAGES.owner_only }
  const paidOn = new Date(input.paidOn)
  if (Number.isNaN(paidOn.getTime())) return { success: false, error: "Enter the date the payment was made." }
  if (paidOn.getTime() > Date.now() + 24 * 60 * 60 * 1000) return { success: false, error: "The paid date can't be in the future." }
  try {
    await markPaymentBatchPaid({ workspaceId, actorId: user.id, batchId, paidOn, reference: input.reference })
  } catch (error) { return { success: false, error: message(error, "Couldn't mark this batch paid") } }
  revalidatePayments(workspaceId)
  return { success: true, data: null }
}

export async function removePaymentRecordAction(workspaceId: string, paymentId: string, formData: FormData): Promise<ActionState<null>> {
  const user = await getCurrentUser()
  if (!(await requireMember(workspaceId, user.id, ["owner"]))) return { success: false, error: MESSAGES.owner_only }
  const reason = String(formData.get("reason") || "").trim()
  if (!reason) return { success: false, error: MESSAGES.reason_required }
  try {
    await removePaymentRecord({ workspaceId, actorId: user.id, paymentId, reason })
  } catch (error) { return { success: false, error: message(error, "Couldn't remove this payment record") } }
  revalidatePayments(workspaceId)
  return { success: true, data: null }
}

export async function removePaymentRecordsForDocumentAction(workspaceId: string, documentId: string, formData: FormData): Promise<ActionState<{ removed: number; batchHeld: number }>> {
  const user = await getCurrentUser()
  if (!(await requireMember(workspaceId, user.id, ["owner"]))) return { success: false, error: MESSAGES.owner_only }
  const reason = String(formData.get("reason") || "").trim()
  if (!reason) return { success: false, error: MESSAGES.reason_required }
  try {
    const result = await removePaymentRecordsForDocument({ workspaceId, actorId: user.id, documentId, reason })
    revalidatePayments(workspaceId)
    if (result.removed === 0) return { success: false, error: "These payments were recorded by a batch — remove them from the batch on Payment Batches." }
    return { success: true, data: result }
  } catch (error) { return { success: false, error: message(error, "Couldn't remove the payment records") } }
}

export async function unmarkPaymentBatchPaidAction(workspaceId: string, batchId: string, formData: FormData): Promise<ActionState<null>> {
  const user = await getCurrentUser()
  if (!(await requireMember(workspaceId, user.id, ["owner"]))) return { success: false, error: MESSAGES.owner_only }
  const reason = String(formData.get("reason") || "").trim()
  if (!reason) return { success: false, error: MESSAGES.reason_required }
  try {
    await unmarkPaymentBatchPaid({ workspaceId, actorId: user.id, batchId, reason })
  } catch (error) { return { success: false, error: message(error, "Couldn't remove the batch's payment records") } }
  revalidatePayments(workspaceId)
  return { success: true, data: null }
}

/** The Payment Batches queue's Detail pane content — the batch, its supplier-grouped lines, the
 * remittance advices and the Audit tab. Null for a member-less caller or a missing batch so the
 * pane says so instead of the route error boundary taking the queue down. */
export async function getPaymentBatchDetailAction(workspaceId: string, batchId: string) {
  const user = await getCurrentUser()
  const membership = await requireMember(workspaceId, user.id)
  if (!membership) return null
  const detail = await getPaymentBatch({ workspaceId, batchId })
  if (!detail) return <p className="p-6 text-sm text-slate-700">This batch no longer exists. Close the pane and refresh the queue.</p>
  return <PaymentBatchDetail workspaceId={workspaceId} detail={serializeDetail(detail)} currentUserId={user.id} isOwner={membership.role === "owner"} />
}

/** Dates cross the RSC boundary fine, but the pane's props must be plain for the client component. */
function serializeDetail(detail: NonNullable<Awaited<ReturnType<typeof getPaymentBatch>>>) {
  return detail
}
