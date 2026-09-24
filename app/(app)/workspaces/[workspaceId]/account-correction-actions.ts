"use server"

/** Server actions for #430 "correcting posted bills' Accounts" — Screen 1's list-affected/update-
 * selected/leave-them, called from the dialog triggered by a SupplierAccountRule change or the
 * connection Default save (the trigger itself is Screen 1/3 UI, steps 3/5), and reused by Screen
 * 2's single-row Detail-pane path with a one-document list. Same owner + deployment + plan gate as
 * integration-connection-actions.ts, since this is a correction on the same connection. */

import { ActionState } from "@/lib/actions"
import { recordDocumentAudit } from "@/lib/audit"
import { getCurrentUser } from "@/lib/auth"
import config from "@/lib/config"
import { IntegrationPermanentError } from "@/lib/integrations/errors"
import { checkQuickBooksBillCorrectable, updateBillAccounts as updateQuickBooksBillAccounts } from "@/lib/integrations/quickbooks/client"
import { checkXeroBillCorrectable, updateBillAccounts as updateXeroBillAccounts } from "@/lib/integrations/xero/client"
import {
  dismissAccountCorrectionForDocuments,
  findBillsAffectedByAccountChange,
  recordAccountCorrectionApplied,
  type AffectedBillRow,
} from "@/models/documents"
import { workspaceIntegrationsPlanEnabled } from "@/models/integrations"
import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { errorMessage, NO_ACCESS, paths, requireMember } from "./action-helpers"

async function guard(workspaceId: string): Promise<{ userId: string } | { error: string }> {
  if (!config.integrations.enabled) return { error: "integrations_not_available" }
  const user = await getCurrentUser()
  if (!(await requireMember(workspaceId, user.id, ["owner"]))) return { error: NO_ACCESS }
  if (!(await workspaceIntegrationsPlanEnabled(workspaceId))) return { error: "integrations_plan_required" }
  return { userId: user.id }
}

/** Refusal reason in the shape Screen 1's row copy names ("Books closed for this period — update
 * in QuickBooks", "Locked period in Xero", "Paid in {Provider} — account can't be changed through
 * DocuBite"). Kept as a structured code + provider rather than pre-built copy so the client
 * component owns the exact wording (per craft-floor: copy lives in the surface, not the action). */
export type AccountCorrectionRefusal = { code: "book_closed" | "period_locked" | "paid" | "voided" | "not_found"; provider: string }

export type AffectedBillWithCheck = AffectedBillRow & { refusal: AccountCorrectionRefusal | null }

async function checkCorrectable(provider: string, tenantId: string, connectionId: string, externalBillId: string | null, txnDate: string): Promise<AccountCorrectionRefusal | null> {
  if (!externalBillId) return { code: "not_found", provider }
  try {
    if (provider === "quickbooks") {
      const check = await checkQuickBooksBillCorrectable(tenantId, connectionId, externalBillId, txnDate)
      return check.offered ? null : { code: check.reason, provider }
    }
    if (provider === "xero") {
      const check = await checkXeroBillCorrectable(tenantId, connectionId, externalBillId, txnDate)
      return check.offered ? null : { code: check.reason, provider }
    }
    return { code: "not_found", provider }
  } catch {
    return { code: "not_found", provider }
  }
}

/** Screen 1's initial load: the affected-bills query plus a per-row provider pre-check, so the
 * dialog opens already knowing which rows are refused (sorted last, checkbox disabled) per the
 * spec — "query runs server-side before the dialog renders, no client-side loading spinner". */
export async function listAffectedBillsAction(workspaceId: string, connectionId: string, oldAccountExternalId: string): Promise<ActionState<AffectedBillWithCheck[]>> {
  const gate = await guard(workspaceId)
  if ("error" in gate) return { success: false, error: errorMessage(new Error(gate.error), NO_ACCESS) }
  const connection = await prisma.integrationConnection.findFirst({ where: { id: connectionId, workspaceId }, select: { id: true, provider: true, externalTenantId: true } })
  if (!connection || !connection.externalTenantId) return { success: false, error: "That connection no longer exists" }
  const affected = await findBillsAffectedByAccountChange(workspaceId, connectionId, oldAccountExternalId)
  const withChecks = await Promise.all(
    affected.map(async (bill): Promise<AffectedBillWithCheck> => {
      const txnDate = bill.receivedAt.toISOString().slice(0, 10)
      const refusal = await checkCorrectable(connection.provider, connection.externalTenantId!, connection.id, bill.externalBillId, txnDate)
      return { ...bill, refusal }
    })
  )
  return { success: true, data: withChecks }
}

