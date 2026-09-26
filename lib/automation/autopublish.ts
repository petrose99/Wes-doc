import { isCategoryConfirmed, isPushableDocument } from "@/lib/doc-types"
import { normalizeBillFromDocument, BillMappingError } from "@/lib/integration-bill-mapping"
import { attemptIntegrationPush, kickIntegrationPushDrain } from "@/lib/integration-push"
import { getWorkspaceCapabilities } from "@/lib/modules/capabilities"
import { prisma } from "@/lib/db"
import { recordSystemAudit } from "@/lib/audit"
import type { BillCoding } from "@/lib/finance/line-coding"
import { loadLineCodingContext } from "@/models/accounting-entities"
import { listCategoryAccountMappings, resolveCategoryAccount } from "@/models/category-account-mappings"
import { getCategoryAccountMap, upsertWorkspaceIntegrationPush } from "@/models/integrations"

/** Shared push logic: builds payload, enqueues, attempts, kicks drain. Returns true if a push
 * was created, false if skipped (not pushable, already pushed, no connection). Never throws. */
async function enqueuePush(
  workspaceId: string,
  document: { id: string; filename: string; reviewedData: unknown; rawExtraction: unknown; codingData: unknown; docType?: string | null; template: { code: string } | null; baseCurrencyTotal?: unknown },
  actorId: string | null,
  auditType: string,
): Promise<boolean> {
  const caps = await getWorkspaceCapabilities(workspaceId)
  if (!caps.has("accounting-push")) return false
  if (!isPushableDocument(document)) return false
  if (!isCategoryConfirmed((document.codingData as Record<string, unknown> | null))) return false

  const connection = await prisma.integrationConnection.findFirst({ where: { workspaceId, status: "connected" }, orderBy: { createdAt: "asc" } })
  if (!connection) return false

  const existingPush = await prisma.integrationPush.findFirst({ where: { workspaceId, documentId: document.id, connectionId: connection.id }, select: { id: true } })
  if (existingPush) return false

  // Autopublish must NEVER ship a foreign-currency document to the ledger before FX applies —
  // the whole point of touchless push is that a person didn't look at it, so a currency mismatch
  // that a person would have caught goes straight to the books. Skip and let the next path
  // (retry drain, or a person clicking "Push") get to it after conversion lands.
  const workspaceForFx = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { baseCurrency: true } })
  const workspaceBase = workspaceForFx?.baseCurrency ? workspaceForFx.baseCurrency.toUpperCase() : null
  const reviewedForFx = (document.reviewedData as Record<string, unknown> | null) ?? (document.rawExtraction as Record<string, unknown> | null) ?? {}
  const docCurrency = typeof reviewedForFx.currency_code === "string" ? reviewedForFx.currency_code.toUpperCase() : null
  if (workspaceBase && docCurrency && docCurrency !== workspaceBase && (document.baseCurrencyTotal ?? null) === null) return false

  const reviewedData = (document.reviewedData as Record<string, unknown> | null) ?? (document.rawExtraction as Record<string, unknown> | null) ?? {}
  const coding = (document.codingData as Record<string, unknown> | null) ?? {}
  const category = (typeof coding.account === "string" && coding.account) || (typeof reviewedData.category === "string" && reviewedData.category) || null
  let resolvedAccountId: string | undefined
  if (category && connection.defaultExpenseAccountId) {
    const [mappings, inferredMap] = await Promise.all([listCategoryAccountMappings(workspaceId, connection.id), getCategoryAccountMap(workspaceId, connection.id)])
    resolvedAccountId = resolveCategoryAccount(mappings, category, inferredMap, connection.defaultExpenseAccountId)
  }
  const documentType = coding.documentType === "expense" || coding.documentType === "sale" ? coding.documentType : "expense"
  const fxOverride = workspaceBase && (document.baseCurrencyTotal ?? null) !== null
    ? { total: Number(document.baseCurrencyTotal), currencyCode: workspaceBase }
    : null
  // Per-line accounts and the ADR 0014 coding set were resolved at Save review; the push gate
  // (lib/integration-push.ts gateLineCoding) refuses anything the ledger can't take.
  const lineAccounts = Array.isArray(coding.items) ? (coding.items as Array<{ account_external_id: string | null }>) : null
  const names = (await loadLineCodingContext(workspaceId, connection))?.names
  const bill = normalizeBillFromDocument({ documentId: document.id, filename: document.filename, templateCode: document.template?.code ?? null, reviewedData, fxOverride, lineAccounts, billCoding: coding as Partial<BillCoding>, names })
  const direction: "payable" | "receivable" = documentType === "sale" ? "receivable" : "payable"
  const payload = { ...bill, documentType, direction, ...(resolvedAccountId ? { expenseAccountId: resolvedAccountId } : {}), ...(category ? { category } : {}) }

  const push = await upsertWorkspaceIntegrationPush(workspaceId, {
    connectionId: connection.id, documentId: document.id, provider: connection.provider as "quickbooks" | "xero", payload, createdById: actorId,
  })
  await recordSystemAudit({ workspaceId, documentId: document.id, type: auditType })
  await attemptIntegrationPush(push.id)
  const updated = await prisma.integrationPush.findUnique({ where: { id: push.id }, select: { status: true } })
  if (updated?.status === "pending") await kickIntegrationPushDrain()
  return true
}

