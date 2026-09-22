/** One map for every claim status word — never hand-write "Draft"/"Submitted"/etc. elsewhere
 * (lesson #258). Read by the Receipts Claim pill/facet, the Approval-tab card and (Stage aside)
 * nowhere on S4, which reads `stageLabel` like Invoices instead. */
export const CLAIM_STATUS_LABELS = {
  draft: "Draft",
  submitted: "Submitted",
  approved: "Approved",
  rejected: "Rejected",
} as const

export type ClaimStatusLabelKey = keyof typeof CLAIM_STATUS_LABELS

/** A claim's display name: its title when the claimant gave one, else "Claim of ‹created date›". */
export function claimName(claim: { title?: string | null; createdAt: Date | string }): string {
  if (claim.title && claim.title.trim()) return claim.title.trim()
  const date = claim.createdAt instanceof Date ? claim.createdAt : new Date(claim.createdAt)
  return `Claim of ${date.toLocaleDateString("en-US", { month: "long", day: "numeric" })}`
}

/** Sentence per ineligibility reason — the Held-back table column and the unclaimed-tab sentence
 * both read this, so the row and the dialog never diverge in wording. */
export const ELIGIBILITY_REASON_TEXT: Record<string, string> = {
  supplier_receipt: "Supplier receipt — not an expense",
  needs_attention: "Needs attention",
  in_claim: "Already in a claim",
  currency_mismatch: "Different currency from the claim",
}
