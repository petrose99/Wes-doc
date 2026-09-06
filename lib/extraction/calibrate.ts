import { amountsMatch } from "@/lib/checks/types"
import { DOC_TYPE_SPECS, isDocType, legacyTemplateCodeToDocType } from "@/lib/doc-types"
import type { AmountKeyMap } from "@/lib/doc-types"
import { groupTransactionsByAccount } from "@/lib/extraction/balance-solver"

/** Post-extraction confidence calibration — pure, no Prisma.
 *
 * The LLM's self-reported per-field confidence is a guess about its own reading. This layer
 * replaces guesswork with evidence wherever evidence exists:
 *
 * - ARITHMETIC: when a document's own math reconciles (subtotal + tax + shipping = total, line
 *   items sum to the subtotal, opening balance + net movement = closing balance), every field in
 *   the identity is corroborated by every other one — a misread digit would have broken the
 *   equation. Those fields deserve 0.99, whatever the model guessed.
 * - VERBATIM: a value that appears character-for-character in the OCR text was read, not
 *   hallucinated. Floor it at 0.95.
 * - UNGROUNDED: a number that appears NOWHERE in the OCR text (in any common formatting) is
 *   suspect regardless of how sure the model felt — cap it at 0.7 so it lands in review.
 *
 * Calibration only ever uses the document against itself, so a 0.99 here is honest: it means
 * "the document corroborates this value", not "the model felt good about it". */

export const ARITHMETIC_CONFIDENCE = 0.99
export const VERBATIM_CONFIDENCE = 0.95
export const UNGROUNDED_CAP = 0.7

type FieldLite = { key: string; type: string }

export type CalibrationInput = {
  templateCode: string | null
  docType?: string | null
  fields: FieldLite[]
  extraction: Record<string, unknown>
  fieldConfidence: Record<string, number>
  ocrText: string | null
}

export type CalibrationResult = {
  fieldConfidence: Record<string, number>
  /** Field keys whose confidence was raised by an arithmetic identity — surfaced in the stored
   * confidence payload so the UI can explain WHY a field reads 99%. */
  corroborated: string[]
  /** Field keys with concrete evidence of a possible misread: a number found nowhere in the OCR
   * text, or a participant in an arithmetic identity that failed to reconcile. These are the
   * fields worth spending a verification LLM pass on (lib/extraction/verify.ts). */
  suspect: string[]
}

function resolveAmountKeys(input: CalibrationInput): AmountKeyMap | undefined {
  if (input.docType && isDocType(input.docType)) return DOC_TYPE_SPECS[input.docType].amountKeys
  if (input.templateCode) return DOC_TYPE_SPECS[legacyTemplateCodeToDocType(input.templateCode)].amountKeys
  return undefined
}

export function calibrateFieldConfidence(input: CalibrationInput): CalibrationResult {
  const confidence: Record<string, number> = { ...input.fieldConfidence }
  const corroborated = new Set<string>()
  const suspect = new Set<string>()

  const boost = (key: string, floor: number) => {
    if (input.extraction[key] === undefined || input.extraction[key] === null) return
    confidence[key] = Math.max(confidence[key] ?? 0, floor)
  }

  applyArithmetic(input, confidence, corroborated, suspect, boost)
  applyTextGrounding(input, confidence, corroborated, suspect, boost)

  // A corroborated field is not suspect however it got flagged — evidence for beats evidence of doubt.
  for (const key of corroborated) suspect.delete(key)

  return { fieldConfidence: confidence, corroborated: [...corroborated].sort(), suspect: [...suspect].sort() }
}

