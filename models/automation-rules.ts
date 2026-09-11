// Deliberately NOT a "use server" module, matching models/documents.ts and models/review-tasks.ts:
// these helpers trust the workspaceId they are handed. Server actions live in
// app/(app)/workspaces/[workspaceId]/automation-actions.ts and do the auth.
import { track } from "@/lib/analytics"
import { suggestCoding, type CodingAgentInput } from "@/lib/agents/coding-agent"
import { AI_CODING_MIN_CONFIDENCE } from "@/lib/readiness/evaluate"
import { maybeAutopublish } from "@/lib/automation/autopublish"
import { applyRules, SUPPLIER_FIELD_BY_TEMPLATE, type AutomationRuleInput, type ExtractionForMatch, type RuleActions, type RuleMatcher } from "@/lib/automation/rules"
import { confidentAssignments, getVendorCodingPrior } from "@/lib/automation/vendor-history"
import { auditEventData, getRequestAuditContext } from "@/lib/audit"
import { prisma } from "@/lib/db"
import { getWorkspaceCapabilities } from "@/lib/modules/capabilities"
import { getCodingCorrectionExamples } from "@/models/coding-corrections"
import { createReviewTask } from "@/models/review-tasks"
import { loadVendorCodingHistory } from "@/models/vendor-history"
import { Prisma } from "@/prisma/client"
import { cache } from "react"

export const listAutomationRules = cache(async (workspaceId: string) => prisma.automationRule.findMany({
  where: { workspaceId },
  orderBy: [{ isActive: "desc" }, { hitCount: "desc" }, { createdAt: "asc" }],
}))

export async function createAutomationRule(input: { workspaceId: string; name: string; matcher: RuleMatcher; actions: RuleActions; minConfidence?: number | null; requireReview?: boolean; autopublish?: boolean; createdById: string | null }) {
  if (!input.matcher.value.trim()) throw new Error("matcher_value_required")
  return prisma.automationRule.create({
    data: {
      workspaceId: input.workspaceId, name: input.name.trim() || "Untitled rule",
      matcher: input.matcher as unknown as Prisma.InputJsonValue, actions: input.actions as unknown as Prisma.InputJsonValue,
      minConfidence: input.minConfidence ?? null, requireReview: input.requireReview ?? false,
      autopublish: input.autopublish ?? false, createdById: input.createdById,
    },
  })
}

/** Every rule the Vendors tab's "Pin as rule" button has created, keyed by the exact supplier
 * string it was pinned for. `createAutomationRule` names these rules "Pinned: <supplier>", which
 * is the only marker distinguishing a one-click pin from a rule an owner built by hand in
 * Settings → Rules — used so the Vendors tab can show "Pinned ✓" instead of letting a second
 * click silently create a duplicate rule for the same vendor. */
export async function listPinnedRuleIdsBySupplier(workspaceId: string): Promise<Map<string, string>> {
  const rows = await prisma.automationRule.findMany({
    where: { workspaceId, name: { startsWith: "Pinned: " } },
    select: { id: true, matcher: true },
  })
  const bySupplier = new Map<string, string>()
  for (const row of rows) {
    const matcher = row.matcher as { value?: string } | null
    if (matcher?.value) bySupplier.set(matcher.value, row.id)
  }
  return bySupplier
}

/** The "update rule" correction flow: a reviewer fixing a rule-applied field edits the rule
 * itself, which only ever changes what FUTURE documents get — this never touches a document
 * already coded by the old version, and never rewrites the rule.applied audit event that recorded
 * what actually happened at the time. */
