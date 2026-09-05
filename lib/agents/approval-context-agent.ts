import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { generateObject } from "ai"
import config from "@/lib/config"
import { prisma } from "@/lib/db"
import type { Prisma } from "@/prisma/client"
import { createHash } from "crypto"
import { z } from "zod"

const AGENT_KIND = "approval_context"

const contextSchema = z.object({
  summary: z.string().max(500),
  keyDataPoints: z.array(z.object({
    label: z.string().max(60),
    value: z.string().max(200),
    concern: z.string().max(200).optional(),
  })).max(10),
  suggestedAction: z.enum(["approve", "reject", "request_more_info"]),
  suggestedActionReason: z.string().max(300),
})

export type ApprovalContext = z.infer<typeof contextSchema>

export type ApprovalContextInput = {
  workspaceId: string
  documentId: string
  documentData: Record<string, unknown>
  templateCode: string
  policyViolationReasons: string[]
  policyText: string
}

function buildInputHash(input: ApprovalContextInput): string {
  const payload = JSON.stringify({
    documentData: input.documentData,
    templateCode: input.templateCode,
    policyViolationReasons: input.policyViolationReasons,
    policyText: input.policyText,
  })
  return createHash("sha256").update(payload).digest("hex")
}

function buildSystemPrompt(policyText: string): string {
  return `You are a review assistant for an accounting automation system. A document was escalated for human review because the policy agent flagged concerns.

Your job is to help the human reviewer by:
1. Summarizing why the document was escalated
2. Highlighting the key data points the reviewer should check
3. Suggesting an action with reasoning

Workspace policy:
${policyText}

Be concise and specific. Focus on what matters for the reviewer's decision.`
}

function formatContextAsDetail(context: ApprovalContext): string {
  const lines: string[] = []
  lines.push(`Policy review: ${context.summary}`)
  lines.push("")
  if (context.keyDataPoints.length > 0) {
    lines.push("Key data points:")
    for (const dp of context.keyDataPoints) {
      const concern = dp.concern ? ` — ${dp.concern}` : ""
      lines.push(`  • ${dp.label}: ${dp.value}${concern}`)
    }
    lines.push("")
  }
  lines.push(`Suggested action: ${context.suggestedAction.replace(/_/g, " ")} — ${context.suggestedActionReason}`)
  return lines.join("\n")
}

export async function generateApprovalContext(input: ApprovalContextInput): Promise<{ context: ApprovalContext; detail: string }> {
  const inputHash = buildInputHash(input)

  const cached = await prisma.agentVerdict.findFirst({
    where: {
      workspaceId: input.workspaceId,
      agentKind: AGENT_KIND,
      subjectId: input.documentId,
      inputHash,
    },
    select: { verdict: true },
    orderBy: { createdAt: "desc" },
  })

  if (cached) {
    const parsed = contextSchema.safeParse(cached.verdict)
    if (parsed.success) return { context: parsed.data, detail: formatContextAsDetail(parsed.data) }
  }

  const apiKey = config.ai.geminiApiKey
  if (!apiKey) {
    const fallback: ApprovalContext = {
      summary: "Policy agent flagged this document for review.",
      keyDataPoints: [],
      suggestedAction: "request_more_info",
      suggestedActionReason: "AI review unavailable — no provider configured.",
    }
    return { context: fallback, detail: formatContextAsDetail(fallback) }
  }

  const google = createGoogleGenerativeAI({ apiKey })
  const modelName = config.ai.geminiModelName

  const result = await generateObject({
    model: google(modelName),
    schema: contextSchema,
    system: buildSystemPrompt(input.policyText),
    prompt: `Review this escalated ${input.templateCode} document.

Escalation reasons from policy agent:
${input.policyViolationReasons.map((r) => `• ${r}`).join("\n")}

Document data:
${JSON.stringify(input.documentData, null, 2)}`,
  })

  const context = result.object

  await prisma.agentVerdict.create({
    data: {
      workspaceId: input.workspaceId,
      agentKind: AGENT_KIND,
      subjectType: "document",
      subjectId: input.documentId,
      documentId: input.documentId,
      verdict: context as unknown as Prisma.InputJsonValue,
      rationale: { reasons: input.policyViolationReasons } as unknown as Prisma.InputJsonValue,
      model: modelName,
      inputHash,
    },
  })

  return { context, detail: formatContextAsDetail(context) }
}

export { buildInputHash as buildApprovalInputHash, buildSystemPrompt as buildApprovalSystemPrompt, contextSchema, formatContextAsDetail }