function applyArithmetic(
  input: CalibrationInput,
  confidence: Record<string, number>,
  corroborated: Set<string>,
  suspect: Set<string>,
  boost: (key: string, floor: number) => void,
) {
  const map = resolveAmountKeys(input)
  if (!map) return
  const num = (key: string | undefined) => (key ? asNumber(input.extraction[key]) : null)
  const currency = map.currency ? asString(input.extraction[map.currency]) : null

  const corroborate = (...keys: (string | undefined)[]) => {
    for (const key of keys) {
      if (!key || input.extraction[key] === undefined || input.extraction[key] === null) continue
      boost(key, ARITHMETIC_CONFIDENCE)
      corroborated.add(key)
    }
  }

  const flagSuspect = (...keys: (string | undefined)[]) => {
    for (const key of keys) {
      if (!key || input.extraction[key] === undefined || input.extraction[key] === null) continue
      suspect.add(key)
    }
  }

  // Invoice-style header identity: subtotal + tax (+ shipping) = total.
  // Two-form: pass if base matches OR base+Σother matches (guards double counting).
  const subtotal = num(map.subtotal)
  const taxTotal = num(map.taxTotal)
  const shipping = num(map.shippingTotal)
  const total = num(map.total)
  const otherRows = map.otherCharges ? asRows(input.extraction[map.otherCharges]) : []
  const otherAmounts = otherRows.map((row) => asNumber(row.amount))
  const allOtherPresent = otherAmounts.length > 0 && otherAmounts.every((a): a is number => a !== null)
  const otherSum = allOtherPresent ? (otherAmounts as number[]).reduce((s, a) => s + a, 0) : 0

  if (subtotal !== null && taxTotal !== null && total !== null) {
    const baseExpected = subtotal + taxTotal + (shipping ?? 0)
    const baseMatch = amountsMatch(baseExpected, total, currency)
    const inclusiveMatch = allOtherPresent && otherSum !== 0 && amountsMatch(baseExpected + otherSum, total, currency)

    if (baseMatch || inclusiveMatch) {
      corroborate(map.subtotal, map.taxTotal, shipping !== null ? map.shippingTotal : undefined, map.total)
      if (inclusiveMatch && !baseMatch && allOtherPresent && otherSum !== 0) {
        corroborate(map.otherCharges)
      }
    } else {
      flagSuspect(map.subtotal, map.taxTotal, map.shippingTotal, map.total)
    }
  }

  // Line items summing to the subtotal (or the total when the template has no subtotal, plus the
  // receipt-style "items + tax = total" variant) corroborate the rows AND the target figure.
  if (map.lineItems) {
    const rows = asRows(input.extraction[map.lineItems])
    const amounts = rows.map((row) => asNumber(row.amount))
    if (rows.length > 0 && amounts.every((amount): amount is number => amount !== null)) {
      const sum = amounts.reduce((acc, amount) => acc + amount, 0)
      if (subtotal !== null && amountsMatch(sum, subtotal, currency)) corroborate(map.lineItems, map.subtotal)
      else if (subtotal === null && total !== null) {
        if (amountsMatch(sum, total, currency)) corroborate(map.lineItems, map.total)
        else if (taxTotal !== null && amountsMatch(sum + taxTotal, total, currency)) corroborate(map.lineItems, map.taxTotal, map.total)
      }
    }
  }

  // Bank statement identity: opening + Σ(credit − debit) = closing corroborates all three.
  // Multi-account: when ≥2 accounts exist, the top-level opening/closing is a cross-account
  // pair (first account's opening, last account's closing) — skip the top-level identity and
  // corroborate only when every per-account chain reconciles.
  const opening = num(map.openingBalance)
  const closing = num(map.closingBalance)
  const accountRows = map.accounts ? asRows(input.extraction[map.accounts]) : []
  if (accountRows.length >= 2 && map.transactions) {
    const txnRows = asRows(input.extraction[map.transactions])
    if (txnRows.length > 0) {
      const groups = groupTransactionsByAccount(txnRows, accountRows, opening, closing)
      let allReconciled = true
      let anyChecked = false
      for (const group of groups) {
        if (group.openingBalance === null || group.closingBalance === null || !group.rows.length) continue
        anyChecked = true
        const net = group.rows.reduce((s, r) => s + (r.credit ?? 0) - (r.debit ?? 0), 0)
        if (!amountsMatch(group.openingBalance + net, group.closingBalance, currency)) { allReconciled = false; break }
      }
      if (anyChecked) {
        if (allReconciled) {
          corroborate(map.transactions, map.accounts)
        } else {
          flagSuspect(map.transactions, map.accounts)
        }
      }
    }
  } else if (opening !== null && closing !== null && map.transactions) {
    const rows = asRows(input.extraction[map.transactions])
    if (rows.length > 0) {
      const net = rows.reduce((sum, row) => sum + (asNumber(row.credit) ?? 0) - (asNumber(row.debit) ?? 0), 0)
      if (amountsMatch(opening + net, closing, currency)) {
        corroborate(map.openingBalance, map.closingBalance, map.transactions)
      } else {
        flagSuspect(map.openingBalance, map.closingBalance, map.transactions)
      }
    }
  }
}

