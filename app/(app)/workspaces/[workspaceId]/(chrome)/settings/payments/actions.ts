"use server"

import { revalidatePath } from "next/cache"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { recordDocumentAudit } from "@/lib/audit"
import type { ActionState } from "@/lib/actions"
import { errorMessage, requireMember } from "@/app/(app)/workspaces/[workspaceId]/action-helpers"
import { archivePayerAccount, createPayerAccount, setDefaultPayerAccount, updatePayerAccount } from "@/models/payer-accounts"

/** #229 Q4/Q5 (#251): Settings › Payments — payer accounts and each supplier's payment terms,
 * discount and bank account. Owner-only writes; refusals come back as ActionState. */

const MESSAGES: Record<string, string> = {
  owner_only: "Only a workspace owner can change payment settings.",
  payer_account_name_required: "Give the account a name.",
  payer_account_currency_invalid: "Currency must be a three-letter code, like ZAR.",
  payer_account_not_found: "That payer account no longer exists.",
  supplier_not_found: "That supplier no longer exists.",
}
const message = (error: unknown, fallback: string) => (error instanceof Error && MESSAGES[error.message]) || errorMessage(error, fallback)

function revalidate(workspaceId: string) {
  revalidatePath(`/workspaces/${workspaceId}/admin/configuration/payments`)
  revalidatePath(`/workspaces/${workspaceId}/admin/suppliers`)
  revalidatePath(`/workspaces/${workspaceId}/payments/bill-pay`)
}

export async function createPayerAccountAction(workspaceId: string, formData: FormData): Promise<ActionState<null>> {
  const user = await getCurrentUser()
  if (!(await requireMember(workspaceId, user.id, ["owner"]))) return { success: false, error: MESSAGES.owner_only }
  try {
    await createPayerAccount({
      workspaceId, actorId: user.id,
      name: String(formData.get("name") ?? ""), bankName: String(formData.get("bankName") ?? "") || null, lastFour: String(formData.get("lastFour") ?? "") || null,
      currencyCode: String(formData.get("currencyCode") ?? ""), isDefault: formData.get("isDefault") === "on",
    })
  } catch (error) { return { success: false, error: message(error, "Couldn't add the payer account") } }
  revalidate(workspaceId)
  return { success: true, data: null }
}

export async function updatePayerAccountAction(workspaceId: string, accountId: string, formData: FormData): Promise<ActionState<null>> {
  const user = await getCurrentUser()
  if (!(await requireMember(workspaceId, user.id, ["owner"]))) return { success: false, error: MESSAGES.owner_only }
  try {
    await updatePayerAccount({
      workspaceId, actorId: user.id, accountId,
      name: String(formData.get("name") ?? ""), bankName: String(formData.get("bankName") ?? "") || null, lastFour: String(formData.get("lastFour") ?? "") || null,
      currencyCode: String(formData.get("currencyCode") ?? ""),
    })
  } catch (error) { return { success: false, error: message(error, "Couldn't save the payer account") } }
  revalidate(workspaceId)
  return { success: true, data: null }
}

export async function setDefaultPayerAccountAction(workspaceId: string, accountId: string): Promise<ActionState<null>> {
  const user = await getCurrentUser()
  if (!(await requireMember(workspaceId, user.id, ["owner"]))) return { success: false, error: MESSAGES.owner_only }
  try { await setDefaultPayerAccount({ workspaceId, actorId: user.id, accountId }) } catch (error) { return { success: false, error: message(error, "Couldn't set the default") } }
  revalidate(workspaceId)
  return { success: true, data: null }
}

export async function archivePayerAccountAction(workspaceId: string, accountId: string): Promise<ActionState<null>> {
  const user = await getCurrentUser()
  if (!(await requireMember(workspaceId, user.id, ["owner"]))) return { success: false, error: MESSAGES.owner_only }
  try { await archivePayerAccount({ workspaceId, actorId: user.id, accountId }) } catch (error) { return { success: false, error: message(error, "Couldn't archive the account") } }
  revalidate(workspaceId)
  return { success: true, data: null }
}

/** A supplier's payment terms (net days, early-payment discount) and bank account — the fields
 * Bill Pay reads. Bank details live in the supplier's `bankDetails` JSON the payment file reads
 * (`account`, `branchCode`). */
export async function updateSupplierPaymentsAction(workspaceId: string, supplierId: string, formData: FormData): Promise<ActionState<null>> {
  const user = await getCurrentUser()
  if (!(await requireMember(workspaceId, user.id, ["owner"]))) return { success: false, error: MESSAGES.owner_only }
  const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, workspaceId }, select: { id: true, bankDetails: true } })
  if (!supplier) return { success: false, error: MESSAGES.supplier_not_found }
  const int = (key: string) => { const raw = String(formData.get(key) ?? "").trim(); if (!raw) return null; const n = parseInt(raw, 10); return Number.isFinite(n) && n >= 0 ? n : NaN }
  const netDays = int("paymentTermsDays"), discountDays = int("earlyPaymentDiscountDays")
  const percentRaw = String(formData.get("earlyPaymentDiscountPercent") ?? "").trim()
  const discountPercent = percentRaw ? parseFloat(percentRaw) : null
  if (Number.isNaN(netDays) || Number.isNaN(discountDays)) return { success: false, error: "Days must be a whole number, 0 or more." }
  if (discountPercent !== null && (!Number.isFinite(discountPercent) || discountPercent <= 0 || discountPercent >= 100)) return { success: false, error: "The discount must be between 0 and 100 percent." }
  if ((discountPercent !== null) !== (discountDays !== null)) return { success: false, error: "A discount needs both a percent and the days it applies for." }
  const account = String(formData.get("account") ?? "").trim()
  const branchCode = String(formData.get("branchCode") ?? "").trim()
  const details = { ...((supplier.bankDetails as Record<string, unknown> | null) ?? {}), account: account || undefined, branchCode: branchCode || undefined }
  try {
    await prisma.supplier.update({
      where: { id: supplier.id },
      data: { paymentTermsDays: netDays, earlyPaymentDiscountPercent: discountPercent, earlyPaymentDiscountDays: discountDays, bankDetails: JSON.parse(JSON.stringify(details)) },
    })
    await recordDocumentAudit({ workspaceId, actorId: user.id, type: "supplier.payment_terms_updated", detail: { supplierId: supplier.id, netDays, discountPercent, discountDays, hasBankAccount: !!account } })
  } catch (error) { return { success: false, error: message(error, "Couldn't save the supplier") } }
  revalidate(workspaceId)
  revalidatePath(`/workspaces/${workspaceId}/invoices`)
  return { success: true, data: null }
}
