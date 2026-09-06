/** 2/3-way document matching engine — pure, no Prisma.
 *
 * Matches purchase orders → invoices → receipts by vendor name, amount (within tolerance),
 * date proximity, and PO number. Returns a confidence score and any discrepancies found. */
import { normalizeSupplierName, SUPPLIER_MATCH_AUTO_THRESHOLD, SUPPLIER_MATCH_REVIEW_THRESHOLD, tokenSetRatio } from "@/lib/suppliers/normalize"

export type MatchableDocument = {
  id: string
  templateCode: string
  vendor: string | null
  amount: number | null
  date: string | null
  poNumber: string | null
}

export type MatchDiscrepancy = {
  field: string
  expected: string
  actual: string
}

export type MatchResult = {
  sourceId: string
  targetId: string
  confidence: number
  matchType: "po_to_invoice" | "invoice_to_receipt" | "po_to_receipt"
  discrepancies: MatchDiscrepancy[]
}

export type MatchConfig = {
  amountTolerancePercent: number
  dateDaysWindow: number
}

const DEFAULT_CONFIG: MatchConfig = {
  amountTolerancePercent: 2,
  dateDaysWindow: 30,
}

const TEMPLATE_ROLES: Record<string, "po" | "invoice" | "receipt" | null> = {
  purchase_order: "po",
  expense: "invoice",
  sale: "invoice",
  receipt: "receipt",
}

function getRole(templateCode: string): "po" | "invoice" | "receipt" | null {
  return TEMPLATE_ROLES[templateCode] ?? null
}

function getMatchType(sourceRole: string, targetRole: string): MatchResult["matchType"] | null {
  if (sourceRole === "po" && targetRole === "invoice") return "po_to_invoice"
  if (sourceRole === "invoice" && targetRole === "receipt") return "invoice_to_receipt"
  if (sourceRole === "po" && targetRole === "receipt") return "po_to_receipt"
  return null
}

export function scoreVendorMatch(a: string | null, b: string | null): number {
  if (!a || !b) return 0
  // A5: compare through the shared supplier normalizer, so "Acme Ltd." vs "ACME Limited" is an
  // exact match, not a lucky substring. Fuzzy grades follow the shared thresholds: auto-band
  // similarity is near-certain (0.9), containment keeps its historical 0.8, review-band
  // similarity is a weak-but-real signal (0.6).
  const na = normalizeSupplierName(a)
  const nb = normalizeSupplierName(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  const ratio = tokenSetRatio(na, nb)
  if (ratio >= SUPPLIER_MATCH_AUTO_THRESHOLD) return 0.9
  if (na.includes(nb) || nb.includes(na)) return 0.8
  if (ratio >= SUPPLIER_MATCH_REVIEW_THRESHOLD) return 0.6
  return 0
}

export function scoreAmountMatch(a: number | null, b: number | null, tolerancePercent: number): { score: number; discrepancy: MatchDiscrepancy | null } {
  if (a === null || b === null) return { score: 0, discrepancy: null }
  if (a === 0 && b === 0) return { score: 1, discrepancy: null }
  const diff = Math.abs(a - b)
  const base = Math.max(Math.abs(a), Math.abs(b))
  const pct = base > 0 ? (diff / base) * 100 : 0
  if (pct <= tolerancePercent) return { score: 1, discrepancy: null }
  if (pct <= tolerancePercent * 3) return { score: 0.5, discrepancy: { field: "amount", expected: String(a), actual: String(b) } }
  return { score: 0, discrepancy: { field: "amount", expected: String(a), actual: String(b) } }
}

export function scoreDateMatch(a: string | null, b: string | null, daysWindow: number): number {
  if (!a || !b) return 0
  const da = new Date(a)
  const db = new Date(b)
  if (isNaN(da.getTime()) || isNaN(db.getTime())) return 0
  const diffDays = Math.abs(da.getTime() - db.getTime()) / (1000 * 60 * 60 * 24)
  if (diffDays <= daysWindow) return 1
  if (diffDays <= daysWindow * 2) return 0.5
  return 0
}

export function scorePoNumberMatch(a: string | null, b: string | null): number {
  if (!a || !b) return 0
  return a.trim().toLowerCase() === b.trim().toLowerCase() ? 1 : 0
}

export function findMatches(
  source: MatchableDocument,
  candidates: MatchableDocument[],
  config: MatchConfig = DEFAULT_CONFIG,
): MatchResult[] {
  const sourceRole = getRole(source.templateCode)
  if (!sourceRole) return []

  const results: MatchResult[] = []

  for (const candidate of candidates) {
    if (candidate.id === source.id) continue
    const targetRole = getRole(candidate.templateCode)
    if (!targetRole) continue

    const matchType = getMatchType(sourceRole, targetRole)
    if (!matchType) continue

    const vendorScore = scoreVendorMatch(source.vendor, candidate.vendor)
    if (vendorScore === 0) continue

    const { score: amountScore, discrepancy: amountDiscrepancy } = scoreAmountMatch(source.amount, candidate.amount, config.amountTolerancePercent)
    const dateScore = scoreDateMatch(source.date, candidate.date, config.dateDaysWindow)
    const poScore = scorePoNumberMatch(source.poNumber, candidate.poNumber)

    const hasPoMatch = poScore > 0
    const weights = hasPoMatch
      ? { vendor: 0.2, amount: 0.3, date: 0.1, po: 0.4 }
      : { vendor: 0.35, amount: 0.45, date: 0.2, po: 0 }

    const confidence = vendorScore * weights.vendor
      + amountScore * weights.amount
      + dateScore * weights.date
      + poScore * weights.po

    if (confidence < 0.3) continue

    const discrepancies: MatchDiscrepancy[] = []
    if (amountDiscrepancy) discrepancies.push(amountDiscrepancy)
    if (vendorScore < 1 && source.vendor && candidate.vendor) {
      discrepancies.push({ field: "vendor", expected: source.vendor, actual: candidate.vendor })
    }

    results.push({ sourceId: source.id, targetId: candidate.id, confidence, matchType, discrepancies })
  }

  return results.sort((a, b) => b.confidence - a.confidence)
}
