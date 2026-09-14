import { amountsMatch, type CheckResult } from "@/lib/checks/types"
import { normalizeSupplierName } from "@/lib/suppliers/normalize"

export type DocumentIdentity = {
  documentId: string
  supplier: string | null
  invoiceNumber: string | null
  total: number | null
  currencyCode: string | null
  /** A2.3: whether the extracted document is itself a credit note (negative total, or a
   * template hint the caller can pass through) — a near-dupe of an invoice with the SAME
   * absolute total but this document being a credit note is the "cancelling" case, not a real
   * duplicate. */
  isCreditNote?: boolean
  fieldKeys?: { supplier?: string; invoiceNumber?: string; total?: string }
}

/** A2.3: fold an invoice-number for comparison. Providers write "INV-2026/0442" and
 * "INV 2026 0442" as the same reference; the human-reviewable identifier is the digits and
 * letters in order, case-folded. */
export function normalizeInvoiceNumber(value: string | null | undefined): string {
  if (!value) return ""
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "")
}

/** Damerau-optimised Levenshtein up to a hard early-exit — a full DP is wasteful when the
 * caller only cares about "≤ 1". Returns Infinity on any longer distance. */
function levenshteinAtMost(a: string, b: string, max: number): number {
  const diff = Math.abs(a.length - b.length)
  if (diff > max) return Infinity
  if (a === b) return 0
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let minRow = i
    const curr = [i]
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      if (curr[j] < minRow) minRow = curr[j]
    }
    if (minRow > max) return Infinity
    prev = curr
  }
  return prev[b.length]
}

/** Exact duplicates are caught earlier, at ingestion (WP9's IngestionItem idempotency key) — this
 * is the near-dupe case that key can never catch: the SAME invoice, re-scanned or re-photographed,
 * producing different bytes but the same supplier + invoice number + total. Warn, not fail (unlike
 * the exact-duplicate check) — a genuine credit note or a corrected re-issue can legitimately share
 * all three fields with an unrelated document.
 *
 * `others` is every other document's identity in scope for comparison (same workspace, same
 * template) — gathering that list is models/document-checks.ts's job; this stays pure over
 * whatever list it's handed, which is what makes it exhaustively table-testable. */
export function findNearDuplicate(candidate: DocumentIdentity, others: DocumentIdentity[]): CheckResult | null {
  if (!candidate.supplier?.trim() || !candidate.invoiceNumber?.trim() || candidate.total === null) return null

  const supplier = normalizeSupplierName(candidate.supplier)
  const invoiceNumber = normalizeInvoiceNumber(candidate.invoiceNumber)
  const total = candidate.total

  // Two-pass: exact-normalized invoice-number first (the strong signal), then Levenshtein≤1
  // over the same supplier+total (typos and OCR one-character misses in invoice numbers).
  let match: DocumentIdentity | null = null
  let fuzzy = false
  for (const other of others) {
    if (other.documentId === candidate.documentId) continue
    if (normalizeSupplierName(other.supplier) !== supplier) continue
    if (other.total === null) continue
    const sameAmount = amountsMatch(other.total, total, candidate.currencyCode)
    // A2.3: a credit note against the same original invoice is NOT a duplicate — signs
    // opposite or one document flagged as a credit note deliberately relaxes the amount test
    // to allow a negative counterpart to match to its parent WITHOUT calling the pair a dupe.
    const oppositeSign = other.total !== null && Math.sign(other.total) !== Math.sign(total) && Math.abs(other.total) === Math.abs(total)
    const creditPair = (candidate.isCreditNote || other.isCreditNote) && oppositeSign
    if (creditPair) continue
    if (!sameAmount) continue
    const otherInvoiceNumber = normalizeInvoiceNumber(other.invoiceNumber)
    if (otherInvoiceNumber === invoiceNumber) { match = other; fuzzy = false; break }
    // Fuzzy: only one-character difference (OCR misread) — never merge on a bigger jump.
    if (levenshteinAtMost(otherInvoiceNumber, invoiceNumber, 1) <= 1) { match = other; fuzzy = true }
  }

  const fields = [candidate.fieldKeys?.supplier ?? "supplier", candidate.fieldKeys?.invoiceNumber ?? "invoice_number", candidate.fieldKeys?.total ?? "total"]
  if (!match) return { checkCode: "duplicate", status: "pass", message: "No near-duplicate found.", fields }
  return {
    checkCode: "duplicate", status: "warn", fields, detail: { matchedDocumentId: match.documentId, fuzzy },
    message: fuzzy
      ? "Same supplier and total as another document; invoice number differs by one character (likely OCR error or duplicate submission)."
      : "Same supplier, invoice number, and total as another document already in this workspace.",
  }
}
