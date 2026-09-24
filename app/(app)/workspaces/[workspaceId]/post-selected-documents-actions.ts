"use server"

/** Bulk "Post" server action for a queue selection (Invoices/Receipts/Bank Statements — #281,
 * executing #248). Selection ids come from the client and are never trusted as the eligible set:
 * this re-resolves eligibility per document server-side, exactly like pushAllReadyDocumentsAction
 * does for "all ready" (integration-push-actions.ts). A doc the server finds ineligible is never a
 * silent drop from the selection's count — it comes back as its own outcome row with a reason, the
 * same shape a failed push uses, so the confirm dialog and the per-row Ledger mark can both show it
 * (spec.md §2/§3.1). */

import { ActionState } from "@/lib/actions"
import { recordDocumentAudit } from "@/lib/audit"
import { getCurrentUser } from "@/lib/auth"
import config from "@/lib/config"
import { resolveSelectionEligibility } from "@/lib/integration-push-selection"
import { workspaceIntegrationsPlanEnabled } from "@/models/integrations"
import { prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { errorMessage, NO_ACCESS, requireMember } from "./action-helpers"
import { pushDocumentToConnection } from "./integration-push-actions"

export type SelectionPostOutcome = { documentId: string; status: "succeeded" | "queued" | "failed" | "ineligible"; error?: string }

export async function postSelectedDocumentsAction(
  workspaceId: string,
  connectionId: string,
  documentIds: string[]
): Promise<ActionState<{ posted: number; failed: number; results: SelectionPostOutcome[] }>> {
  if (!config.integrations.enabled) return { success: false, error: errorMessage(new Error("integrations_not_available"), NO_ACCESS) }
  if (!documentIds.length) return { success: false, error: "No documents selected" }
  const user = await getCurrentUser()
  if (!(await requireMember(workspaceId, user.id))) return { success: false, error: NO_ACCESS }
  if (!(await workspaceIntegrationsPlanEnabled(workspaceId))) return { success: false, error: errorMessage(new Error("integrations_plan_required"), NO_ACCESS) }

  const [workspace, docs, succeededPushes] = await Promise.all([
    prisma.workspace.findUnique({ where: { id: workspaceId }, select: { baseCurrency: true } }),
    prisma.document.findMany({ where: { id: { in: documentIds }, workspaceId }, select: { id: true, status: true, docType: true, codingData: true, reviewedData: true, rawExtraction: true, baseCurrencyTotal: true, cancelledAt: true } }),
    prisma.integrationPush.findMany({ where: { workspaceId, connectionId, documentId: { in: documentIds }, status: "succeeded" }, select: { documentId: true } }),
  ])
  const workspaceBase = workspace?.baseCurrency ? workspace.baseCurrency.toUpperCase() : null
  const alreadyPostedIds = new Set(succeededPushes.map((push) => push.documentId))
  const docById = new Map(docs.map((doc) => [doc.id, doc]))

  const eligibleIds = new Set<string>()
  const results: SelectionPostOutcome[] = []
  for (const documentId of documentIds) {
    const doc = docById.get(documentId)
    if (!doc) { results.push({ documentId, status: "ineligible" as const, error: "Document not found" }); continue }
    const reviewedData = (doc.reviewedData as Record<string, unknown> | null) ?? (doc.rawExtraction as Record<string, unknown> | null) ?? {}
    const docCurrency = ((reviewedData as { currency_code?: unknown }).currency_code as string | undefined)?.toUpperCase() ?? null
    const eligibility = resolveSelectionEligibility(
      { status: doc.status, docType: doc.docType, codingData: doc.codingData as Record<string, unknown> | null, baseCurrencyTotal: doc.baseCurrencyTotal, cancelledAt: doc.cancelledAt },
      { alreadyPosted: alreadyPostedIds.has(doc.id), workspaceBase, docCurrency }
    )
    if (!eligibility.eligible) { results.push({ documentId, status: "ineligible", error: eligibility.reason }); continue }
    eligibleIds.add(documentId)
  }

  let posted = 0
  let failed = 0
  for (const documentId of eligibleIds) {
    try {
      const result = await pushDocumentToConnection(workspaceId, documentId, connectionId, user.id)
      if (result.status === "failed") { failed += 1; results.push({ documentId, status: "failed", error: result.errorCode ?? "Could not push this document" }) }
      else { posted += 1; results.push({ documentId, status: result.status === "succeeded" ? "succeeded" : "queued" }) }
    } catch (error) {
      failed += 1
      results.push({ documentId, status: "failed", error: errorMessage(error, "Could not push this document") })
    }
  }

  await recordDocumentAudit({ workspaceId, actorId: user.id, type: "integration_batch_push", detail: { connectionId, source: "selection", posted, failed, ineligible: results.filter((r) => r.status === "ineligible").length } })
  revalidatePath(`/workspaces/${workspaceId}/accounting`)
  return { success: true, data: { posted, failed, results } }
}
