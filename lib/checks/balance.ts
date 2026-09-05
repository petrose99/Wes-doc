import { amountsMatch, type CheckResult } from "@/lib/checks/types"
import { walkBalanceChain, groupTransactionsByAccount, type BalanceRow } from "@/lib/extraction/balance-solver"

export type BalanceInput = {
  currencyCode: string | null
  openingBalance: number | null
  closingBalance: number | null
  transactions: { debit: number | null; credit: number | null; running_balance?: number | null; account_ref?: string | null }[]
  accounts?: { account_number?: string | null; opening_balance?: number | null; closing_balance?: number | null }[]
}

/** opening balance + Σ(credit − debit) ≈ closing balance. Warn, not fail (the roadmap's default
 * severity) — a statement's own printed running balance can legitimately be off by a rounding
 * unit the source document itself got wrong, so this is worth a look, not an automatic block.
 *
 * Multi-account: when ≥2 accounts, one aggregate result with per-account detail. */
export function checkStatementBalance(input: BalanceInput): CheckResult | null {
  const accounts = (input.accounts ?? []).filter((a) => a.account_number)
  if (accounts.length >= 2) return checkMultiAccountBalance(input, accounts)

  if (input.openingBalance === null || input.closingBalance === null) return null

  const netMovement = input.transactions.reduce((sum, transaction) => sum + (transaction.credit ?? 0) - (transaction.debit ?? 0), 0)
  const expectedClosing = input.openingBalance + netMovement
  const balanceRows: BalanceRow[] = input.transactions.map((t) => ({
    debit: t.debit ?? null, credit: t.credit ?? null, running_balance: t.running_balance ?? null,
  }))
  const { breaks } = walkBalanceChain(balanceRows, input.openingBalance, input.currencyCode)
  const chainBreaks = breaks.map((b) => ({ rowIndex: b.rowIndex, expected: b.expected, printed: b.printed }))
  const detail: Record<string, unknown> = { openingBalance: input.openingBalance, netMovement, expectedClosing, closingBalance: input.closingBalance, chainBreaks }

  if (amountsMatch(expectedClosing, input.closingBalance, input.currencyCode)) {
    return { checkCode: "statement_balance", status: "pass", message: "Opening balance plus transactions matches the closing balance.", detail }
  }
  return {
    checkCode: "statement_balance", status: "warn", detail,
    message: `Opening (${input.openingBalance}) + net movement (${round2(netMovement)}) = ${round2(expectedClosing)}, but closing balance is ${input.closingBalance}`,
  }
}

function checkMultiAccountBalance(
  input: BalanceInput,
  accounts: { account_number?: string | null; opening_balance?: number | null; closing_balance?: number | null }[],
): CheckResult | null {
  const txnRecords = input.transactions.map((t) => ({
    debit: t.debit ?? null, credit: t.credit ?? null, running_balance: t.running_balance ?? null,
    account_ref: t.account_ref ?? null,
  } as Record<string, unknown>))
  const acctRecords = accounts.map((a) => ({
    account_number: a.account_number ?? null, opening_balance: a.opening_balance ?? null, closing_balance: a.closing_balance ?? null,
  } as Record<string, unknown>))

  const groups = groupTransactionsByAccount(txnRecords, acctRecords, input.openingBalance, input.closingBalance)
  const accountDetails: { accountNumber: string | null; status: string; expectedClosing: number | null; closingBalance: number | null; chainBreaks: unknown[] }[] = []
  let worstStatus: "pass" | "warn" = "pass"

  for (const group of groups) {
    if (group.openingBalance === null || group.closingBalance === null) {
      accountDetails.push({ accountNumber: group.accountNumber, status: "skipped", expectedClosing: null, closingBalance: group.closingBalance, chainBreaks: [] })
      continue
    }
    const net = group.rows.reduce((s, r) => s + (r.credit ?? 0) - (r.debit ?? 0), 0)
    const expected = group.openingBalance + net
    const { breaks } = walkBalanceChain(group.rows, group.openingBalance, input.currencyCode)
    const chainBreaks = breaks.map((b) => ({ rowIndex: group.rowIndexes[b.rowIndex], expected: b.expected, printed: b.printed }))
    const match = amountsMatch(expected, group.closingBalance, input.currencyCode)
    const status = match ? "pass" : "warn"
    if (status === "warn") worstStatus = "warn"
    accountDetails.push({ accountNumber: group.accountNumber, status, expectedClosing: expected, closingBalance: group.closingBalance, chainBreaks })
  }

  if (!accountDetails.some((a) => a.status !== "skipped")) return null

  const detail = { accounts: accountDetails }
  if (worstStatus === "pass") {
    return { checkCode: "statement_balance", status: "pass", message: `All ${accountDetails.length} account(s) reconcile.`, detail }
  }
  const failing = accountDetails.filter((a) => a.status === "warn")
  return {
    checkCode: "statement_balance", status: "warn", detail,
    message: `${failing.length} of ${accountDetails.length} account(s) did not reconcile.`,
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}