export async function updateAutomationRule(input: { workspaceId: string; ruleId: string; actorId: string; name?: string; matcher?: RuleMatcher; actions?: RuleActions; minConfidence?: number | null; requireReview?: boolean; autopublish?: boolean; isActive?: boolean }) {
  const rule = await prisma.automationRule.findFirst({ where: { id: input.ruleId, workspaceId: input.workspaceId }, select: { id: true } })
  if (!rule) throw new Error("automation_rule_not_found")
  const context = await getRequestAuditContext()
  const [updated] = await prisma.$transaction([
    prisma.automationRule.update({
      where: { id: rule.id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() || "Untitled rule" } : {}),
        ...(input.matcher !== undefined ? { matcher: input.matcher as unknown as Prisma.InputJsonValue } : {}),
        ...(input.actions !== undefined ? { actions: input.actions as unknown as Prisma.InputJsonValue } : {}),
        ...(input.minConfidence !== undefined ? { minConfidence: input.minConfidence } : {}),
        ...(input.requireReview !== undefined ? { requireReview: input.requireReview } : {}),
        ...(input.autopublish !== undefined ? { autopublish: input.autopublish } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    }),
    prisma.documentAuditEvent.create({ data: auditEventData({ workspaceId: input.workspaceId, actorId: input.actorId, type: "rule.updated", detail: { ruleId: rule.id } }, context) }),
  ])
  // Only a real correction — the matcher or the coding itself changing — counts for this metric.
  // Flipping isActive, or editing the name, is bookkeeping, not "this rule was wrong".
  if (input.matcher !== undefined || input.actions !== undefined) {
    await track("automation_rule_corrected", { ruleId: input.ruleId }, { workspaceId: input.workspaceId, actorId: input.actorId })
  }
  return updated
}

/** Runs the pure engine against one document's already-committed extraction and persists whatever
 * it decides: coding data + which rule applied (or neither, on no match), a hit-count bump for the
 * rule that matched, a rule.applied audit event, and — for any of the engine's three review
 * reasons — a ReviewTask so the document surfaces in the queue (WP10) instead of silently landing
 * with unconfirmed coding. Called from the worker right after extraction commits
 * (lib/document-processing.ts); never throws past the caller, the same "must not break extraction
 * over a coding step" reasoning as every other post-extraction side effect there.
 *
 * AI coding fallback: when no rule matches and the workspace has ai-coding enabled, the coding
 * agent predicts the coding. High-confidence predictions keep the document touchless; low-confidence
 * ones land in review with the suggestion pre-filled. */
export async function applyAutomationRules(input: {
  workspaceId: string; documentId: string; templateCode: string; extraction: ExtractionForMatch
  aiContext?: { documentData: Record<string, unknown> }
}): Promise<void> {
  try {
    const rows = await prisma.automationRule.findMany({ where: { workspaceId: input.workspaceId, isActive: true } })
    const rules: AutomationRuleInput[] = rows.map((row) => ({
      id: row.id, matcher: row.matcher as unknown as RuleMatcher, actions: row.actions as unknown as RuleActions,
      minConfidence: row.minConfidence, requireReview: row.requireReview, isActive: row.isActive, createdAt: row.createdAt,
    }))
    const result = applyRules(rules, input.extraction)
    const context = await getRequestAuditContext()

    if (result.ruleId) {
      await prisma.$transaction([
        prisma.document.update({ where: { id: input.documentId }, data: { codingData: result.codingData as unknown as Prisma.InputJsonValue, appliedRuleId: result.ruleId, codingSource: "rule", codingConfidence: null } }),
        prisma.automationRule.update({ where: { id: result.ruleId }, data: { hitCount: { increment: 1 } } }),
        prisma.documentAuditEvent.create({ data: auditEventData({ workspaceId: input.workspaceId, documentId: input.documentId, type: "rule.applied", detail: { ruleId: result.ruleId, codingData: result.codingData } }, context) }),
      ])
    }

    // Gap 1: at autonomyLevel "suggest", speculative fallbacks (vendor history + AI) are
    // suppressed — only user-authored rules (workspace policy) apply, and everything else goes
    // to review for a person to code by hand. "auto" and "touchless" keep the full fallback
    // stack; the difference between them is whether the coded doc auto-publishes downstream
    // (maybeAutopublish → touchlessEnabled gate, unchanged).
    const config = await prisma.workspaceAutomationConfig.findUnique({
      where: { workspaceId: input.workspaceId },
      select: { autonomyLevel: true },
    })
    const level = (config?.autonomyLevel === "suggest" || config?.autonomyLevel === "auto" || config?.autonomyLevel === "touchless")
      ? config.autonomyLevel
      : "auto"

    if (result.reviewReason) {
      if (result.reviewReason === "no_match_risky") {
        if (level === "suggest") {
          await createReviewTask({ workspaceId: input.workspaceId, documentId: input.documentId, reason: "rule_required", detail: "Autonomy is set to Suggest — every document waits for manual coding.", createdById: null })
          return
        }
        // Phase 3 precedence: try the vendor-history prior BEFORE the LLM. If a workspace has
        // coded this supplier the same way many times before, that is the strongest signal
        // and skips both the LLM cost and the LLM's tendency to drift on well-known vendors.
        const historyHandled = await applyVendorHistoryCoding(input, rows, context)
        if (historyHandled) return
        const handled = await applyAiCodingFallback(input, rows, context)
        if (!handled) {
          await createReviewTask({ workspaceId: input.workspaceId, documentId: input.documentId, reason: "rule_required", detail: "No automation rule matched this document's supplier — coding was not applied.", createdById: null })
        }
      } else {
        const detail = result.reviewReason === "low_confidence"
          ? "The matched rule's supplier field was read at low confidence."
          : "The matched rule requires manual review."
        await createReviewTask({ workspaceId: input.workspaceId, documentId: input.documentId, reason: "rule_required", detail, createdById: null })
      }
    } else if (result.ruleId) {
      await maybeAutopublish(input.workspaceId, input.documentId, null)
    }
  } catch (error) {
    console.error("[automation] failed to apply rules:", error instanceof Error ? error.message : error)
  }
}

