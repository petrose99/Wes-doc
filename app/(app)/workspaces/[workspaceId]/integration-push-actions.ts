"use server"

/** Server action for pushing a reviewed document to a connected accounting provider as a bill. One
 * upsert of the queue row, then an inline (awaited) attempt so the acting user sees the outcome
 * immediately — a kick of the drain covers the case where the inline attempt itself leaves the row
 * pending (rare, but the drain is the correctness guarantee either way, exactly as
 * redeliverDeliveryAction kicks the webhook drain). */

import { ActionState } from "@/lib/actions"
import { isCategoryConfirmed, isPushableDocument } from "@/lib/doc-types"
import { recordDocumentAudit } from "@/lib/audit"
import { getCurrentUser } from "@/lib/auth"
import config from "@/lib/config"
import { BillMappingError, normalizeBillFromDocument } from "@/lib/integration-bill-mapping"
import { attemptIntegrationPush, getActiveIntegrationConnectionId, kickIntegrationPushDrain } from "@/lib/integration-push"
import { getWorkspaceDocument, listReadyToPushDocuments } from "@/models/documents"
import { upsertWorkspaceIntegrationPush, workspaceIntegrationsPlanEnabled } from "@/models/integrations"
import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { errorMessage, NO_ACCESS, requireMember } from "./action-helpers"

/** Core push logic shared by the single-document action and the "Push all" batch action: resolves
 * the document + connection, upserts the push row, and runs one inline attempt. Auth/plan checks
 * are the caller's job — the batch caller checks them once for the whole run rather than once per
 * document. */
export async function pushDocumentToConnection(
  workspaceId: string,
  documentId: string,
  connectionId: string,
  userId: string
): Promise<{ status: string; errorCode?: string | null }> {
  const document = await getWorkspaceDocument(workspaceId, documentId)
  if (!document) throw new Error("Document not found")
  if (document.status !== "reviewed") throw new Error("Only reviewed documents can be pushed")
  if (!isPushableDocument(document)) {
    throw new Error("This document's type can't be pushed to accounting")
  }
  // Foreign-currency documents MUST be converted before they touch a ledger — a QB/Xero bill
  // booked in a currency the workspace's chart of accounts doesn't use is a real accounting
  // problem, not a UX one. If the conversion is still pending (currency ≠ base but no rate
  // fetched yet), refuse the push and let the retry drain get to it first.
  const workspaceForFx = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { baseCurrency: true } })
  const workspaceBase = workspaceForFx?.baseCurrency ? workspaceForFx.baseCurrency.toUpperCase() : null
  const docCurrency = ((document.reviewedData as { currency_code?: unknown })?.currency_code as string | undefined)?.toUpperCase() ?? null
  if (workspaceBase && docCurrency && docCurrency !== workspaceBase && document.baseCurrencyTotal === null) {
    throw new Error("fx_rate_pending")
  }
  const coding = (document.codingData as Record<string, unknown> | null) ?? {}
  if (!isCategoryConfirmed(coding)) {
    throw new Error("Document category must be confirmed before pushing")
  }
  const connection = await prisma.integrationConnection.findFirst({ where: { id: connectionId, workspaceId }, select: { id: true, provider: true, defaultExpenseAccountId: true } })
  if (!connection) throw new Error("That connection no longer exists")

  const reviewedData = (document.reviewedData as Record<string, unknown> | null) ?? (document.rawExtraction as Record<string, unknown> | null) ?? {}
  const category = (typeof coding.account === "string" && coding.account) || (typeof reviewedData.category === "string" && reviewedData.category) || null
  const documentType = coding.documentType === "expense" || coding.documentType === "sale" || coding.documentType === "bank_statement" ? coding.documentType : "expense"

  // #429: per-line accounts are resolved once at Save review (models/documents.ts::
  // updateDocumentReview::resolveDocumentCodingItems) and stamped onto codingData.items — no
  // per-push mapping resolution left to do here. The connection Default still backs
  // `payload.expenseAccountId`, read by the preflight cache check (lib/integration-push.ts).
  const codingItems = Array.isArray((coding as { items?: unknown }).items) ? (coding.items as Array<{ account_external_id: string | null }>) : null

  // Ledger books everything in the workspace's base currency: if the document has been
  // converted, the bill body carries the converted total + base currency, NOT the extracted
  // ones. A same-currency document has baseCurrencyTotal populated via the "identity" shortcut,
  // so this covers those too — and a foreign-currency doc with pending FX was rejected above, so
  // at this point either baseCurrencyTotal exists or the document was already same-currency.
  const fxOverride = workspaceBase && document.baseCurrencyTotal !== null
    ? { total: Number(document.baseCurrencyTotal), currencyCode: workspaceBase }
    : null
  const bill = normalizeBillFromDocument({ documentId: document.id, filename: document.filename, templateCode: document.template?.code ?? null, reviewedData, fxOverride, lineAccounts: codingItems })
  const direction: "payable" | "receivable" = documentType === "sale" ? "receivable" : "payable"
  const payload: object = { ...bill, documentType, direction, ...(connection.defaultExpenseAccountId ? { expenseAccountId: connection.defaultExpenseAccountId } : {}), ...(category ? { category } : {}) }

  const push = await upsertWorkspaceIntegrationPush(workspaceId, {
    connectionId: connection.id,
    documentId: document.id,
    provider: connection.provider as "quickbooks" | "xero",
    payload,
    createdById: userId,
  })
  await attemptIntegrationPush(push.id)
  const updated = await prisma.integrationPush.findUnique({ where: { id: push.id }, select: { status: true, errorCode: true } })
  if (updated?.status === "pending") await kickIntegrationPushDrain()
  // #281 spec.md §7: a succeeded push (fresh or a Checks-tab Retry) closes any open
  // `push_preflight` task on this document — the task named the pre-flight cause the push has now
  // cleared, so it never sits open once the ledger holds the document.
  if (updated?.status === "succeeded") {
    await prisma.reviewTask.updateMany({ where: { workspaceId, documentId, reason: "push_preflight", status: { in: ["open", "in_review"] } }, data: { status: "approved", resolvedAt: new Date() } })
  }
  return { status: updated?.status ?? "pending", errorCode: updated?.errorCode ?? null }
}

