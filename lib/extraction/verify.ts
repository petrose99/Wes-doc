import { requestLLM, type LLMSettings } from "@/ai/providers/llmProvider"
import { buildDocumentJsonSchema, extractFieldConfidence, validateDocumentValues, type DocumentFieldDefinition } from "@/lib/document-templates"

/** Targeted extraction verification — the accuracy half of the calibrate/verify pair.
 *
 * lib/extraction/calibrate.ts identifies fields with concrete evidence of a misread (a number
 * that appears nowhere in the OCR text, participants in an arithmetic identity that failed to
 * reconcile). This module spends ONE extra focused LLM pass on exactly those fields: the model
 * re-reads the document knowing what the first pass produced and why it is suspect, and returns
 * either the same value (independent agreement — genuine evidence of correctness) or a
 * correction. Never triggered when the first pass already reconciles, so well-formed documents
 * cost one LLM call as before. */

export type VerificationOutcome = {
  /** Only the fields the model returned — apply over the first-pass extraction. */
  values: Record<string, unknown>
  /** Confidence for the verified fields: the second pass's own score, floored at
   * AGREEMENT_CONFIDENCE when both passes read the same value independently. */
  confidence: Record<string, number>
  /** Keys whose value actually changed from the first pass. */
  changed: string[]
}

/** Two independent passes agreeing is stronger evidence than either pass's self-report. */
export const AGREEMENT_CONFIDENCE = 0.9
/** A corrected value is better than the suspect one but has only one pass behind it. */
const CORRECTION_DEFAULT_CONFIDENCE = 0.85

export function buildVerificationPrompt(templateName: string, fields: DocumentFieldDefinition[], extraction: Record<string, unknown>): string {
  return [
    `A first extraction pass over this ${templateName} produced values that failed the document's own consistency checks (totals that don't add up, or numbers not found in the document text).`,
    "Re-read the document text below carefully and verify each field listed here. For every field, return the value actually printed in the document — the same value if the first pass read it correctly, the corrected value if it misread.",
    "Do not copy the first-pass value without checking it against the text. Pay particular attention to digits: transposed digits, a 0 read as 8 or 6, missing decimal points, and thousands separators are the most common misreads.",
    "Fields to verify (with the first pass's possibly-wrong values):",
    ...fields.map((field) => `- ${field.key} (${field.type}): first pass extracted ${JSON.stringify(extraction[field.key] ?? null)}`),
    "Dates use YYYY-MM-DD. Amounts are plain numbers. Never convert currencies.",
    "Also return a `_confidence` object with a 0-1 score for each field, reflecting how certain you are after re-reading.",
  ].join("\n")
}

export async function verifySuspectFields(input: {
  settings: LLMSettings
  templateName: string
  fields: DocumentFieldDefinition[]
  suspectKeys: string[]
  extraction: Record<string, unknown>
  textParts: string[]
}): Promise<VerificationOutcome | null> {
  const subset = input.fields.filter((field) => input.suspectKeys.includes(field.key))
  if (!subset.length) return null

  try {
    const prompt = buildVerificationPrompt(input.templateName, subset, input.extraction)
    const schema = buildDocumentJsonSchema(subset)
    const response = await requestLLM(input.settings, { prompt, schema, textParts: input.textParts })
    if (response.error) return null

    const verified = validateDocumentValues(subset, response.output)
    const verifiedConfidence = extractFieldConfidence(subset, response.output)
    return reconcileVerification(subset, input.extraction, verified, verifiedConfidence)
  } catch (error) {
    console.error("[extraction-verify] failed:", error instanceof Error ? error.message : error)
    return null
  }
}

/** Pure merge of a verification pass over the first-pass values — exported for tests. */
export function reconcileVerification(
  fields: DocumentFieldDefinition[],
  firstPass: Record<string, unknown>,
  verified: Record<string, unknown>,
  verifiedConfidence: Record<string, number>,
): VerificationOutcome {
  const values: Record<string, unknown> = {}
  const confidence: Record<string, number> = {}
  const changed: string[] = []

  for (const field of fields) {
    const next = verified[field.key]
    if (next === undefined || next === null) continue
    const previous = firstPass[field.key]
    const same = JSON.stringify(next) === JSON.stringify(previous)
    values[field.key] = next
    if (same) {
      confidence[field.key] = Math.max(verifiedConfidence[field.key] ?? 0, AGREEMENT_CONFIDENCE)
    } else {
      confidence[field.key] = verifiedConfidence[field.key] ?? CORRECTION_DEFAULT_CONFIDENCE
      changed.push(field.key)
    }
  }

  return { values, confidence, changed }
}
