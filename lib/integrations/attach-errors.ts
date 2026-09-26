/** CODING_STANDARDS #9: a new error code gets a user-facing sentence in the same commit — every
 * code `attemptIntegrationAttachment` can produce (lib/integration-attach.ts, lib/integrations/
 * attach-limits.ts) is named here so an attach-failure description never shows a raw code.
 * Anything not listed (a transient/retryable code from `classifyHttpStatus`/`safeErrorCode`) falls
 * back to the humanized-code convention `errorMessage` already uses in action-helpers.ts.
 *
 * Contract: every value here is a clause fragment, read as the second half of a sentence shaped
 * "... — {sentence}." (see push-failures.ts's attachFailuresCheck and the StatusLine trailing
 * block on the ledger tab) — lowercase, no leading "the file …"/trailing period of its own. */
export const ATTACH_ERROR_SENTENCES: Record<string, string> = {
  attach_source_missing: "the source file is no longer stored",
  attach_invalid_type: "the ledger doesn't accept this file type",
  attach_oversize: "the file is too large for the ledger to accept",
  attach_over_count: "the bill already has the maximum number of files the ledger allows",
  attach_bill_gone: "the posted bill no longer exists in the ledger",
  attach_push_not_succeeded: "the post to the ledger hadn't actually finished yet",
  integration_default_account_not_configured: "no default expense account is configured for this connection",
  integration_connection_disabled: "the ledger connection is disabled",
}

export function describeAttachError(errorCode: string): string {
  return ATTACH_ERROR_SENTENCES[errorCode] ?? errorCode.replaceAll("_", " ")
}

/** CODING_STANDARDS #16: the one ledger-provider display-name map the attach surface uses
 * (`bill-pane.tsx`'s AttachTrailing). `models/documents.ts` and `integrations-manager.tsx` each
 * carry their own pre-existing copy of the same three names — untouched here, since consolidating
 * those is a separate cleanup, not part of #462 — but a *new* call site reuses this one rather
 * than adding a fourth. */
export const ATTACH_PROVIDER_LABELS: Record<string, string> = { quickbooks: "QuickBooks", xero: "Xero", sage: "Sage" }