/** Phase 3: apply high-agreement vendor history directly (bypassing the LLM). Returns true when
 * the whole set of `codingKeys` was resolved from history so the caller stops before running the
 * LLM path. When only a subset is confident, we still fall through to the LLM but supply the
 * partial map as a prior. */
async function applyVendorHistoryCoding(
  input: { workspaceId: string; documentId: string; templateCode: string; extraction: ExtractionForMatch; aiContext?: { documentData: Record<string, unknown> } },
  activeRules: Array<{ matcher: unknown; actions: unknown }>,
  _context: unknown,
): Promise<boolean> {
  const supplier = input.extraction.supplierValue
  if (!supplier) return false
  const codingKeys = extractCodingKeys(activeRules)
  if (!codingKeys.length) return false

  const supplierField = SUPPLIER_FIELD_BY_TEMPLATE[input.templateCode]
  if (!supplierField) return false
  const history = await loadVendorCodingHistory(input.workspaceId, input.templateCode, supplierField)
  if (!history.length) return false

  const prior = getVendorCodingPrior(history, supplier, input.templateCode)
  const assignments = confidentAssignments(prior, codingKeys)
  const covered = codingKeys.every((key) => key in assignments)
  if (!covered) return false

  const auditContext = await getRequestAuditContext()
  await prisma.$transaction([
    prisma.document.update({
      where: { id: input.documentId },
      data: {
        codingData: assignments as unknown as Prisma.InputJsonValue,
        codingSource: "history",
        codingConfidence: prior.byKey[codingKeys[0]]?.agreement ?? null,
      },
    }),
    prisma.documentAuditEvent.create({
      data: auditEventData({
        workspaceId: input.workspaceId, documentId: input.documentId,
        type: "history_coding.applied",
        detail: { codingData: assignments, support: prior.support, byKey: prior.byKey },
      }, auditContext),
    }),
  ])
  await track("vendor_history_coding_applied", { documentId: input.documentId, support: prior.support }, { workspaceId: input.workspaceId })
  await maybeAutopublish(input.workspaceId, input.documentId, null)
  return true
}

