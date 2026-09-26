import { isAllowedPair } from "@/lib/geo/company-currency"

export type LedgerCurrencyOutcome = "none" | "unread" | "switch" | "ask_owner" | "blocked"

/** #457 §9.6: what the connection card says about the ledger's own currency. Client-safe.
 * Only QuickBooks and Xero are read (Sage is not live). A company off the allowed pairs (a
 * support-list company) is `blocked`, never a throw. */
export function ledgerCurrencyOutcome(input: {
  provider: string
  ledgerCurrency: string | null
  companyCurrency: string
  country: string | null
  locked: boolean
  isOwner: boolean
}): LedgerCurrencyOutcome {
  if (input.provider !== "quickbooks" && input.provider !== "xero") return "none"
  if (!input.ledgerCurrency) return "unread"
  if (input.ledgerCurrency === input.companyCurrency) return "none"
  if (input.locked || !isAllowedPair(input.country, input.ledgerCurrency)) return "blocked"
  return input.isOwner ? "switch" : "ask_owner"
}
