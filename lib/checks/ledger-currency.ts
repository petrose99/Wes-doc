import type { CheckResult } from "@/lib/checks/types"

export const PROVIDER_LABELS: Record<string, string> = { quickbooks: "QuickBooks", xero: "Xero", sage: "Sage" }

export type LedgerCurrencyInput = { provider: string; ledgerCurrency: string; companyCurrency: string }

/** A ledger keeps its books in one currency; posting a Company-currency amount into a ledger kept in
 * another would book it at face value in the wrong unit (ADR 0013). Runs before every push, bank
 * statements included — "fail", never "warn": nothing is posted until the two agree. */
export function checkLedgerCurrency(input: LedgerCurrencyInput): CheckResult {
  const ledgerCurrency = input.ledgerCurrency.toUpperCase()
  if (ledgerCurrency === input.companyCurrency.toUpperCase()) {
    return { checkCode: "ledger_currency_differs", status: "pass", message: "Ledger currency matches", detail: { ...input } }
  }
  const provider = PROVIDER_LABELS[input.provider] ?? input.provider
  return {
    checkCode: "ledger_currency_differs",
    status: "fail",
    message: "Ledger currency differs",
    detail: { ...input, text: `${provider} keeps its books in ${ledgerCurrency}; this company's currency is ${input.companyCurrency}.` },
  }
}
