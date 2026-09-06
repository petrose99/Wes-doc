import { isCategoryConfirmed, isPushableDocument } from "@/lib/doc-types"
import { normalizeBillFromDocument, BillMappingError } from "@/lib/integration-bill-mapping"
import { extractBankStatementPayload } from "@/lib/integrations/bigcapital/bank-statement-mapper"
import { attemptIntegrationPush, kickIntegrationPushDrain } from "@/lib/integration-push"
import { getWorkspaceCapabilities } from "@/lib/modules/capabilities"
import { prisma } from "@/lib/db"
import { recordSystemAudit } from "@/lib/audit"
import { listCategoryAccountMappings, resolveCategoryAccount } from "@/models/category-account-mappings"
import { getCategoryAccountMap, upsertWorkspaceIntegrationPush } from "@/models/integrations"

/** Shared push logic: builds payload, enqueues, attempts, kicks drain. Returns true if a push
 * was created, false if skipped (not pushable, already pushed, no connection). Never throws. */
async function enqueuePush(
  workspaceId: string,
  document: { id: string; filename: string; reviewedData: unknown; rawExtraction: unknown; codingData: unknown; docType?: string | null; template: { code: string } | null },
  actorId: string | null,
  auditType: string,
): Promise<boolean> {
  const caps = await getWorkspaceCapabilities(workspaceId)
  if (!caps.has("accounting-push")) return false
  if (!isPushableDocument(document)) return false
  if (!isCategoryConfirmed((document.codingData as Record<string, unknown> | null))) return false

  const connection = await prisma.integrationConnection.findFirst({ where: { workspaceId, status: "active" }, orderBy: { createdAt: "asc" } })
  if (!connection) return false

  const existingPush = await prisma.integrationPush.findFirst({ where: { workspaceId, documentId: document.id, connectionId: connection.id }, select: { id: true } })
  if (existingPush) return false

  const reviewedData = (document.reviewedData as Record<string, unknown> | null) ?? (document.rawExtraction as Record<string, unknown> | null) ?? {}
  const coding = (document.codingData as Record<string, unknown> | null) ?? {}
  const category = (typeof coding.account === "string" && coding.account) || (typeof reviewedData.category === "string" && reviewedData.category) || null
  let resolvedAccountId: string | undefined
  if (category && connection.defaultExpenseAccountId) {
    const [mappings, inferredMap] = await Promise.all([listCategoryAccountMappings(connection.id), getCategoryAccountMap(connection.id)])
    resolvedAccountId = resolveCategoryAccount(mappings, category, inferredMap, connection.defaultExpenseAccountId)
  }
  const documentType = coding.documentType === "expense" || coding.documentType === "sale" || coding.documentType === "bank_statement" ? coding.documentType : "expense"
  let payload: object
  if (documentType === "bank_statement" && (connection.provider as string) === "bigcapital") {
    const cashflowAccountId = resolvedAccountId ?? connection.defaultExpenseAccountId
    if (!cashflowAccountId) return false
    payload = extractBankStatementPayload(document.id, reviewedData, cashflowAccountId, connection.defaultExpenseAccountId!)
  } else {
    const bill = normalizeBillFromDocument({ documentId: document.id, filename: document.filename, templateCode: document.template?.code ?? null, reviewedData })
    const direction: "payable" | "receivable" = documentType === "sale" ? "receivable" : "payable"
    payload = { ...bill, documentType, direction, ...(resolvedAccountId ? { expenseAccountId: resolvedAccountId } : {}), ...(category ? { category } : {}) }
  }

  const push = await upsertWorkspaceIntegrationPush(workspaceId, {
    connectionId: connection.id, documentId: document.id, provider: connection.provider as "quickbooks" | "xero" | "bigcapital", payload, createdById: actorId,
  })
  await recordSystemAudit({ workspaceId, documentId: document.id, type: auditType })
  await attemptIntegrationPush(push.id)
  const updated = await prisma.integrationPush.findUnique({ where: { id: push.id }, select: { status: true } })
  if (updated?.status === "pending") await kickIntegrationPushDrain()
  return true
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
      select: { id: true, filename: true, reviewedData: true, rawExtraction: true, codingData: true, appliedRuleId: true, readinessStatus: true, docType: true, template: { select: { code: true } } },
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
