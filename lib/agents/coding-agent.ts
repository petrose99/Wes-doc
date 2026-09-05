import config from "@/lib/config"
import { requestLLM } from "@/ai/providers/llmProvider"
import { prisma } from "@/lib/db"
import { Prisma } from "@/prisma/client"
import { z } from "zod"
import crypto from "crypto"

const AGENT_KIND = "coding"

export const suggestionSchema = z.object({
  entries: z.array(z.object({
    key: z.string().max(80),
    value: z.string().max(200),
  })).max(10),
  confidence: z.number().min(0).max(1),
  rationale: z.string().max(500),
})

export type CodingSuggestion = {
  codingData: Record<string, string>
  confidence: number
  rationale: string
}

export type CodingAgentInput = {
  workspaceId: string
  documentId: string
  templateCode: string
  supplier: string | null
  documentData: Record<string, unknown>
  codingKeys: string[]
  exemplarRules: Array<{ supplier: string; coding: Record<string, string> }>
  corrections: Array<{ codingKey: string; wrongValue: string; correctedValue: string }>
}

export function buildInputHash(input: CodingAgentInput): string {
  const semantic = {
    templateCode: input.templateCode,
    supplier: input.supplier,
    documentData: input.documentData,
    codingKeys: input.codingKeys.slice().sort(),
    exemplarRules: input.exemplarRules,
    corrections: input.corrections,
  }
  return crypto.createHash("sha256").update(JSON.stringify(semantic)).digest("hex")
}

export function buildSystemPrompt(input: CodingAgentInput): string {
  const lines: string[] = [
    "You are a document coding assistant. Your job is to predict the correct accounting coding for a document based on patterns learned from existing supplier rules.",
    "",
    `Template: ${input.templateCode}`,
    `Coding keys to predict: ${input.codingKeys.join(", ")}`,
  ]

  if (input.exemplarRules.length) {
    lines.push("", "Existing supplier rules (examples of correct coding):")
    for (const rule of input.exemplarRules) {
      lines.push(`  Supplier "${rule.supplier}" → ${JSON.stringify(rule.coding)}`)
    }
  }

  if (input.corrections.length) {
    lines.push("", "Past corrections (you previously suggested wrong values — learn from these):")
    for (const c of input.corrections) {
      lines.push(`  Key "${c.codingKey}": you suggested "${c.wrongValue}" but the correct value was "${c.correctedValue}"`)
    }
  }

  lines.push(
    "",
    "Instructions:",
    "- Predict the coding based on the document's supplier and content, guided by the exemplar rules above.",
    "- Set confidence between 0 and 1. Use high confidence (≥ 0.9) only when the pattern is very clear.",
    "- If unsure, set confidence low so a human reviewer can check.",
    "- Only predict values for the coding keys listed above.",
    "- Your rationale should briefly explain why you chose these values.",
  )

  return lines.join("\n")
}

export async function suggestCoding(input: CodingAgentInput): Promise<CodingSuggestion | null> {
  const aiProvider = config.ai.provider
  const apiKey = aiProvider === "gemini" ? config.ai.geminiApiKey : config.ai.openaiApiKey
  if (!apiKey) return null

  const inputHash = buildInputHash(input)

  try {
    const cached = await prisma.agentVerdict.findFirst({
      where: { workspaceId: input.workspaceId, agentKind: AGENT_KIND, subjectId: input.documentId, inputHash },
      orderBy: { createdAt: "desc" },
    })

    if (cached) {
      const parsed = suggestionSchema.safeParse(cached.verdict)
      if (parsed.success) {
        const codingData: Record<string, string> = {}
        for (const entry of parsed.data.entries) {
          if (input.codingKeys.includes(entry.key)) codingData[entry.key] = entry.value
        }
        if (Object.keys(codingData).length === 0) return null
        return { codingData, confidence: parsed.data.confidence, rationale: parsed.data.rationale }
      }
    }

    const modelName = aiProvider === "gemini" ? config.ai.geminiModelName : config.ai.openaiModelName
    const systemPrompt = buildSystemPrompt(input)
    const documentSummary = JSON.stringify(input.documentData, null, 2).slice(0, 4000)
    const prompt = `${systemPrompt}\n\nDocument data:\n${documentSummary}\n${input.supplier ? `Supplier: ${input.supplier}` : ""}`

    const schema = {
      type: "object",
      properties: {
        entries: {
          type: "array",
          items: {
            type: "object",
            properties: { key: { type: "string" }, value: { type: "string" } },
            required: ["key", "value"],
          },
        },
        confidence: { type: "number" },
        rationale: { type: "string" },
      },
      required: ["entries", "confidence", "rationale"],
    }

    const response = await requestLLM(
      { providers: [{ provider: aiProvider, apiKey, model: modelName }] },
      { prompt, schema },
    )

    if (response.error) return null

    const parsed = suggestionSchema.safeParse(response.output)
    if (!parsed.success) return null

    const codingData: Record<string, string> = {}
    for (const entry of parsed.data.entries) {
      if (input.codingKeys.includes(entry.key)) codingData[entry.key] = entry.value
    }
    if (Object.keys(codingData).length === 0) return null

    await prisma.agentVerdict.upsert({
      where: { workspaceId_agentKind_subjectId_inputHash: { workspaceId: input.workspaceId, agentKind: AGENT_KIND, subjectId: input.documentId, inputHash } },
      create: {
        workspaceId: input.workspaceId,
        agentKind: AGENT_KIND,
        subjectType: "document",
        subjectId: input.documentId,
        documentId: input.documentId,
        inputHash,
        verdict: parsed.data as unknown as Prisma.InputJsonValue,
        rationale: { text: parsed.data.rationale } as unknown as Prisma.InputJsonValue,
        model: modelName,
      },
      update: {
        verdict: parsed.data as unknown as Prisma.InputJsonValue,
        rationale: { text: parsed.data.rationale } as unknown as Prisma.InputJsonValue,
        model: modelName,
      },
    })

    return { codingData, confidence: parsed.data.confidence, rationale: parsed.data.rationale }
  } catch (error) {
    console.error("[coding-agent] failed:", error instanceof Error ? error.message : error)
    return null
  }
}
