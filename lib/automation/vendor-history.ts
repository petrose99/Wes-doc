/** Vendor coding history prior — Phase 3.
 *
 * Ramp-style auto-coding leans on the strongest available signal for a supplier: what a real
 * person already coded them to. Existing DocuBite automation only had exemplar rules + past
 * corrections; a workspace with hundreds of confirmed manually-coded documents from "Acme Ltd"
 * carried no weight beyond one exemplar row.
 *
 * This module reads the raw signal from Document.codingData (rows where a person confirmed the
 * coding — codingSource "manual", or "rule"/"ai" then approved via a resolved ReviewTask) and
 * returns, per coding key (e.g. `account`, `taxCode`), the modal value plus how much agreement
 * there was. `applyAutomationRules` uses the confident bucket directly (bypass the LLM); the LLM
 * still sees the whole prior when it does run.
 *
 * Kept pure: takes an already-fetched slice, no Prisma. Loader lives in models/vendor-history.ts. */

export type CodedDocumentSlice = {
  documentId: string
  supplier: string
  templateCode: string
  codingData: Record<string, string>
  /** "manual" | "rule" | "ai". A "manual" or reviewer-approved "rule" carries weight; a bare
   * "ai" prediction with no human confirmation is filtered upstream. */
  codingSource: "manual" | "rule" | "ai"
}

export type VendorCodingPrior = {
  /** For every coding key present in the history, what the vendor "usually" gets. */
  byKey: Record<string, {
    /** The most-common value the vendor has been coded to. */
    modalValue: string
    /** Rows the vendor has, total. */
    support: number
    /** Fraction of those rows that agree with modalValue (1.0 = every row identical). */
    agreement: number
  }>
  /** Overall support — number of confirmed rows for this vendor+template. */
  support: number
}

const AGREEMENT_APPLY_THRESHOLD = 0.9
const SUPPORT_APPLY_THRESHOLD = 3

/** Compute the prior for one vendor. `templateCode` scopes to the same document template so a
 * receipt's history doesn't spill into an invoice's coding. */
export function getVendorCodingPrior(
  history: CodedDocumentSlice[],
  supplier: string,
  templateCode: string,
): VendorCodingPrior {
  const normSupplier = normalize(supplier)
  const rows = history.filter(
    (h) => h.templateCode === templateCode && normalize(h.supplier) === normSupplier,
  )
  const support = rows.length
  const byKey: VendorCodingPrior["byKey"] = {}
  if (!rows.length) return { byKey, support }

  const keys = new Set<string>()
  for (const row of rows) {
    for (const key of Object.keys(row.codingData)) keys.add(key)
  }

  for (const key of keys) {
    const values = rows.map((r) => r.codingData[key]).filter((v): v is string => Boolean(v && v.trim()))
    if (!values.length) continue
    const counts = new Map<string, number>()
    for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
    let modalValue = ""
    let modalCount = 0
    for (const [v, c] of counts) {
      if (c > modalCount) {
        modalValue = v
        modalCount = c
      }
    }
    byKey[key] = {
      modalValue,
      support: values.length,
      agreement: modalCount / values.length,
    }
  }

  return { byKey, support }
}

/** Which subset of the prior (if any) is confident enough to apply without the LLM. Ramp's own
 * public numbers cite a "known vendor" pattern getting touchless treatment — 90% agreement over
 * ≥ 3 rows is the threshold that turns "usually" into "always". */
export function confidentAssignments(
  prior: VendorCodingPrior,
  codingKeys: string[],
): Record<string, string> {
  const result: Record<string, string> = {}
  for (const key of codingKeys) {
    const stat = prior.byKey[key]
    if (!stat) continue
    if (stat.support < SUPPORT_APPLY_THRESHOLD) continue
    if (stat.agreement < AGREEMENT_APPLY_THRESHOLD) continue
    result[key] = stat.modalValue
  }
  return result
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ")
}

export const HISTORY_APPLY_THRESHOLDS = {
  minAgreement: AGREEMENT_APPLY_THRESHOLD,
  minSupport: SUPPORT_APPLY_THRESHOLD,
}