/** Boosts scalar values found verbatim in the OCR text and caps numbers found nowhere in it.
 * Dates are skipped in both directions (the printed format rarely matches the normalized one),
 * and strings are only ever boosted — a paraphrased-but-correct supplier name is not evidence
 * of a misread. */
function applyTextGrounding(
  input: CalibrationInput,
  confidence: Record<string, number>,
  corroborated: Set<string>,
  suspect: Set<string>,
  boost: (key: string, floor: number) => void,
) {
  if (!input.ocrText) return
  const haystack = input.ocrText.toLowerCase()

  for (const field of input.fields) {
    const value = input.extraction[field.key]
    if (value === undefined || value === null) continue

    if (field.type === "number" && typeof value === "number") {
      // Only a variant with enough digits to be an unlikely coincidence counts as a search term —
      // "0" or "0.00" (value 0's own variants) are 1-2 significant digits, and a bare "0"
      // matches almost any OCR text with a date, a pump number, or a phone digit in it. Confirmed
      // live: a receipt whose total the model correctly doubted (confidence 0.4) was pushed to
      // 0.95 because "0" happened to appear elsewhere in the text — the calibration overrode a
      // correct doubt with a false one. A value with no sufficiently specific variant is simply
      // unverifiable by this method: skip it in both directions and let the model's own
      // confidence stand, rather than treating "can't check" as either evidence for or against.
      const specificVariants = numberVariants(value).filter(isSpecificEnoughToSearchFor)
      if (!specificVariants.length) continue
      const found = specificVariants.some((variant) => haystack.includes(variant))
      if (found) boost(field.key, VERBATIM_CONFIDENCE)
      // A value the identities already vouch for is never dampened — arithmetic proof beats a
      // garbled printed form (the whole point of cross-checking).
      else if (!corroborated.has(field.key)) {
        confidence[field.key] = Math.min(confidence[field.key] ?? 1, UNGROUNDED_CAP)
        suspect.add(field.key)
      }
    } else if (field.type === "string" && typeof value === "string" && value.trim().length >= 3) {
      if (haystack.includes(value.trim().toLowerCase())) boost(field.key, VERBATIM_CONFIDENCE)
    }
  }
}

/** Below this many digits, a plain substring search stops being meaningful evidence: a haystack
 * of any real length (a date, a pump number, a phone digit, a zip code) will contain "0" or "10"
 * by pure coincidence far more often than it will genuinely echo a printed amount. 3 digits is
 * the natural floor for a monetary value — X.XX already clears it — while still excluding the
 * single- and double-digit values where false positives live. */
const MIN_GROUNDING_DIGITS = 3

/** Whether a formatted variant has enough digits to be searched for at all — see
 * MIN_GROUNDING_DIGITS. Punctuation (thousand separators, the decimal point, sign markers) does
 * not count toward specificity; only the digits do.
 *
 * Also requires at least one non-zero digit: "0.00" clears a bare digit-count bar at exactly 3
 * ("000"), but three identical zeros carry none of the specificity three arbitrary digits like
 * "978" would — $0.00 is a common filler value on real documents (free shipping, a waived fee, a
 * tax-exempt line) that appears elsewhere on a receipt without saying anything about whether THIS
 * field is genuinely zero. Without this, a wrong total of 0 stayed falsely grounded whenever any
 * other "0.00" happened to appear on the same document. */
function isSpecificEnoughToSearchFor(variant: string): boolean {
  const digits = variant.match(/\d/g) ?? []
  return digits.length >= MIN_GROUNDING_DIGITS && digits.some((digit) => digit !== "0")
}

/** The formats a printed amount plausibly takes: 6610.95 → "6610.95", "6,610.95"; 400 → "400",
 * "400.00"; negatives also as parenthesised. Lowercased to match the lowercased haystack. */
export function numberVariants(value: number): string[] {
  const abs = Math.abs(value)
  const bases = new Set<string>([String(abs), abs.toFixed(2)])
  if (Number.isInteger(abs)) bases.add(String(abs))
  const variants = new Set<string>()
  for (const base of bases) {
    variants.add(base)
    variants.add(withThousandSeparators(base))
  }
  if (value < 0) {
    for (const variant of [...variants]) {
      variants.add(`-${variant}`)
      variants.add(`(${variant})`)
    }
  }
  return [...variants]
}

function withThousandSeparators(base: string): string {
  const [whole, decimals] = base.split(".")
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  return decimals !== undefined ? `${grouped}.${decimals}` : grouped
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}
function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null
}
function asRows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object") : []
}
