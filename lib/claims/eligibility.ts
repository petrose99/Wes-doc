/** What counts as claimable, in one place — the server (`validateClaimableDocuments`) and the row
 * (`ReceiptRow.claimEligibility`) both call this so a reason never drifts between the two (lesson
 * #257 B1: every server precondition mirrored on the row, same sentence both sides). */

export type ClaimEligibilityReason = "supplier_receipt" | "needs_attention" | "in_claim" | "currency_mismatch"

export type ClaimEligibility = { status: "ready" } | { status: "not_eligible"; reason: ClaimEligibilityReason }

export type ClaimEligibilityFacts = {
  templateCode: string | null
  processingState: string | null
  /** The status of the receipt's latest claim, if any. `null` means unclaimed or its only claim
   * was rejected (a rejected claim releases its receipts). */
  latestClaimStatus: "draft" | "submitted" | "approved" | "rejected" | null
  currencyCode: string | null
  /** Only set when a target draft is already chosen (the dialog, once a radio is picked; the
   * server re-check on add-to-existing). Undefined means "no target yet" — the row/bulk-bar check
   * never flags currency_mismatch on its own. */
  targetCurrencyCode?: string | null
}

export function claimEligibility(facts: ClaimEligibilityFacts): ClaimEligibility {
  if (facts.templateCode !== "expense_receipt") return { status: "not_eligible", reason: "supplier_receipt" }
  if (facts.processingState === "needs_attention") return { status: "not_eligible", reason: "needs_attention" }
  if (facts.latestClaimStatus === "draft" || facts.latestClaimStatus === "submitted" || facts.latestClaimStatus === "approved") {
    return { status: "not_eligible", reason: "in_claim" }
  }
  if (facts.targetCurrencyCode != null && facts.currencyCode != null && facts.currencyCode !== facts.targetCurrencyCode) {
    return { status: "not_eligible", reason: "currency_mismatch" }
  }
  return { status: "ready" }
}
