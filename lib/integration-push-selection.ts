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
  return { eligible: true }
}

/** Filters a client-supplied account-override map down to server-confirmed eligible ids only
 * (spec.md §3.1: "account override only applied to server-confirmed eligible ids") — an override
 * for an id the server rejected is simply never read. */
export function filterOverridesToEligible(eligibleIds: Set<string>, overrides: Record<string, string> | undefined): Record<string, string> {
  if (!overrides) return {}
  return Object.fromEntries(Object.entries(overrides).filter(([id]) => eligibleIds.has(id)))
}