/** The default post-approval sync: every document a person approves is enqueued to the
 * workspace's accounting connection automatically — approval IS the decision to sync, there is
 * no second "Push to Accounting" click. All of enqueuePush's own safety gates still apply
 * (pushable type, confirmed category — satisfied by the human doc-type pick approval requires —
 * active connection, FX landed, not already pushed), so a document that can't safely sync simply
 * stays on Approved until the blocker clears. Never throws; fire-and-forget from
 * models/documents.ts::updateDocumentReview. */
export async function syncOnApproval(workspaceId: string, documentId: string, actorId: string | null): Promise<void> {
  try {
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: { id: true, filename: true, status: true, reviewedData: true, rawExtraction: true, codingData: true, docType: true, baseCurrencyTotal: true, template: { select: { code: true } } },
    })
    if (!document || document.status !== "reviewed") return
    await enqueuePush(workspaceId, document, actorId, "push.approval_enqueued")
  } catch (error) {
    if (error instanceof BillMappingError) return
    console.error("[automation] sync-on-approval failed:", error instanceof Error ? error.message : error)
  }
}

/** Pushes a document to its workspace's connected accounting provider automatically, when the rule
 * that coded it has autopublish=true. Called from two places: right after a rule applies to a
 * document with no review required (models/automation-rules.ts), and right after a reviewer
 * approves a review task for a rule-coded document (review-actions.ts).
 *
 * Never throws. */
export async function maybeAutopublish(workspaceId: string, documentId: string, actorId: string | null): Promise<void> {
  try {
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: { id: true, filename: true, reviewedData: true, rawExtraction: true, codingData: true, appliedRuleId: true, readinessStatus: true, docType: true, baseCurrencyTotal: true, template: { select: { code: true } } },
    })
    if (!document) return

    // Path 1: rule-autopublish (existing behavior)
    if (document.appliedRuleId) {
      const rule = await prisma.automationRule.findFirst({ where: { id: document.appliedRuleId, workspaceId }, select: { autopublish: true } })
      if (rule?.autopublish) {
        await enqueuePush(workspaceId, document, actorId, "push.auto_enqueued")
        return
      }
    }

    // Path 2: touchless push — readiness-gated, no rule.autopublish required
    if (document.readinessStatus === "ready") {
      const config = await prisma.workspaceAutomationConfig.findUnique({
        where: { workspaceId },
        select: { touchlessEnabled: true },
      })
      if (config?.touchlessEnabled) {
        await enqueuePush(workspaceId, document, actorId, "push.touchless_enqueued")
      }
    }
  } catch (error) {
    if (error instanceof BillMappingError) return
    console.error("[automation] autopublish failed:", error instanceof Error ? error.message : error)
  }
}
