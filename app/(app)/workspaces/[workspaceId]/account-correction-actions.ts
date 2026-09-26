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
import { formatUnresolvedAccountId } from "@/lib/finance/line-account-resolution"
import { IntegrationPermanentError } from "@/lib/integrations/errors"
import { checkQuickBooksBillCorrectable, updateBillAccounts as updateQuickBooksBillAccounts } from "@/lib/integrations/quickbooks/client"
import { checkXeroBillCorrectable, updateBillAccounts as updateXeroBillAccounts } from "@/lib/integrations/xero/client"
import {
  dismissAccountCorrectionForDocuments,
  findBillsAffectedByAccountChange,
  recordAccountCorrectionApplied,
  recordDocumentLineAccountsCorrected,
  setDocumentLineToAccount,
  type AffectedBillRow,
} from "@/models/documents"
import { refreshLineCodingChecks } from "@/models/document-checks"
import { listWorkspaceIntegrationPushes, resolveAccountNames, workspaceIntegrationsPlanEnabled } from "@/models/integrations"
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

/** The review-approval trigger's own check (#430 Screen 1, the "SupplierAccountRule change" half
 * of the Trigger spec — the Default-save half already has both account names from the picker and
 * calls `listAffectedBillsAction` directly): resolves the old/new account names alongside the
 * affected-bills query, and the connection's provider, so the caller can open
 * `AccountCorrectionDialog` without a second round trip. Returns null (no dialog) on 0 affected. */
export type AffectedByRuleChange = { provider: string; providerLabel: string; oldAccountName: string; newAccountName: string; bills: AffectedBillWithCheck[] }

const PROVIDER_LABELS: Record<string, string> = { quickbooks: "QuickBooks", xero: "Xero", sage: "Sage" }

