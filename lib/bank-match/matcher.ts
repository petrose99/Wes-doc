import { amountsMatch, amountTolerance } from "@/lib/checks/types"
import { descriptorSupplierOverlap } from "@/lib/bank-match/counterparty"
import { supplierTokens as supplierNameTokens } from "@/lib/suppliers/normalize"

export type BankTransaction = {
  index: number
  date: Date | null
  description: string | null
  /** Absolute value of whichever side (debit or credit) the statement row carries — the sign is
   * meaningless for matching purposes, only the magnitude is compared against a document's total. */
  amount: number | null
}

export type MatchCandidateDocument = {
  documentId: string
  supplier: string | null
  total: number | null
  date: Date | null
  currencyCode: string | null
  /** Only populated for templates that carry one (invoices/receipts) — used by
   * lib/reconciliation/supplier-statement.ts's stricter primary match, not by this matcher. */
  invoiceNumber?: string | null
}

export type MatchSuggestion = {
  transactionIndex: number
  documentId: string
  confidence: number
  dateDeltaDays: number | null
  /** A3.3: tier signal for the UI/downstream automation. "green" = auto-confirm eligible
   * (near-perfect on every signal); "blue" = suggest only (needs a person to confirm). */
  tier: "green" | "blue"
  /** A3.6: when the transaction amount differed from the document total by less than the FX/fee
   * tolerance, this carries the raw delta so the caller can create a FX/fee adjustment line. */
  amountDelta: number
}

const DATE_WINDOW_DAYS = 14
const CONFIDENCE_THRESHOLD = 0.6
const AMOUNT_WEIGHT = 0.6
const DATE_WEIGHT = 0.25
const SUPPLIER_WEIGHT = 0.15
/** A3.3: green-tier (auto-confirm) requires this floor across every signal — near-perfect
 * amount, small date delta, strong descriptor/supplier overlap. */
const GREEN_TIER_MIN_CONFIDENCE = 0.95
/** A3.6: fraction of the amount treated as fee/FX slack (default 1% or one currency-tolerance
 * unit, whichever is bigger). Under this delta the pair still matches; the caller uses
 * amountDelta to book an adjustment line rather than pretend the totals were identical. */
const FX_FEE_TOLERANCE_PCT = 0.01

function daysBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / (24 * 60 * 60 * 1000)
}

function tokenize(value: string | null): Set<string> {
  if (!value) return new Set()
  return new Set(value.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length >= 3))
}

/** How much of the description's wording overlaps the candidate's supplier name — a description
 * often embeds the supplier ("PAYMENT TO ACME LTD"), so token overlap is a workable cheap proxy
 * without any external entity-resolution step. Ratio is over the supplier's own token count: a
 * short supplier name fully present in a long description should score as a full match. */
function supplierOverlapRatio(supplier: string | null, description: string | null): number {
  // A5: the supplier side tokenizes through the shared normalizer, so legal-form suffixes
  // ("Ltd", "GmbH") never count as evidence — "PAYMENT TO WIDGET LTD" matching supplier
  // "Gadget Ltd" must not score on "ltd" alone. The description keeps the plain tokenizer:
  // it is free text, not a company name.
  const supplierTokens = new Set(supplierNameTokens(supplier).filter((token) => token.length >= 3))
  if (!supplierTokens.size) return 0
  const descriptionTokens = tokenize(description)
  let hits = 0
  for (const token of supplierTokens) if (descriptionTokens.has(token)) hits++
  return hits / supplierTokens.size
}

function scoreMatch(txn: BankTransaction, candidate: MatchCandidateDocument, statementCurrency: string | null): { confidence: number; dateDeltaDays: number | null; amountDelta: number; tier: "green" | "blue" } | null {
  if (txn.amount === null || candidate.total === null) return null
  if (statementCurrency && candidate.currencyCode && statementCurrency.toUpperCase() !== candidate.currencyCode.toUpperCase()) return null

  const currency = statementCurrency ?? candidate.currencyCode
  const rawDelta = txn.amount - candidate.total
  const absDelta = Math.abs(rawDelta)
  const exactAmount = amountsMatch(txn.amount, candidate.total, currency)
  // A3.6: FX/fee tolerance — the pair still matches when the difference is within 1% (or the
  // currency's own minor-unit tolerance, whichever wins). The caller reads amountDelta to
  // decide whether to book a fee/FX adjustment line.
  const fxTolerance = Math.max(amountTolerance(currency), Math.abs(candidate.total) * FX_FEE_TOLERANCE_PCT)
  if (!exactAmount && absDelta > fxTolerance) return null

  // Amount signal degrades linearly across the FX slack (a penny is 1, a big FX slice is <1)
  // so the tier gating stays honest.
  const amountSignal = exactAmount ? 1 : Math.max(0, 1 - (absDelta / (fxTolerance || 1)))
  let confidence = AMOUNT_WEIGHT * amountSignal
  let dateDeltaDays: number | null = null
  let dateSignal = 0
  if (txn.date && candidate.date) {
    dateDeltaDays = daysBetween(txn.date, candidate.date)
    if (dateDeltaDays <= DATE_WINDOW_DAYS) dateSignal = 1 - dateDeltaDays / DATE_WINDOW_DAYS
    confidence += DATE_WEIGHT * dateSignal
  }
  // A3.2: descriptor-side normalization strips processor prefixes/txn IDs before token match.
  const supplierOverlap = descriptorSupplierOverlap(txn.description, candidate.supplier)
  const supplierSignal = Math.max(supplierOverlap, supplierOverlapRatio(candidate.supplier, txn.description))
  confidence += SUPPLIER_WEIGHT * supplierSignal

  // A3.3: green tier only when EVERY signal is near-perfect — otherwise a suggestion.
  const green = exactAmount && dateSignal >= 0.7 && supplierSignal >= 0.7 && confidence >= GREEN_TIER_MIN_CONFIDENCE
  return { confidence, dateDeltaDays, amountDelta: rawDelta, tier: green ? "green" : "blue" }
}

/** Suggests, for each bank/statement transaction, at most one candidate document it likely
 * corresponds to — greedy highest-confidence-first assignment so no document is suggested for two
 * transactions and no transaction gets two suggestions, even when several transactions could
 * plausibly match the same document (a repeat payment amount, say). Pure: the caller
 * (models/bank-matches.ts) gathers the transactions and in-period candidate documents; this only
 * scores and assigns. */
export function suggestMatches(transactions: BankTransaction[], candidates: MatchCandidateDocument[], opts?: { statementCurrency?: string | null }): MatchSuggestion[] {
  const statementCurrency = opts?.statementCurrency ?? null
  const scored: MatchSuggestion[] = []

  for (const txn of transactions) {
    for (const candidate of candidates) {
      const result = scoreMatch(txn, candidate, statementCurrency)
      if (result && result.confidence >= CONFIDENCE_THRESHOLD) {
        scored.push({ transactionIndex: txn.index, documentId: candidate.documentId, confidence: result.confidence, dateDeltaDays: result.dateDeltaDays, tier: result.tier, amountDelta: result.amountDelta })
      }
    }
  }

  scored.sort((a, b) => b.confidence - a.confidence)

  const usedTransactions = new Set<number>()
  const usedDocuments = new Set<string>()
  const suggestions: MatchSuggestion[] = []
  for (const candidate of scored) {
    if (usedTransactions.has(candidate.transactionIndex) || usedDocuments.has(candidate.documentId)) continue
    usedTransactions.add(candidate.transactionIndex)
    usedDocuments.add(candidate.documentId)
    suggestions.push(candidate)
  }
  return suggestions
}