export type UpdateSelectedBillsResult = { documentId: string; status: "updated" | "failed"; error?: string }

/** Screen 1's "Update N bills in {Provider}" / Screen 2's single-document "Update in {Provider}" —
 * each row waits for its own server-confirmed write (not optimistic, per the spec). A row that
 * fails keeps its Screen 3 reminder exactly as if it were never selected — no dismissal is written
 * for it, only for rows that succeed. */
export async function updateSelectedBillAccountsAction(
  workspaceId: string,
  connectionId: string,
  oldAccountExternalId: string,
  newAccountExternalId: string,
  documentIds: string[]
): Promise<ActionState<UpdateSelectedBillsResult[]>> {
  const gate = await guard(workspaceId)
  if ("error" in gate) return { success: false, error: errorMessage(new Error(gate.error), NO_ACCESS) }
  const connection = await prisma.integrationConnection.findFirst({ where: { id: connectionId, workspaceId }, select: { id: true, provider: true, externalTenantId: true } })
  if (!connection || !connection.externalTenantId) return { success: false, error: "That connection no longer exists" }
  const affected = await findBillsAffectedByAccountChange(workspaceId, connectionId, oldAccountExternalId)
  const byId = new Map(affected.map((bill) => [bill.id, bill]))

  const results: UpdateSelectedBillsResult[] = []
  for (const documentId of documentIds) {
    const bill = byId.get(documentId)
    if (!bill || !bill.externalBillId) { results.push({ documentId, status: "failed", error: "Bill not found" }); continue }
    const accountRefByLineIndex = new Map(bill.lines.map((line) => [line.index, newAccountExternalId]))
    try {
      if (connection.provider === "quickbooks") {
        await updateQuickBooksBillAccounts(connection.externalTenantId, connection.id, bill.externalBillId, accountRefByLineIndex)
      } else if (connection.provider === "xero") {
        await updateXeroBillAccounts(connection.externalTenantId, connection.id, bill.externalBillId, accountRefByLineIndex)
      } else {
        results.push({ documentId, status: "failed", error: "Unsupported accounting provider" })
        continue
      }
      await recordAccountCorrectionApplied(workspaceId, documentId, oldAccountExternalId, newAccountExternalId)
      await recordDocumentAudit({ workspaceId, actorId: gate.userId, documentId, type: "ledger_account_corrected", detail: { connectionId, oldAccountExternalId, newAccountExternalId } })
      results.push({ documentId, status: "updated" })
    } catch (error) {
      // The stale-token retry already happened once inside updateBillAccounts — a second failure
      // here is either "Stale — try again" (permanent-shaped, retried and still rejected) or a
      // fresh permanent refusal; either way the row's reminder stays exactly as before (no
      // dismissal, no codingData change).
      const stale = error instanceof IntegrationPermanentError
      results.push({ documentId, status: "failed", error: stale ? "Stale — try again" : errorMessage(error, "Could not update this bill") })
    }
  }
  revalidatePath(paths(workspaceId).integrations)
  return { success: true, data: results }
}

/** Screen 1's "Leave them" / Screen 3's row-level "Leave them" text action — a real decision, not
 * silent (spec §Screen 3): marks the given documents dismissed for this exact old account so they
 * stop appearing as affected until a further correction targets a different old account. */
export async function leaveAffectedBillsAction(workspaceId: string, oldAccountExternalId: string, documentIds: string[]): Promise<ActionState> {
  const gate = await guard(workspaceId)
  if ("error" in gate) return { success: false, error: errorMessage(new Error(gate.error), NO_ACCESS) }
  if (!documentIds.length) return { success: true }
  await dismissAccountCorrectionForDocuments(workspaceId, documentIds, oldAccountExternalId)
  await recordDocumentAudit({ workspaceId, actorId: gate.userId, type: "ledger_account_correction_left", detail: { oldAccountExternalId, documentIds } })
  revalidatePath(paths(workspaceId).integrations)
  return { success: true }
}
