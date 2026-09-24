/** #429 / ADR 0011: pure per-line account resolution. A document's line items each need a ledger
 * account before they can post — the chain is supplier rule (this vendor's usual account, learned
 * on approval) → connection Default. A document coded before the connection existed falls back
 * instead to the pre-connection chain (CategoryAccountMapping / inferred map / Default), resolved
 * by the caller and passed in as `legacyAccountId` — this module only picks which chain applies
 * and shapes the per-line result; it never talks to Prisma or a provider. */

export type LineAccountSource = "supplier" | "default_guessed" | "default_confirmed"

export type LineAccountResolution = {
  accountExternalId: string | null
  accountSource: LineAccountSource | null
}

export type LineAccountRow = {
  account_external_id: string | null
  account_source: LineAccountSource | null
  /** #429: set when a matched supplier rule's account is no longer an active AccountingEntity —
   * the caller (models/documents.ts's resolveDocumentCodingItems) fell back to the connection
   * Default instead of the archived rule, and the surface layer flags that fallback rather than
   * showing it as an ordinary Default resolution. Never set by the pure functions below, which
   * have no account-activity data to know this from; the DB-touching orchestration adds it. */
  account_archived_fallback?: boolean
}

/** Resolves the ONE account every line of a document takes (scope: one account per document, not
 * per individual line's own category — #429's per-line surface is about giving each line a
 * visible, correctable account, not per-line category inference). Supplier rule wins over
 * Default; Default's `accountSource` reflects whether the connection has ever had its Default
 * confirmed by a person (`defaultAccountGuessed = false`) or is still the auto-guess. */
export function resolveLineAccount(input: {
  supplierRuleAccountId: string | null
  defaultAccountId: string | null
  defaultAccountGuessed: boolean
}): LineAccountResolution {
  if (input.supplierRuleAccountId) return { accountExternalId: input.supplierRuleAccountId, accountSource: "supplier" }
  if (input.defaultAccountId) {
    return { accountExternalId: input.defaultAccountId, accountSource: input.defaultAccountGuessed ? "default_guessed" : "default_confirmed" }
  }
  return { accountExternalId: null, accountSource: null }
}

/** A document coded (codingSource set) before its workspace's accounting connection existed was
 * coded under the pre-#429 world — its category was chosen with no supplier-rule/Default chain to
 * resolve against. Those documents keep resolving through the legacy CategoryAccountMapping chain
 * (resolveCategoryAccount) rather than being silently switched onto a chain that didn't exist when
 * they were coded. `codedAt` is a proxy (the document's receipt time — this codebase has no
 * separate "coded at" timestamp) documented at the call site. */
export function usesLegacyAccountChain(codingSource: string | null, codedAt: Date | null, connectionCreatedAt: Date): boolean {
  return Boolean(codingSource) && codedAt !== null && codedAt.getTime() < connectionCreatedAt.getTime()
}

/** Stamps the same resolution onto every line — #429 scope is one account per document (see
 * resolveLineAccount's doc comment), not independent per-line category inference. `legacy` results
 * (from the pre-connection chain) carry no `account_source` label since none of "supplier"/
 * "default_guessed"/"default_confirmed" describes them. */
export function resolveDocumentLineAccounts(lineCount: number, resolution: LineAccountResolution): LineAccountRow[] {
  const row: LineAccountRow = { account_external_id: resolution.accountExternalId, account_source: resolution.accountSource }
  return Array.from({ length: Math.max(lineCount, 0) }, () => ({ ...row }))
}
