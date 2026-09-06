/** A3.2: bank descriptor → counterparty normalizer. Real statement lines are noisy:
 * "PAYPAL *ACMELTD 4029357733 CA", "TFR TO ACME LTD REF 998 20260805", "SQ *ACME LTD".
 * This strips processor prefixes ("PAYPAL *", "SQ *", "TST*"), transaction IDs (numeric runs),
 * dates, and location suffixes, so the residue token-overlaps cleanly with a real supplier
 * name. Pure, no Prisma. */
import { supplierTokens } from "@/lib/suppliers/normalize"

const PROCESSOR_PREFIXES = [
  /^paypal\s*\*/i, /^sq\s*\*/i, /^tst\s*\*/i, /^stripe\s+/i, /^square\s+/i, /^pos\s+/i,
  /^tfr\s+(?:to|from)\s+/i, /^transfer\s+(?:to|from)\s+/i,
  /^payment\s+(?:to|from)\s+/i, /^purchase\s+(?:at|from)\s+/i,
  /^direct\s+debit\s+/i, /^dd\s+/i, /^bacs\s+/i, /^ach\s+/i, /^chq\s+/i, /^check\s+/i,
  /^card\s+purchase\s+/i, /^visa\s+purchase\s+/i, /^mastercard\s+/i,
]
const NOISE_TOKENS = new Set([
  "ref", "reference", "invoice", "inv", "payment", "for", "the", "your", "via",
  "pos", "atm", "web", "online",
])
const LOCATION_HINTS = new Set([
  "usa", "us", "uk", "gb", "de", "fr", "ca", "ny", "ca", "il", "tx", "london", "berlin",
])

/** The de-noised counterparty phrase for one raw descriptor. Returns "" when nothing is left. */
export function normalizeBankDescriptor(descriptor: string | null | undefined): string {
  if (!descriptor) return ""
  let text = descriptor
  for (const pattern of PROCESSOR_PREFIXES) text = text.replace(pattern, "")
  // Strip long numeric runs (transaction IDs, dates, phone numbers) — three digits or more.
  text = text.replace(/\b\d{3,}\b/g, " ")
  // ISO-like dates.
  text = text.replace(/\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b/g, " ")
  text = text.replace(/\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b/g, " ")
  const tokens = text
    .split(/[^A-Za-z0-9]+/)
    .map((token) => token.toLowerCase())
    .filter((token) => token.length >= 3 && !NOISE_TOKENS.has(token) && !LOCATION_HINTS.has(token))
  return tokens.join(" ").trim()
}

/** Compare a descriptor's residue against a supplier's normalized tokens.  A high ratio means
 * the supplier name is fully present in the (cleaned) descriptor. Symmetric fallback returns
 * 0 when either side is empty. */
export function descriptorSupplierOverlap(descriptor: string | null | undefined, supplierName: string | null | undefined): number {
  const cleaned = normalizeBankDescriptor(descriptor)
  if (!cleaned) return 0
  const supplier = supplierTokens(supplierName)
  if (!supplier.length) return 0
  const descTokens = new Set(cleaned.split(" ").filter(Boolean))
  let hits = 0
  for (const token of supplier) if (descTokens.has(token)) hits++
  return hits / supplier.length
}
