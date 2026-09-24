/** Pure eligibility re-resolution for the selection-driven bulk "Post" action (#281, executing
 * #248) — kept out of the "use server" action file so it's unit-testable without a DB, same split
 * lib/integration-push-policy.ts already uses for pushOutcome/computePushUpdate. A selected id is
 * never trusted as eligible: the server re-checks every criterion pushDocumentToConnection enforces
 * (integration-push-actions.ts), plus the two that action leaves to its callers' upstream query —
 * cancelled and already-posted. A doc that fails any check is never a silent drop from the
 * selection's count; it gets a named reason (spec.md §2/§3.1). */

import { isCategoryConfirmed, isPushableDocument } from "@/lib/doc-types"

export type SelectionEligibility = { eligible: true } | { eligible: false; reason: string }

export function resolveSelectionEligibility(
  doc: {
    status: string
    docType: string | null
    codingData: Record<string, unknown> | null
    baseCurrencyTotal: unknown
    cancelledAt: Date | null
  },
  opts: { alreadyPosted: boolean; workspaceBase: string | null; docCurrency: string | null }
): SelectionEligibility {
  if (doc.cancelledAt) return { eligible: false, reason: "Cancelled" }
  if (opts.alreadyPosted) return { eligible: false, reason: "Already posted" }
  if (doc.status !== "reviewed") return { eligible: false, reason: "Not yet approved" }
  if (!isPushableDocument({ docType: doc.docType })) return { eligible: false, reason: "Document type not supported" }
  if (opts.workspaceBase && opts.docCurrency && opts.docCurrency !== opts.workspaceBase && doc.baseCurrencyTotal === null) {
    return { eligible: false, reason: "Currency conversion pending" }
  }
  if (!isCategoryConfirmed(doc.codingData)) return { eligible: false, reason: "Category not confirmed" }
  // #429: per-line accounts are resolved once at Save review (models/documents.ts::
  // updateDocumentReview) and stamped onto codingData.items — a document with no connection at
  // review time, or with a line that resolved to no account, is not push-eligible.
  const items = Array.isArray((doc.codingData as { items?: unknown })?.items) ? ((doc.codingData as { items: Array<{ account_external_id: string | null }> }).items) : null
  if (!items || items.length === 0 || items.some((item) => !item.account_external_id)) {
    return { eligible: false, reason: "needs an Account" }
  }
  return { eligible: true }
}
