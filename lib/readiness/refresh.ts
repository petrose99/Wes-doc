import { checkDocumentBudgets } from "@/lib/budget/resolve"
import { generateApprovalContext } from "@/lib/agents/approval-context-agent"
import { evaluatePolicy, type PolicyDecision } from "@/lib/agents/policy-agent"
import { track } from "@/lib/analytics"
import { recordSystemAudit } from "@/lib/audit"
import { prisma } from "@/lib/db"
import { getWorkspaceCapabilities } from "@/lib/modules/capabilities"
import { resolveReviewAssignee } from "@/lib/review-routing/resolve"
import { createReviewTask } from "@/models/review-tasks"
import type { Prisma } from "@/prisma/client"
import { evaluateReadiness, type CheckInput, type PolicyVerdict, type ReadinessResult } from "./evaluate"

type RefreshInput = {
  workspaceId: string
  documentId: string
}

export async function refreshDocumentReadiness(input: RefreshInput): Promise<ReadinessResult | null> {
  try {
    const caps = await getWorkspaceCapabilities(input.workspaceId)
    if (!caps.has("touchless-automation")) return null

    const document = await prisma.document.findFirst({
      where: { id: input.documentId, workspaceId: input.workspaceId },
      select: {
        id: true,
        confidence: true,
        rawExtraction: true,
        appliedRuleId: true,
        readinessStatus: true,
        template: { select: { code: true } },
        checkResults: { select: { checkCode: true, status: true } },
        reviewTasks: { where: { status: { in: ["open", "in_review"] } }, select: { id: true }, take: 1 },
      },
    })
    if (!document) return null

    const automationConfig = await prisma.workspaceAutomationConfig.findUnique({
      where: { workspaceId: input.workspaceId },
      select: { minConfidence: true, blockOnWarnChecks: true, requirePolicyPass: true, policyText: true },
    })
    const minConfidence = automationConfig?.minConfidence ?? 0.85
    const blockOnWarnChecks = automationConfig?.blockOnWarnChecks ?? false
    const requirePolicyPass = automationConfig?.requirePolicyPass ?? false

    const hasActiveRules = await prisma.automationRule.count({
      where: { workspaceId: input.workspaceId, isActive: true },
    }).then((count) => count > 0)

    const capabilities = await getWorkspaceCapabilities(input.workspaceId)
    const templateCode = document.template?.code ?? ""
    const isPushable = capabilities.has("accounting-push") && capabilities.pushableTemplateCodes.includes(templateCode)

    const checkResults: CheckInput[] = document.checkResults.map((cr) => ({
      checkCode: cr.checkCode,
      status: cr.status as "pass" | "warn" | "fail",
    }))

    let policyVerdict: PolicyVerdict = "disabled"
    let policyDecision: PolicyDecision | null = null
    const policyText = (automationConfig as Record<string, unknown> | null)?.policyText as string | null
    if (capabilities.has("policy-agent") && requirePolicyPass && document.rawExtraction !== null && policyText) {
      try {
        const documentData = (document.rawExtraction as Record<string, unknown>) ?? {}
        policyDecision = await evaluatePolicy({
          workspaceId: input.workspaceId,
          documentId: document.id,
          documentData,
          templateCode,
          policyText,
        })
        policyVerdict = policyDecision.decision === "approve" ? "pass"
          : policyDecision.decision === "reject" ? "violation"
          : "pass"
      } catch {
        policyVerdict = "error"
      }
    }

    let budgetExceeded = false
    if (capabilities.has("budget-controls") && document.rawExtraction !== null) {
      try {
        const extractedData = (document.rawExtraction as Record<string, unknown>) ?? {}
        const vendor = typeof extractedData.vendor === "string" ? extractedData.vendor : typeof extractedData.merchant === "string" ? extractedData.merchant : null
        const amount = typeof extractedData.total === "number" ? extractedData.total : null
        const category = typeof (extractedData as Record<string, unknown>).account === "string" ? (extractedData as Record<string, unknown>).account as string : null
        const budgetResults = await checkDocumentBudgets(input.workspaceId, { templateCode, vendor, category, amount })
        budgetExceeded = budgetResults.some((r) => r.status === "exceeded")
      } catch {
        // budget check failures are non-fatal
      }
    }

    const result = evaluateReadiness({
      fieldConfidences: (document.confidence as Record<string, unknown> | null)?.fieldConfidence as Record<string, number> | null ?? null,
      minConfidence,
      checkResults,
      blockOnWarnChecks,
      hasExtraction: document.rawExtraction !== null,
      appliedRuleId: document.appliedRuleId,
      hasActiveRules,
      hasOpenReviewTask: document.reviewTasks.length > 0,
      policyVerdict,
      isPushable,
      budgetExceeded,
    })

    const previousStatus = document.readinessStatus
    const statusChanged = previousStatus !== result.status

    const readyAt = result.status === "ready" && previousStatus !== "ready" ? new Date() : undefined

    await prisma.document.update({
      where: { id: document.id },
      data: {
        readinessStatus: result.status,
        readinessDetail: result.blockers as unknown as Prisma.InputJsonValue,
        ...(readyAt ? { readyAt } : {}),
        ...(result.status === "blocked" ? { readyAt: null } : {}),
      },
    })

    if (statusChanged) {
      await recordSystemAudit({
        workspaceId: input.workspaceId,
        documentId: document.id,
        type: "readiness_evaluated",
        detail: { status: result.status, blockerCount: result.blockers.length } as Prisma.InputJsonValue,
      })

      if (result.status === "ready") {
        await track("document_ready", { documentId: document.id }, { workspaceId: input.workspaceId })
      } else {
        await track("document_blocked", { documentId: document.id, blockerCount: result.blockers.length }, { workspaceId: input.workspaceId })
      }
    }

    if (policyVerdict === "violation" && policyDecision && document.reviewTasks.length === 0 && policyText) {
      try {
        const documentData = (document.rawExtraction as Record<string, unknown>) ?? {}
        const { detail } = await generateApprovalContext({
          workspaceId: input.workspaceId,
          documentId: document.id,
          documentData,
          templateCode,
          policyViolationReasons: policyDecision.reasons,
          policyText,
        })
        const extractedData = (document.rawExtraction as Record<string, unknown>) ?? {}
        const vendor = typeof extractedData.vendor === "string" ? extractedData.vendor : typeof extractedData.merchant === "string" ? extractedData.merchant : null
        const amount = typeof extractedData.total === "number" ? extractedData.total : null
        const assigneeId = await resolveReviewAssignee(input.workspaceId, { templateCode, vendor, amount })

        await createReviewTask({
          workspaceId: input.workspaceId,
          documentId: document.id,
          reason: "check_failed",
          detail,
          assigneeId,
          createdById: null,
        })
      } catch (error) {
        console.error("[readiness] failed to create policy review task:", error instanceof Error ? error.message : error)
      }
    }

    return result
  } catch (error) {
    console.error("[readiness] failed to refresh:", error instanceof Error ? error.message : error)
    return null
  }
}
