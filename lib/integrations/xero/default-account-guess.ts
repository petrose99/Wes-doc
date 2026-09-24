/** #429: guesses a connection's Default expense account right after chart sync, so a workspace
 * never has to hand-pick one before its first post. Exact name match only — no fuzzy scoring — on
 * Xero's own catch-all account name, restricted to active EXPENSE-class accounts. A synced
 * `AccountingEntity` row's `raw` JSON is the full account object listAccounts returned, carrying
 * `accountClass`; this is a pure function over that shape so it is testable without a live Xero
 * call (per spec's "Default account guess"). */

const XERO_CATCH_ALL_ACCOUNT_NAME = "General Expenses"

export type SyncedAccountRow = { entityType: string; active: boolean; name: string; raw: unknown }

export function guessXeroDefaultAccount<T extends SyncedAccountRow>(accounts: T[]): T | null {
  return (
    accounts.find((account) => {
      if (account.entityType !== "account" || !account.active) return false
      if (account.name !== XERO_CATCH_ALL_ACCOUNT_NAME) return false
      const raw = account.raw as { accountClass?: string } | null
      return raw?.accountClass === "EXPENSE"
    }) ?? null
  )
}
