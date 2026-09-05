export type FieldSource = "rule" | "ai" | "manual" | "extraction"

export type FieldRationale = {
  source: FieldSource
  confidence?: number
  rationale?: string
}

export type RationaleInput = {
  fieldKey: string
  codingKeys: string[]
  codingSource: string | null
  codingConfidence: number | null
  aiRationale: string | null
  hasRuleMatch: boolean
}

export function fieldRationale(input: RationaleInput): FieldRationale {
  if (!input.codingKeys.includes(input.fieldKey)) {
    return { source: "extraction" }
  }

  if (input.codingSource === "ai") {
    return {
      source: "ai",
      confidence: input.codingConfidence ?? undefined,
      rationale: input.aiRationale ?? undefined,
    }
  }

  if (input.codingSource === "manual") {
    return { source: "manual" }
  }

  if (input.hasRuleMatch) {
    return { source: "rule" }
  }

  return { source: "extraction" }
}