export async function pushDocumentToAccountingAction(
  workspaceId: string,
  documentId: string,
  connectionId: string
): Promise<ActionState<{ status: string }>> {
  if (!config.integrations.enabled) return { success: false, error: errorMessage(new Error("integrations_not_available"), NO_ACCESS) }
  const user = await getCurrentUser()
  if (!(await requireMember(workspaceId, user.id))) return { success: false, error: NO_ACCESS }
  if (!(await workspaceIntegrationsPlanEnabled(workspaceId))) return { success: false, error: errorMessage(new Error("integrations_plan_required"), NO_ACCESS) }

  try {
    const result = await pushDocumentToConnection(workspaceId, documentId, connectionId, user.id)
    await recordDocumentAudit({ workspaceId, actorId: user.id, documentId, type: "integration_push_enqueued", detail: { connectionId } })
    revalidatePath(`/workspaces/${workspaceId}/documents/${documentId}`)
    revalidatePath(`/workspaces/${workspaceId}/accounting`)
    return { success: true, data: result }
  } catch (error) {
    if (error instanceof BillMappingError) return { success: false, error: "This document has no total to push" }
    return { success: false, error: errorMessage(error, "Could not push this document") }
  }
}

/** #281 spec.md §7: the Checks tab's Retry — re-runs the same push against the workspace's active
 * connection (there is exactly one, per §2), closing the open `push_preflight` task on success. */
export async function retryLedgerPushAction(workspaceId: string, documentId: string): Promise<ActionState<{ status: string }>> {
  const connectionId = await getActiveIntegrationConnectionId(workspaceId)
  if (!connectionId) return { success: false, error: "No ledger connected" }
  return pushDocumentToAccountingAction(workspaceId, documentId, connectionId)
}

/** Batch counterpart to pushDocumentToAccountingAction: resolves the "ready to push" set
 * server-side (never trusts a client-supplied document list) and pushes each one in turn through
 * the same upsert-per-(document,connection) path, so re-running the whole batch is exactly as
 * idempotent as retrying one document — a document that already succeeded simply won't be in the
 * ready set next time. */
export async function pushAllReadyDocumentsAction(
  workspaceId: string,
  connectionId: string
): Promise<ActionState<{ pushed: number; failed: number; results: Array<{ documentId: string; status: "succeeded" | "queued" | "failed"; error?: string }> }>> {
  if (!config.integrations.enabled) return { success: false, error: errorMessage(new Error("integrations_not_available"), NO_ACCESS) }
  const user = await getCurrentUser()
  if (!(await requireMember(workspaceId, user.id))) return { success: false, error: NO_ACCESS }
  if (!(await workspaceIntegrationsPlanEnabled(workspaceId))) return { success: false, error: errorMessage(new Error("integrations_plan_required"), NO_ACCESS) }

  const { documents: ready } = await listReadyToPushDocuments(workspaceId, connectionId)
  let pushed = 0
  let failed = 0
  const results: Array<{ documentId: string; status: "succeeded" | "queued" | "failed"; error?: string }> = []
  for (const doc of ready) {
    try {
      const result = await pushDocumentToConnection(workspaceId, doc.id, connectionId, user.id)
      // #249: a push that fails inside attemptIntegrationPush (rather than throwing here) used to
      // report bare "failed" with no reason — the same object the catch block below already
      // carries one on. `errorCode` is the field attemptIntegrationPush itself writes on failure.
      if (result.status === "failed") { failed += 1; results.push({ documentId: doc.id, status: "failed", error: result.errorCode ?? "Could not push this document" }) }
      else { pushed += 1; results.push({ documentId: doc.id, status: result.status === "succeeded" ? "succeeded" : "queued" }) }
    } catch (error) {
      failed += 1
      results.push({ documentId: doc.id, status: "failed", error: errorMessage(error, "Could not push this document") })
    }
  }
  await recordDocumentAudit({ workspaceId, actorId: user.id, type: "integration_batch_push", detail: { connectionId, pushed, failed, totalReady: ready.length } })
  revalidatePath(`/workspaces/${workspaceId}/accounting`)
  return { success: true, data: { pushed, failed, results } }
}

export async function listDocumentPushesAction(workspaceId: string, documentId: string) {
  const user = await getCurrentUser()
  if (!(await requireMember(workspaceId, user.id))) return []
  return prisma.integrationPush.findMany({
    where: { workspaceId, documentId },
    orderBy: { createdAt: "desc" },
    select: { id: true, connectionId: true, provider: true, status: true, attempts: true, externalBillId: true, externalRecordKind: true, errorCode: true, completedAt: true },
  })
}