export async function checkAffectedByRuleChangeAction(workspaceId: string, connectionId: string, oldAccountExternalId: string, newAccountExternalId: string): Promise<ActionState<AffectedByRuleChange | null>> {
  const gate = await guard(workspaceId)
  if ("error" in gate) return { success: false, error: errorMessage(new Error(gate.error), NO_ACCESS) }
  const connection = await prisma.integrationConnection.findFirst({ where: { id: connectionId, workspaceId }, select: { id: true, provider: true, externalTenantId: true } })
  if (!connection || !connection.externalTenantId) return { success: true, data: null }
  const affected = await findBillsAffectedByAccountChange(workspaceId, connectionId, oldAccountExternalId)
  if (!affected.length) return { success: true, data: null }
  const [names, withChecks] = await Promise.all([
    resolveAccountNames(connectionId, [oldAccountExternalId, newAccountExternalId]),
    Promise.all(affected.map(async (bill): Promise<AffectedBillWithCheck> => {
      const txnDate = bill.receivedAt.toISOString().slice(0, 10)
      const refusal = await checkCorrectable(connection.provider, connection.externalTenantId!, connection.id, bill.externalBillId, txnDate)
      return { ...bill, refusal }
    })),
  ])
  return {
    success: true,
    data: {
      provider: connection.provider,
      providerLabel: PROVIDER_LABELS[connection.provider] ?? connection.provider,
      // #430 evaluate re-run finding (P2): don't leak a raw external id into the Review dialog copy
      // when the name lookup can't resolve it — format it the same way as the page.tsx reminder row
      // and line-items-editor.tsx's Screen 2 fallback option.
      oldAccountName: names[oldAccountExternalId] ?? formatUnresolvedAccountId(oldAccountExternalId),
      newAccountName: names[newAccountExternalId] ?? formatUnresolvedAccountId(newAccountExternalId),
      bills: withChecks,
    },
  }
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
    // #459: findBillsAffectedByAccountChange already excludes item lines from `bill.lines` — a
    // document whose only affected lines were item lines has none left here, so it is never
    // silently skipped: it surfaces as its own failed row instead.
    if (!bill.lines.length) {
      results.push({ documentId, status: "failed", error: `coded to an item — change it in ${PROVIDER_LABELS[connection.provider] ?? connection.provider}` })
      continue
    }
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

export type UpdateDocumentAccountsOutcome =
  | { status: "updated"; provider: string }
  | { status: "refused"; reason: AccountCorrectionRefusal }

/** Shared by the pre-check and the update action below: finds the document's own succeeded push
 * (one accounting connection per bill) and its connection row. Returns an `error` string when the
 * bill isn't postable at all (never a `refusal`, which is the provider's own per-bill answer, not
 * a lookup failure). */
async function resolveDocumentPushConnection(workspaceId: string, documentId: string) {
  const pushes = await listWorkspaceIntegrationPushes(workspaceId, documentId)
  const succeeded = pushes.find((p) => p.status === "succeeded" && p.connectionId)
  if (!succeeded || !succeeded.externalBillId || !succeeded.connectionId) return { error: "This bill hasn't been posted to an accounting connection" as const }
  const connection = await prisma.integrationConnection.findFirst({ where: { id: succeeded.connectionId, workspaceId }, select: { id: true, provider: true, externalTenantId: true } })
  if (!connection || !connection.externalTenantId) return { error: "That connection no longer exists" as const }
  return { externalBillId: succeeded.externalBillId, connection: connection as { id: string; provider: string; externalTenantId: string } }
}

/** Screen 2's Detail-pane "locked" state (spec §Screen 2 States) — pre-checks correctability
 * before the person edits anything, so a books-closed or paid-and-refused bill disables the
 * Account control up front with the refusal reason, cheaper than letting them try and fail. */
export async function checkDocumentAccountCorrectableAction(workspaceId: string, documentId: string): Promise<ActionState<AccountCorrectionRefusal | null>> {
  const gate = await guard(workspaceId)
  if ("error" in gate) return { success: false, error: errorMessage(new Error(gate.error), NO_ACCESS) }
  const resolved = await resolveDocumentPushConnection(workspaceId, documentId)
  if ("error" in resolved) return { success: false, error: resolved.error }
  const document = await prisma.document.findFirst({ where: { id: documentId, workspaceId }, select: { receivedAt: true } })
  if (!document) return { success: false, error: "Document not found" }
  const refusal = await checkCorrectable(resolved.connection.provider, resolved.connection.externalTenantId, resolved.connection.id, resolved.externalBillId, document.receivedAt.toISOString())
  return { success: true, data: refusal }
}

/** Screen 2's single-document Detail-pane "Update in {Provider}" (#430 step 4) — resolves the
 * document's own succeeded push, pre-checks correctability the same way Screen 1 does, resends
 * every line with only the changed ones' Account replaced, and — on success — records the new
 * account per line by index (`recordDocumentLineAccountsCorrected`, never
 * `recordAccountCorrectionApplied`: this path doesn't retarget by matching an old account, since a
 * person may retarget several lines to different accounts in one edit, and never touches a
 * `SupplierAccountRule` per spec §Screen 2). */
export async function updateDocumentLineAccountsAction(
  workspaceId: string,
  documentId: string,
  changes: { index: number; newAccountExternalId: string }[]
): Promise<ActionState<UpdateDocumentAccountsOutcome>> {
  const gate = await guard(workspaceId)
  if ("error" in gate) return { success: false, error: errorMessage(new Error(gate.error), NO_ACCESS) }
  if (!changes.length) return { success: false, error: "Nothing to update" }
  const resolved = await resolveDocumentPushConnection(workspaceId, documentId)
  if ("error" in resolved) return { success: false, error: resolved.error }
  const { connection, externalBillId } = resolved
  const document = await prisma.document.findFirst({ where: { id: documentId, workspaceId }, select: { receivedAt: true, codingData: true } })
  if (!document) return { success: false, error: "Document not found" }
  const refusal = await checkCorrectable(connection.provider, connection.externalTenantId, connection.id, externalBillId, document.receivedAt.toISOString())
  if (refusal) return { success: true, data: { status: "refused", reason: refusal } }
  // #459: an item line's account is the Item's own — it is never retargeted through this dialog.
  const coding = (document.codingData as Record<string, unknown> | null) ?? {}
  const items = Array.isArray(coding.items) ? (coding.items as Array<{ account_source?: string | null }>) : []
  const changesExcludingItems = changes.filter((c) => items[c.index]?.account_source !== "item")
  if (!changesExcludingItems.length) return { success: false, error: `coded to an item — change it in ${PROVIDER_LABELS[connection.provider] ?? connection.provider}` }
  const accountRefByLineIndex = new Map(changesExcludingItems.map((c) => [c.index, c.newAccountExternalId]))
  try {
    if (connection.provider === "quickbooks") await updateQuickBooksBillAccounts(connection.externalTenantId, connection.id, externalBillId, accountRefByLineIndex)
    else if (connection.provider === "xero") await updateXeroBillAccounts(connection.externalTenantId, connection.id, externalBillId, accountRefByLineIndex)
    else return { success: false, error: "Unsupported accounting provider" }
    await recordDocumentLineAccountsCorrected(workspaceId, documentId, changesExcludingItems)
    await recordDocumentAudit({ workspaceId, actorId: gate.userId, documentId, type: "ledger_account_corrected", detail: { connectionId: connection.id, changes: changesExcludingItems } })
    revalidatePath(paths(workspaceId).integrations)
    return { success: true, data: { status: "updated", provider: connection.provider } }
  } catch (error) {
    const stale = error instanceof IntegrationPermanentError
    return { success: false, error: stale ? "Something changed here first — reload and try again" : errorMessage(error, "Could not update this bill") }
  }
}

/** #459's `item_lines_not_supported` Check action — "Code to the item's account instead". Owner-
 * gated like every other action here; never automatic (spec: only when the person chooses it). The
 * item's account is already the line's `account_external_id` (step 2), so this only clears the item
 * fields; the Check clears immediately since `refreshLineCodingChecks` re-runs after the write. */
export async function setLineToAccountAction(workspaceId: string, documentId: string, lineIndex: number): Promise<ActionState> {
  const gate = await guard(workspaceId)
  if ("error" in gate) return { success: false, error: errorMessage(new Error(gate.error), NO_ACCESS) }
  await setDocumentLineToAccount(workspaceId, documentId, lineIndex)
  await refreshLineCodingChecks(workspaceId, documentId)
  revalidatePath(paths(workspaceId).integrations)
  return { success: true }
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

/** Screen 3's row-level "Leave them" — the reminder line already knows the count, not the specific
 * document ids (the table never fetched the full bill list, only the count from
 * `findAccountCorrectionReminders`), so this re-runs the same affected-bills query server-side and
 * dismisses every match in one step, rather than making the click first open Screen 1 just to read
 * ids back out. */
export async function leaveAllAffectedByRuleAction(workspaceId: string, connectionId: string, oldAccountExternalId: string): Promise<ActionState> {
  const gate = await guard(workspaceId)
  if ("error" in gate) return { success: false, error: errorMessage(new Error(gate.error), NO_ACCESS) }
  const affected = await findBillsAffectedByAccountChange(workspaceId, connectionId, oldAccountExternalId)
  const documentIds = affected.map((b) => b.id)
  if (!documentIds.length) return { success: true }
  await dismissAccountCorrectionForDocuments(workspaceId, documentIds, oldAccountExternalId)
  await recordDocumentAudit({ workspaceId, actorId: gate.userId, type: "ledger_account_correction_left", detail: { oldAccountExternalId, documentIds } })
  revalidatePath(paths(workspaceId).integrations)
  return { success: true }
}
