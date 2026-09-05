/** Per-field coding rationale — pure, no Prisma.
 *
 * Explains WHY each field has the value it does: was it auto-coded by a rule, derived from a
 * few-shot correction example, or extracted by the LLM? The UI uses this to show a source badge
 * and a confidence score on every field, and to let a reviewer correct a wrong value in one click. */

export type FieldSource = "rule" | "few_shot" | "extraction"

export type FewShotAttribution = {
  fieldKey: string
  wrongValue: string
  correctedValue: string
}

export type FieldRationale = {
  fieldKey: string
  source: FieldSource
  ruleId: string | null
  ruleName: string | null
  correctionExample: FewShotAttribution | null
  provenanceQuote: string | null
  confidence: number | null
}

export type RationaleInput = {
  codingData: Record<string, unknown> | null
  appliedRuleId: string | null
  appliedRuleName: string | null
  fieldConfidences: Record<string, number> | null
  provenance: Record<string, unknown> | null
  fewShotExamples: FewShotAttribution[]
  fieldKeys: string[]
}

export function buildFieldRationales(input: RationaleInput): FieldRationale[] {
  const codingKeys = new Set(Object.keys(input.codingData ?? {}))
  const fewShotByField = new Map<string, FewShotAttribution>()
  for (const example of input.fewShotExamples) {
    if (!fewShotByField.has(example.fieldKey)) {
      fewShotByField.set(example.fieldKey, example)
    }
  }

  return input.fieldKeys.map((fieldKey) => {
    const confidence = input.fieldConfidences?.[fieldKey] ?? null

    if (codingKeys.has(fieldKey)) {
      return {
        fieldKey,
        source: "rule" as const,
        ruleId: input.appliedRuleId,
        ruleName: input.appliedRuleName,
        correctionExample: null,
        provenanceQuote: null,
        confidence,
      }
    }

    const fewShot = fewShotByField.get(fieldKey)
    if (fewShot) {
      return {
        fieldKey,
        source: "few_shot" as const,
        ruleId: null,
        ruleName: null,
        correctionExample: fewShot,
        provenanceQuote: extractQuote(input.provenance, fieldKey),
        confidence,
      }
    }

    return {
      fieldKey,
      source: "extraction" as const,
      ruleId: null,
      ruleName: null,
      correctionExample: null,
      provenanceQuote: extractQuote(input.provenance, fieldKey),
      confidence,
    }
  })
}

function extractQuote(provenance: Record<string, unknown> | null, fieldKey: string): string | null {
  if (!provenance) return null
  const fields = provenance.fields as Record<string, unknown> | undefined
  if (!fields) return null
  const ref = fields[fieldKey] as Record<string, unknown> | undefined
  if (!ref) return null
  return typeof ref.quote === "string" ? ref.quote : null
}
