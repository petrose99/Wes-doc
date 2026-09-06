/** A2.6: text-layer vs OCR divergence. A born-digital PDF carries an embedded text layer; the
 * MinerU OCR pass reads the RENDERED page. A significant mismatch between the two on the
 * money-shaped tokens (amounts, IBANs, totals) is a classic "invisible glyph swap" trick — the
 * text layer says one thing to your accounting software and the rendered image shows a
 * reviewer something else. Warn: legitimate cases (a scanned PDF wrapped as digital, a form
 * field the layer never populated) also trip this, so it is a "look at it" signal. Pure. */
import type { CheckResult } from "@/lib/checks/types"

const MONEY_TOKEN = /(?:[$€£¥]|\bUSD\b|\bEUR\b|\bGBP\b|\bZAR\b|\bJPY\b)?\s*\d{1,3}(?:[,.\s]\d{3})*(?:[.,]\d{2})?/g

function extractMoneyTokens(text: string): string[] {
  if (!text) return []
  const matches = text.match(MONEY_TOKEN) ?? []
  return matches
    .map((raw) => raw.replace(/[\s]/g, "").replace(/[,]/g, ""))
    .filter((token) => /\d{2,}/.test(token))
}

export function checkTextLayerDivergence(input: { textLayer: string | null; ocrText: string | null }): CheckResult | null {
  if (!input.textLayer?.trim() || !input.ocrText?.trim()) return null
  const layerTokens = new Set(extractMoneyTokens(input.textLayer))
  const ocrTokens = new Set(extractMoneyTokens(input.ocrText))
  if (layerTokens.size < 2 || ocrTokens.size < 2) return null

  const missingFromOcr: string[] = []
  for (const token of layerTokens) if (!ocrTokens.has(token)) missingFromOcr.push(token)
  const missingFromLayer: string[] = []
  for (const token of ocrTokens) if (!layerTokens.has(token)) missingFromLayer.push(token)

  const overlap = [...layerTokens].filter((token) => ocrTokens.has(token)).length
  const jaccard = overlap / (layerTokens.size + ocrTokens.size - overlap)
  if (jaccard >= 0.7) return null

  return {
    checkCode: "text_layer_mismatch",
    status: "warn",
    message: `PDF text layer and OCR pass disagree on money-shaped tokens (jaccard ${jaccard.toFixed(2)}; ${missingFromOcr.length} in text layer only, ${missingFromLayer.length} in OCR only).`,
    detail: {
      jaccard,
      inTextLayerOnly: missingFromOcr.slice(0, 12),
      inOcrOnly: missingFromLayer.slice(0, 12),
    },
  }
}
