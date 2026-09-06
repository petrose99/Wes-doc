/** A5.1: the one supplier-name normalizer — every consumer that compares supplier names
 * (automation rules, document matching, bank matching, duplicate-contact health check, alias
 * lookup) goes through here, so "Acme Ltd.", "ACME LTD" and "Acme Limited " all resolve to the
 * same key everywhere, not five slightly different ad-hoc lowercase-and-trim variants. Pure, no
 * Prisma. */

/** Legal-form suffixes stripped from the END of a name only — "Ltd Software" the product name
 * must keep its "ltd", "Acme Software Ltd" must lose it. Longest-match-first, repeatedly, so
 * "Acme Holdings B.V." → "acme holdings" and "Acme GmbH & Co. KG" → "acme". */
const LEGAL_SUFFIXES = [
  "gmbh & co kg", "gmbh & co", "co kg",
  "ltd", "limited", "llc", "llp", "lp", "plc", "inc", "incorporated", "corp", "corporation",
  "gmbh", "ag", "kg", "ug", "ohg", "gbr", "ev",
  "bv", "nv", "vof", "cv",
  "sarl", "sa", "sas", "sasu", "eurl", "sci", "snc",
  "srl", "spa", "sl", "slu", "sau",
  "pty", "pty ltd", "cc", "bk",
  "oy", "ab", "as", "aps", "kft", "zrt", "sp z oo", "spolka z oo", "sro",
  "co", "company", "holdings", "group",
]

/** Suffixes matched TOKEN-WISE against the folded name's tail, compared with spaces removed so
 * dotted forms survive folding — "B.V." folds to "b v", which must still read as "bv", and
 * "GmbH & Co. KG" folds to "gmbh and co kg" ("&" → " and "), which must still read as the
 * "gmbh & co kg" entry. Keyed by joined form; value = max token count that key can span. */
const SUFFIX_KEYS = new Set(LEGAL_SUFFIXES.map((suffix) => suffix.replace(/[&\s.]+/g, "")))
SUFFIX_KEYS.add("gmbhandcokg")
SUFFIX_KEYS.add("gmbhandco")
const MAX_SUFFIX_TOKENS = 4

/** NFKC + lowercase + fold punctuation to spaces + collapse whitespace. The shared first step for
 * both key-building and tokenizing; keeps digits (account refs, "365" in "Office 365"). */
function fold(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[&+]/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** The canonical lookup key for one supplier name: folded, with trailing legal-form suffixes
 * stripped. Returns "" for a name that is nothing but suffixes/punctuation — callers must treat
 * "" as "no usable name", never as a real key. */
export function normalizeSupplierName(value: string | null | undefined): string {
  if (!value) return ""
  const tokens = fold(value).split(" ").filter(Boolean)
  // Strip trailing legal suffixes repeatedly ("acme holdings bv" → "acme holdings" → "acme"),
  // longest tail first, but always leave at least one token — a name that IS a suffix word
  // ("Ltd", pathological but real) must survive as itself.
  let stripped = true
  while (stripped && tokens.length > 1) {
    stripped = false
    for (let span = Math.min(MAX_SUFFIX_TOKENS, tokens.length - 1); span >= 1; span--) {
      const joined = tokens.slice(tokens.length - span).join("")
      if (SUFFIX_KEYS.has(joined)) {
        tokens.length -= span
        stripped = true
        break
      }
    }
  }
  return tokens.join(" ")
}

export function supplierTokens(value: string | null | undefined): string[] {
  const key = normalizeSupplierName(value)
  return key ? [...new Set(key.split(" "))].sort() : []
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const curr = [i]
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = curr
  }
  return prev[b.length]
}

function similarity(a: string, b: string): number {
  if (!a.length && !b.length) return 1
  const maxLen = Math.max(a.length, b.length)
  return maxLen === 0 ? 1 : 1 - levenshtein(a, b) / maxLen
}

/** fuzzywuzzy-style token_set_ratio in [0,1]: order-insensitive, and a name fully contained in a
 * longer one ("acme" vs "acme software services") scores high, since the shared-token prefix
 * dominates. 0 when either side normalizes to nothing. */
export function tokenSetRatio(a: string | null | undefined, b: string | null | undefined): number {
  const tokensA = supplierTokens(a)
  const tokensB = supplierTokens(b)
  if (!tokensA.length || !tokensB.length) return 0

  const setB = new Set(tokensB)
  const shared = tokensA.filter((t) => setB.has(t))
  const setShared = new Set(shared)
  const onlyA = tokensA.filter((t) => !setShared.has(t))
  const onlyB = tokensB.filter((t) => !setShared.has(t))

  const base = shared.join(" ")
  const withA = [...shared, ...onlyA].join(" ")
  const withB = [...shared, ...onlyB].join(" ")

  return Math.max(similarity(base, withA), similarity(base, withB), similarity(withA, withB))
}

/** Decision thresholds shared by every fuzzy consumer (roadmap A5.2): ≥ AUTO is the same
 * supplier, [REVIEW, AUTO) is "probably — show a person", below is different. */
export const SUPPLIER_MATCH_AUTO_THRESHOLD = 0.92
export const SUPPLIER_MATCH_REVIEW_THRESHOLD = 0.8

/** Normalizes an IBAN for equality comparison (the A5 dedup anchor): uppercase, no spaces.
 * Returns "" when the input doesn't even look like an IBAN (two letters + digits, ≥15 chars). */
export function normalizeIban(value: string | null | undefined): string {
  if (!value) return ""
  const compact = value.replace(/\s+/g, "").toUpperCase()
  return /^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(compact) ? compact : ""
}
