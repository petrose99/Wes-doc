import { checkDocumentBudgets } from "@/lib/budget/resolve"
import { generateApprovalContext } from "@/lib/agents/approval-context-agent"
import { evaluatePolicy, type PolicyDecision } from "@/lib/agents/policy-agent"
import { track } from "@/lib/analytics"
import { recordSystemAudit } from "@/lib/audit"
import { prisma } from "@/lib/db"
import { getWorkspaceCapabilities } from "@/lib/modules/capabilities"
import { resolveReviewAssignee } from "@/lib/review-routing/resolve"
import { parseTemplateFields } from "@/lib/document-templates"
import { createReviewTask } from "@/models/review-tasks"
import { markSupplierTouchless } from "@/models/suppliers"
import type { Prisma } from "@/prisma/client"
import { SUPPLIER_FIELD_BY_TEMPLATE } from "@/lib/automation/rules"
import { resolveSupplier } from "@/lib/suppliers/alias"
import { evaluateReadiness, isTouchlessEligible, type Blocker, type CheckInput, type PolicyVerdict, type ReadinessResult } from "./evaluate"
import { shouldSampleForQa, supplierThreshold, type SupplierThresholdInput } from "./supplier-thresholds"
import { bandFor, parseBands } from "./amount-band"
import { detectRecurrence } from "./recurrence"

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
        readinessDetail: true,
        fieldSnapshot: true,
        codingSource: true,
        codingConfidence: true,
        template: { select: { code: true } },
        checkResults: { select: { checkCode: true, status: true } },
        reviewTasks: { where: { status: { in: ["open", "in_review"] } }, select: { id: true }, take: 1 },
      },
    })
    if (!document) return null

    const automationConfig = await prisma.workspaceAutomationConfig.findUnique({
      where: { workspaceId: input.workspaceId },
      select: { minConfidence: true, blockOnWarnChecks: true, requirePolicyPass: true, policyText: true, qaSampleRate: true, amountBands: true, criticalFieldsByTemplate: true },
    })
    const workspaceMinConfidence = automationConfig?.minConfidence ?? 0.85
    const blockOnWarnChecks = automationConfig?.blockOnWarnChecks ?? false
    const requirePolicyPass = automationConfig?.requirePolicyPass ?? false
    const qaSampleRate = automationConfig?.qaSampleRate ?? 0.05
    const bands = parseBands((automationConfig?.amountBands ?? []) as unknown)
    const criticalMap = (automationConfig?.criticalFieldsByTemplate ?? {}) as Record<string, unknown>
    const criticalFieldKeys = document.template?.code && Array.isArray(criticalMap[document.template.code])
      ? (criticalMap[document.template.code] as unknown[]).filter((entry): entry is string => typeof entry === "string")
      : undefined

    // From fieldSnapshot — the field DEFINITIONS as they stood when this document was extracted,
    // not the live template. A template edited since then must not retroactively judge an old
    // document by requirements it never had a chance to satisfy.
    const requiredFieldKeys = (() => {
      try { return parseTemplateFields(document.fieldSnapshot).filter((field) => field.required).map((field) => field.key) }
      catch { return [] }
    })()

    // A1.1 + A1.4: resolve the extracted supplier and read its rolling stats to pick a
    // per-document floor. Unknown supplier (no field, extraction failed, empty registry) treats
    // as new — so cold-start applies and the strict 0.98 threshold holds. Wrapped in try so a
    // registry hiccup can't take readiness offline.
    let supplierStats: SupplierThresholdInput = { workspaceMinConfidence, touchlessSeen: null, consecutiveClean: null }
    try {
      const extractedData = (document.rawExtraction as Record<string, unknown> | null) ?? {}
      const supplierField = document.template?.code ? SUPPLIER_FIELD_BY_TEMPLATE[document.template.code] : undefined
      const rawSupplier = supplierField ? extractedData[supplierField] : null
      if (typeof rawSupplier === "string" && rawSupplier.trim()) {
        const resolution = await resolveSupplier(input.workspaceId, rawSupplier)
        if (resolution.supplierId) {
          const supplierRow = await prisma.supplier.findUnique({
            where: { id: resolution.supplierId },
            select: { touchlessSeen: true, consecutiveClean: true },
          })
          supplierStats = {
            workspaceMinConfidence,
            touchlessSeen: supplierRow?.touchlessSeen ?? 0,
            consecutiveClean: supplierRow?.consecutiveClean ?? 0,
          }
        }
      }
    } catch (error) {
      console.error("[readiness] supplier-threshold lookup failed, using workspace default:", error instanceof Error ? error.message : error)
    }
    const supplierVerdict = supplierThreshold(supplierStats)
    // A1.2: an amount band may relax the per-supplier floor for small, low-risk documents.
    const totalRaw = ((document.rawExtraction as Record<string, unknown> | null) ?? {})?.total
    const amountForBand = typeof totalRaw === "number" ? totalRaw : null
    const bandVerdict = bandFor({
      amount: amountForBand,
      supplierVerified: (supplierStats.touchlessSeen ?? 0) >= 10,
      workspaceMinConfidence: supplierVerdict.effectiveMinConfidence,
      bands,
    })
    const minConfidence = bandVerdict.minConfidence
    // A1.3: pick this document into the QA sample deterministically by its own id.
    const qaSample = shouldSampleForQa(document.id, qaSampleRate)

    // A1.5: recurrence match — pull this supplier's history for the same template and check
    // the cadence/amount pattern. Best-effort; silent on any failure.
    let isRecurring = false
    try {
      const extractedData = (document.rawExtraction as Record<string, unknown> | null) ?? {}
      const supplierField = document.template?.code ? SUPPLIER_FIELD_BY_TEMPLATE[document.template.code] : undefined
      const rawSupplier = supplierField ? extractedData[supplierField] : null
      const dateField = document.template?.code === "invoice" ? "issue_date" : "purchase_date"
      const dateRaw = extractedData[dateField]
      const amount = typeof extractedData.total === "number" ? extractedData.total : null
      const date = typeof dateRaw === "string" ? new Date(dateRaw) : null
      if (typeof rawSupplier === "string" && rawSupplier.trim() && amount !== null && date && !Number.isNaN(date.getTime())) {
        const resolution = await resolveSupplier(input.workspaceId, rawSupplier)
        if (resolution.supplierId) {
          const siblings = await prisma.document.findMany({
            where: { workspaceId: input.workspaceId, template: { code: document.template?.code }, id: { not: document.id } },
            select: { rawExtraction: true },
            orderBy: { receivedAt: "desc" },
            take: 24,
          })
          const history: { date: Date; amount: number }[] = []
          for (const sibling of siblings) {
            const values = (sibling.rawExtraction as Record<string, unknown> | null) ?? {}
            const otherSupplier = supplierField ? values[supplierField] : null
            if (typeof otherSupplier !== "string") continue
            const otherResolution = await resolveSupplier(input.workspaceId, otherSupplier)
            if (otherResolution.supplierId !== resolution.supplierId) continue
            const otherAmount = typeof values.total === "number" ? values.total : null
            const otherDateRaw = values[dateField]
            const otherDate = typeof otherDateRaw === "string" ? new Date(otherDateRaw) : null
            if (otherAmount === null || !otherDate || Number.isNaN(otherDate.getTime())) continue
            history.push({ date: otherDate, amount: otherAmount })
            if (history.length >= 12) break
          }
          isRecurring = detectRecurrence({ amount, date, history }).isRecurring
        }
      }
    } catch (error) {
      console.error("[readiness] recurrence check failed:", error instanceof Error ? error.message : error)
    }

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
      // With the ai-coding module off, an "ai" coding source no longer counts for anything —
      // the document blocks on no_rule_match as if the suggestion never happened.
      codingSource: document.codingSource === "ai" && !capabilities.has("ai-coding") ? null : document.codingSource,
      codingConfidence: document.codingConfidence,
      // A1.5: a recurring pattern releases the cold-start block — a supplier's twelfth known-good
      // monthly bill isn't "new" in any meaningful sense.
      supplierColdStart: supplierVerdict.coldStart && !isRecurring,
      qaSample,
      criticalFieldKeys,
      requiredFieldKeys,
      isRecurring,
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

    // A1.1/A1.4: credit the supplier when this document becomes touchless-ELIGIBLE, not when it
    // reaches "ready". Crediting on "ready" deadlocked: supplier_cold_start blocks "ready" until
    // touchlessSeen reaches its threshold, and touchlessSeen only moved on "ready", so no supplier
    // could ever graduate and touchless never fired for anyone. Counting eligibility lets a
    // supplier earn trust from the first N documents — which still go to a human, exactly as
    // A1.4 intends — and lets the (N+1)th push untouched.
    //
    // Gated on the eligibility TRANSITION rather than statusChanged, so a document is credited at
    // most once however many times readiness is recomputed for it. Under-counting on a later
    // recovery is the safe direction here; over-counting would buy a supplier unearned trust on a
    // path that ends in real money leaving the accounting system.
    const previousBlockers = Array.isArray(document.readinessDetail) ? (document.readinessDetail as unknown as Blocker[]) : null
    const wasEligible = previousBlockers ? isTouchlessEligible(previousBlockers) : false
    const nowEligible = isTouchlessEligible(result.blockers)
    if (nowEligible && !wasEligible) {
      try {
        const extractedData = (document.rawExtraction as Record<string, unknown> | null) ?? {}
        const supplierField = document.template?.code ? SUPPLIER_FIELD_BY_TEMPLATE[document.template.code] : undefined
        const rawSupplier = supplierField ? extractedData[supplierField] : null
        if (typeof rawSupplier === "string" && rawSupplier.trim()) {
          await markSupplierTouchless(input.workspaceId, rawSupplier)
        }
      } catch (error) {
        console.error("[readiness] failed to bump supplier streak:", error instanceof Error ? error.message : error)
      }
    }

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