async function applyAiCodingFallback(
  input: { workspaceId: string; documentId: string; templateCode: string; extraction: ExtractionForMatch; aiContext?: { documentData: Record<string, unknown> } },
  activeRules: Array<{ matcher: unknown; actions: unknown }>,
  _context: unknown,
): Promise<boolean> {
  if (!input.aiContext) return false

  const caps = await getWorkspaceCapabilities(input.workspaceId)
  if (!caps.has("ai-coding")) return false

  const doc = await prisma.document.findFirst({
    where: { id: input.documentId, workspaceId: input.workspaceId },
    select: { codingData: true, codingSource: true },
  })
  if (doc?.codingSource === "manual") return false

  const codingKeys = extractCodingKeys(activeRules)
  if (!codingKeys.length) return false

  const exemplarRules = buildExemplarRules(activeRules)
  const corrections = await getCodingCorrectionExamples(input.workspaceId, input.templateCode)

  // Phase 3: pass the vendor prior as a soft signal even in the LLM path. Confident cases
  // already short-circuited above (applyVendorHistoryCoding) — what we get here is medium-support
  // history the LLM should weight.
  let vendorHistoryStats: CodingAgentInput["vendorHistory"] = undefined
  const supplierField = SUPPLIER_FIELD_BY_TEMPLATE[input.templateCode]
  if (supplierField && input.extraction.supplierValue) {
    const history = await loadVendorCodingHistory(input.workspaceId, input.templateCode, supplierField)
    if (history.length) {
      const prior = getVendorCodingPrior(history, input.extraction.supplierValue, input.templateCode)
      if (prior.support > 0) {
        vendorHistoryStats = codingKeys
          .map((key) => {
            const s = prior.byKey[key]
            return s ? { key, modalValue: s.modalValue, support: s.support, agreement: s.agreement } : null
          })
          .filter((v): v is NonNullable<typeof v> => v !== null)
      }
    }
  }

  const agentInput: CodingAgentInput = {
    workspaceId: input.workspaceId,
    documentId: input.documentId,
    templateCode: input.templateCode,
    supplier: input.extraction.supplierValue,
    documentData: input.aiContext.documentData,
    codingKeys,
    exemplarRules: exemplarRules.slice(0, 15),
    corrections,
    vendorHistory: vendorHistoryStats,
  }

  const suggestion = await suggestCoding(agentInput)
  if (!suggestion || Object.keys(suggestion.codingData).length === 0) return false

  const auditContext = await getRequestAuditContext()
  await prisma.$transaction([
    prisma.document.update({
      where: { id: input.documentId },
      data: {
        codingData: suggestion.codingData as unknown as Prisma.InputJsonValue,
        codingSource: "ai",
        codingConfidence: suggestion.confidence,
      },
    }),
    prisma.documentAuditEvent.create({
      data: auditEventData({
        workspaceId: input.workspaceId, documentId: input.documentId,
        type: "ai_coding.suggested",
        detail: { codingData: suggestion.codingData, confidence: suggestion.confidence, rationale: suggestion.rationale },
      }, auditContext),
    }),
  ])

  await track("ai_coding_suggested", { documentId: input.documentId, confidence: suggestion.confidence }, { workspaceId: input.workspaceId })

  if (suggestion.confidence < AI_CODING_MIN_CONFIDENCE) {
    await createReviewTask({
      workspaceId: input.workspaceId,
      documentId: input.documentId,
      reason: "ai_suggestion",
      detail: `AI suggested coding (${Math.round(suggestion.confidence * 100)}% confident): ${JSON.stringify(suggestion.codingData)}. Rationale: ${suggestion.rationale}`,
      createdById: null,
    })
  }

  return true
}

function extractCodingKeys(rules: Array<{ actions: unknown }>): string[] {
  const keys = new Set<string>()
  for (const rule of rules) {
    const actions = rule.actions as { codingData?: Record<string, string> } | null
    if (actions?.codingData) {
      for (const key of Object.keys(actions.codingData)) keys.add(key)
    }
  }
  return [...keys]
}

function buildExemplarRules(rules: Array<{ matcher: unknown; actions: unknown }>): Array<{ supplier: string; coding: Record<string, string> }> {
  const exemplars: Array<{ supplier: string; coding: Record<string, string> }> = []
  for (const rule of rules) {
    const matcher = rule.matcher as { value?: string } | null
    const actions = rule.actions as { codingData?: Record<string, string> } | null
    if (matcher?.value && actions?.codingData) {
      exemplars.push({ supplier: matcher.value, coding: actions.codingData })
    }
  }
  return exemplars
}
