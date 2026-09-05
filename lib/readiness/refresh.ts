import { prisma } from "@/lib/db"
import { getWorkspaceCapabilities } from "@/lib/modules/capabilities"
import { evaluateReadiness, type Blocker } from "./evaluate"

const LOW_CONFIDENCE_THRESHOLD = 0.6

export async function refreshDocumentReadiness(workspaceId: string, documentId: string): Promise<Blocker[]> {
  const document = await prisma.document.findFirst({
    where: { id: documentId, workspaceId },
    select: {
      codingSource: true,
      codingConfidence: true,
      codingData: true,
      appliedRuleId: true,
      confidence: true,
      checkResults: { where: { status: { not: "pass" } }, select: { checkCode: true } },
    },
  })
  if (!document) return []

  const capabilities = await getWorkspaceCapabilities(workspaceId)
  const hasAiCoding = capabilities.has("ai-coding")
  const confidence = document.confidence as { missingRequiredFields?: string[]; fieldConfidence?: Record<string, number> } | null

  let codingSource = document.codingSource
  if (codingSource === "ai" && !hasAiCoding) {
    codingSource = null
  }

  const hasActiveRules = await prisma.automationRule.count({ where: { workspaceId, isActive: true } }).then((c) => c > 0)

  return evaluateReadiness({
    hasActiveRules,
    hasRuleMatch: document.appliedRuleId !== null,
    codingSource,
    codingConfidence: document.codingConfidence,
    missingRequiredFields: confidence?.missingRequiredFields ?? [],
    failedChecks: document.checkResults.map((r) => r.checkCode),
    fieldConfidence: confidence?.fieldConfidence ?? {},
    lowConfidenceThreshold: LOW_CONFIDENCE_THRESHOLD,
  })
}
