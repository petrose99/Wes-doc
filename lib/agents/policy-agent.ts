import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { generateObject } from "ai"
import config from "@/lib/config"
import { prisma } from "@/lib/db"
import { createHash } from "crypto"
import { z } from "zod"

const AGENT_KIND = "policy"

const verdictSchema = z.object({
  decision: z.enum(["approve", "escalate", "reject"]),
  reasons: z.array(z.string().max(200)).max(10),
})

export type PolicyDecision = z.infer<typeof verdictSchema>

export type PolicyAgentInput = {
  workspaceId: string
  documentId: string
  documentData: Record<string, unknown>
  templateCode: string
  policyText: string
}

function buildInputHash(input: PolicyAgentInput): string {
  const payload = JSON.stringify({
    documentData: input.documentData,
    templateCode: input.templateCode,
    policyText: input.policyText,
  })
  return createHash("sha256").update(payload).digest("hex")
}

function buildSystemPrompt(policyText: string): string {
  return `You are a document policy reviewer for an accounting automation system.

Your job is to review extracted document data against the workspace's policy and decide whether the document should be:
- "approve": The document complies with all policy requirements and can proceed automatically.
- "escalate": The document has issues that need human review but is not clearly non-compliant.
- "reject": The document clearly violates the policy.

Workspace policy:
${policyText}

Respond with your decision and a list of reasons. Be concise and specific. Each reason should reference a specific policy requirement and the document field or value that does or does not comply.`
}

export async function evaluatePolicy(input: PolicyAgentInput): Promise<PolicyDecision> {
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
    const parsed = verdictSchema.safeParse(cached.verdict)
    if (parsed.success) return parsed.data
  }

  const apiKey = config.ai.geminiApiKey
  if (!apiKey) {
    return { decision: "escalate", reasons: ["Policy evaluation unavailable: no AI provider configured."] }
  }

  const google = createGoogleGenerativeAI({ apiKey })
  const modelName = config.ai.geminiModelName

  const result = await generateObject({
    model: google(modelName),
    schema: verdictSchema,
    system: buildSystemPrompt(input.policyText),
    prompt: `Review this ${input.templateCode} document:\n\n${JSON.stringify(input.documentData, null, 2)}`,
  })

  const verdict = result.object

  await prisma.agentVerdict.create({
    data: {
      workspaceId: input.workspaceId,
      agentKind: AGENT_KIND,
      subjectType: "document",
      subjectId: input.documentId,
      documentId: input.documentId,
      verdict: verdict as unknown as Record<string, unknown>,
      rationale: { reasons: verdict.reasons } as unknown as Record<string, unknown>,
      model: modelName,
      inputHash,
    },
  })

  return verdict
}

export { buildInputHash, buildSystemPrompt, verdictSchema }
