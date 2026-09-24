/** #429: guesses a connection's Default expense account right after chart sync, so a workspace
 * never has to hand-pick one before its first post. Exact name match only — no fuzzy scoring — on
 * QuickBooks' own catch-all account name, restricted to active Expense-type accounts. A synced
 * `AccountingEntity` row's `raw` JSON is the full account object listAccounts returned, carrying
 * `accountType`; this is a pure function over that shape so it is testable without a live
 * QuickBooks call (per spec's "Default account guess"). */

const QUICKBOOKS_CATCH_ALL_ACCOUNT_NAME = "Uncategorized Expense"

export type SyncedAccountRow = { entityType: string; active: boolean; name: string; raw: unknown }

export function guessQuickBooksDefaultAccount<T extends SyncedAccountRow>(accounts: T[]): T | null {
  return (
    accounts.find((account) => {
      if (account.entityType !== "account" || !account.active) return false
      if (account.name !== QUICKBOOKS_CATCH_ALL_ACCOUNT_NAME) return false
      const raw = account.raw as { accountType?: string } | null
      return raw?.accountType === "Expense"
    }) ?? null
  )
}
