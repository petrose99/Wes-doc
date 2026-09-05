import { amountsMatch, amountTolerance } from "@/lib/checks/types"

export type BalanceSolverInput = {
  rows: BalanceRow[]
  openingBalance: number | null
  closingBalance: number | null
  currencyCode: string | null
}

export type BalanceRow = {
  debit: number | null
  credit: number | null
  running_balance: number | null
}

export type BalanceCorrection = {
  rowIndex: number
  field: "debit" | "credit" | "running_balance"
  original: number | null
  corrected: number
  reason: "ocr_confusable" | "wrong_column" | "wrong_balance" | "missing_amount"
}

export type BalanceSolverResult = {
  corrections: BalanceCorrection[]
  chainConsistent: boolean
  suspectRowIndexes: number[]
  summaryConflict: { field: "opening_balance" | "closing_balance"; chainValue: number; printedValue: number } | null
}

export type AccountGroup = {
  accountNumber: string | null
  openingBalance: number | null
  closingBalance: number | null
  rows: BalanceRow[]
  rowIndexes: number[]
}

const CONFUSABLE_PAIRS: [string, string][] = [
  ["0", "8"], ["0", "6"], ["6", "8"], ["1", "7"], ["3", "8"], ["5", "6"], ["9", "0"], ["2", "7"],
]

export function isOcrConfusable(a: number, b: number, currencyCode: string | null): boolean {
  if (amountsMatch(a, b, currencyCode)) return true
  const tol = amountTolerance(currencyCode)
  const decimals = tol >= 0.5 ? 0 : 2
  const sa = Math.abs(a).toFixed(decimals)
  const sb = Math.abs(b).toFixed(decimals)
  if (sa === sb) return true

  if (sa.length === sb.length) {
    let diffs = 0
    let diffPos = -1
    for (let i = 0; i < sa.length; i++) {
      if (sa[i] !== sb[i]) { diffs++; diffPos = i }
    }
    if (diffs === 1) {
      const ca = sa[diffPos]
      const cb = sb[diffPos]
      if (CONFUSABLE_PAIRS.some(([x, y]) => (ca === x && cb === y) || (ca === y && cb === x))) return true
    }

    if (diffs === 2) {
      const positions: number[] = []
      for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) positions.push(i)
      if (positions[1] - positions[0] === 1 && sa[positions[0]] === sb[positions[1]] && sa[positions[1]] === sb[positions[0]]) return true
    }
  }

  if (amountsMatch(a * 100, b, currencyCode) || amountsMatch(a, b * 100, currencyCode)) return true
  if (amountsMatch(a / 100, b, currencyCode) || amountsMatch(a, b / 100, currencyCode)) return true

  const stripThousands = (s: string) => s.replace(/,/g, "")
  if (stripThousands(sa) !== sa || stripThousands(sb) !== sb) {
    if (stripThousands(sa) === sb || sa === stripThousands(sb)) return true
  }
  const withThousands = (s: string) => {
    const [whole, dec] = s.split(".")
    const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
    return dec !== undefined ? `${grouped}.${dec}` : grouped
  }
  if (withThousands(sa) === sb || sa === withThousands(sb)) return true

  return false
}

export function walkBalanceChain(
  rows: BalanceRow[],
  anchorBalance: number | null,
  currencyCode: string | null,
): { breaks: { rowIndex: number; expected: number; printed: number }[]; lastBalance: number | null } {
  const breaks: { rowIndex: number; expected: number; printed: number }[] = []
  let currentBalance = anchorBalance
  let lastPrintedBalance = anchorBalance

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const amount = (row.credit ?? 0) - (row.debit ?? 0)
    if (currentBalance !== null) currentBalance += amount
    if (row.running_balance !== null) {
      if (currentBalance !== null && !amountsMatch(currentBalance, row.running_balance, currencyCode)) {
        breaks.push({ rowIndex: i, expected: currentBalance, printed: row.running_balance })
      }
      currentBalance = row.running_balance
      lastPrintedBalance = row.running_balance
    }
  }

  return { breaks, lastBalance: lastPrintedBalance }
}

export function solveRunningBalance(input: BalanceSolverInput): BalanceSolverResult {
  const { rows, openingBalance, closingBalance, currencyCode } = input
  if (!rows.length) return { corrections: [], chainConsistent: true, suspectRowIndexes: [], summaryConflict: null }

  const mutableRows: BalanceRow[] = rows.map((r) => ({ ...r }))
  const corrections: BalanceCorrection[] = []
  const suspectIndexes = new Set<number>()

  const anchor = openingBalance
  const { breaks } = walkBalanceChain(mutableRows, anchor, currencyCode)

  if (breaks.length === 1) {
    const brk = breaks[0]
    const k = brk.rowIndex
    const row = mutableRows[k]

    if (row.running_balance !== null && row.debit === null && row.credit === null) {
      const prevBal = getPrevBalance(mutableRows, k, anchor)
      if (prevBal !== null) {
        const delta = row.running_balance - prevBal
        if (delta >= 0) {
          corrections.push({ rowIndex: k, field: "credit", original: null, corrected: delta, reason: "missing_amount" })
          mutableRows[k] = { ...row, credit: delta }
        } else {
          corrections.push({ rowIndex: k, field: "debit", original: null, corrected: -delta, reason: "missing_amount" })
          mutableRows[k] = { ...row, debit: -delta }
        }
      }
    } else {
      const implied = brk.printed - (getPrevBalance(mutableRows, k, anchor) ?? brk.expected - ((row.credit ?? 0) - (row.debit ?? 0)))
      const currentAmount = (row.credit ?? 0) - (row.debit ?? 0)
      if (isOcrConfusable(currentAmount, implied, currencyCode)) {
        if (implied >= 0) {
          if (row.credit !== null && isOcrConfusable(row.credit, implied, currencyCode)) {
            corrections.push({ rowIndex: k, field: "credit", original: row.credit, corrected: implied, reason: "ocr_confusable" })
            mutableRows[k] = { ...row, credit: implied, debit: 0 }
          } else if (row.debit !== null && isOcrConfusable(row.debit, implied, currencyCode)) {
            corrections.push({ rowIndex: k, field: "debit", original: row.debit, corrected: 0, reason: "wrong_column" })
            corrections.push({ rowIndex: k, field: "credit", original: row.credit, corrected: implied, reason: "wrong_column" })
            mutableRows[k] = { ...row, credit: implied, debit: 0 }
          }
        } else {
          const absImplied = -implied
          if (row.debit !== null && isOcrConfusable(row.debit, absImplied, currencyCode)) {
            corrections.push({ rowIndex: k, field: "debit", original: row.debit, corrected: absImplied, reason: "ocr_confusable" })
            mutableRows[k] = { ...row, debit: absImplied, credit: 0 }
          } else if (row.credit !== null && isOcrConfusable(row.credit, absImplied, currencyCode)) {
            corrections.push({ rowIndex: k, field: "credit", original: row.credit, corrected: 0, reason: "wrong_column" })
            corrections.push({ rowIndex: k, field: "debit", original: row.debit, corrected: absImplied, reason: "wrong_column" })
            mutableRows[k] = { ...row, debit: absImplied, credit: 0 }
          }
        }
      }
      if (!corrections.length) suspectIndexes.add(k)
    }
  } else if (breaks.length === 2 && breaks[1].rowIndex - breaks[0].rowIndex === 1) {
    const k = breaks[0].rowIndex
    const row = mutableRows[k]
    const prevBal = getPrevBalance(mutableRows, k, anchor)
    if (prevBal !== null) {
      const impliedBal = prevBal + (row.credit ?? 0) - (row.debit ?? 0)
      if (row.running_balance !== null && isOcrConfusable(row.running_balance, impliedBal, currencyCode)) {
        const recheck = walkBalanceChain(
          mutableRows.map((r, j) => j === k ? { ...r, running_balance: impliedBal } : r),
          anchor, currencyCode,
        )
        if (recheck.breaks.length < breaks.length) {
          corrections.push({ rowIndex: k, field: "running_balance", original: row.running_balance, corrected: impliedBal, reason: "wrong_balance" })
          mutableRows[k] = { ...row, running_balance: impliedBal }
        } else {
          suspectIndexes.add(k)
          suspectIndexes.add(breaks[1].rowIndex)
        }
      } else {
        suspectIndexes.add(k)
        suspectIndexes.add(breaks[1].rowIndex)
      }
    } else {
      suspectIndexes.add(k)
      suspectIndexes.add(breaks[1].rowIndex)
    }
  } else if (breaks.length > 1) {
    for (const brk of breaks) suspectIndexes.add(brk.rowIndex)
  }

  const { breaks: finalBreaks, lastBalance } = walkBalanceChain(mutableRows, anchor, currencyCode)
  const chainConsistent = finalBreaks.length === 0 && (closingBalance === null || lastBalance === null || amountsMatch(lastBalance, closingBalance, currencyCode))

  let summaryConflict: BalanceSolverResult["summaryConflict"] = null
  const printedBalanceCount = mutableRows.filter((r) => r.running_balance !== null).length
  if (finalBreaks.length === 0 && printedBalanceCount >= 2) {
    if (openingBalance !== null && anchor !== null) {
      const firstPrintedIdx = mutableRows.findIndex((r) => r.running_balance !== null)
      if (firstPrintedIdx >= 0) {
        let expectedFirst = openingBalance
        for (let i = 0; i <= firstPrintedIdx; i++) expectedFirst += (mutableRows[i].credit ?? 0) - (mutableRows[i].debit ?? 0)
        if (!amountsMatch(expectedFirst, mutableRows[firstPrintedIdx].running_balance!, currencyCode) && openingBalance !== anchor) {
          summaryConflict = { field: "opening_balance", chainValue: anchor, printedValue: openingBalance }
        }
      }
    }
    if (!summaryConflict && closingBalance !== null && lastBalance !== null && !amountsMatch(lastBalance, closingBalance, currencyCode)) {
      summaryConflict = { field: "closing_balance", chainValue: lastBalance, printedValue: closingBalance }
    }
  }

  return {
    corrections,
    chainConsistent,
    suspectRowIndexes: [...suspectIndexes].sort((a, b) => a - b),
    summaryConflict,
  }
}

function getPrevBalance(rows: BalanceRow[], index: number, anchor: number | null): number | null {
  for (let i = index - 1; i >= 0; i--) {
    if (rows[i].running_balance !== null) {
      let bal = rows[i].running_balance!
      for (let j = i + 1; j < index; j++) bal += (rows[j].credit ?? 0) - (rows[j].debit ?? 0)
      return bal
    }
  }
  if (anchor === null) return null
  let bal = anchor
  for (let i = 0; i < index; i++) bal += (rows[i].credit ?? 0) - (rows[i].debit ?? 0)
  return bal
}

export function groupTransactionsByAccount(
  transactions: Array<Record<string, unknown>>,
  accounts: Array<Record<string, unknown>>,
  topOpeningBalance: number | null,
  topClosingBalance: number | null,
): AccountGroup[] {
  if (accounts.length <= 1) {
    return [{
      accountNumber: accounts.length === 1 ? normalizeAccountRef(String(accounts[0].account_number ?? "")) : null,
      openingBalance: accounts.length === 1 && typeof accounts[0].opening_balance === "number" ? accounts[0].opening_balance : topOpeningBalance,
      closingBalance: accounts.length === 1 && typeof accounts[0].closing_balance === "number" ? accounts[0].closing_balance : topClosingBalance,
      rows: transactions.map(toBalanceRow),
      rowIndexes: transactions.map((_, i) => i),
    }]
  }

  const accountNums = accounts.map((a) => normalizeAccountRef(String(a.account_number ?? "")))
  const refs = transactions.map((t) => typeof t.account_ref === "string" ? normalizeAccountRef(t.account_ref) : null)
  const allMissing = refs.every((r) => r === null)
  if (allMissing) {
    return [{
      accountNumber: null,
      openingBalance: topOpeningBalance,
      closingBalance: topClosingBalance,
      rows: transactions.map(toBalanceRow),
      rowIndexes: transactions.map((_, i) => i),
    }]
  }

  const matchAccount = (ref: string): string | null => {
    for (const num of accountNums) {
      if (num === ref) return num
      if (num.includes(ref) || ref.includes(num)) return num
      const refDigits = ref.replace(/\D/g, "")
      const numDigits = num.replace(/\D/g, "")
      if (refDigits.length >= 4 && numDigits.length >= 4) {
        if (numDigits.endsWith(refDigits) || refDigits.endsWith(numDigits)) return num
      }
    }
    return null
  }

  const assigned: (string | null)[] = refs.map((r) => r ? matchAccount(r) : null)

  for (let i = 0; i < assigned.length; i++) {
    if (assigned[i] !== null) continue
    const prev = i > 0 ? assigned[i - 1] : null
    const next = assigned.slice(i + 1).find((a) => a !== null) ?? null
    if (prev !== null && prev === next) assigned[i] = prev
  }

  const groups: Map<string, AccountGroup> = new Map()
  for (const acct of accounts) {
    const num = normalizeAccountRef(String(acct.account_number ?? ""))
    groups.set(num, {
      accountNumber: num,
      openingBalance: typeof acct.opening_balance === "number" ? acct.opening_balance : null,
      closingBalance: typeof acct.closing_balance === "number" ? acct.closing_balance : null,
      rows: [],
      rowIndexes: [],
    })
  }

  for (let i = 0; i < transactions.length; i++) {
    const acctNum = assigned[i]
    const group = acctNum ? groups.get(acctNum) : null
    if (group) {
      group.rows.push(toBalanceRow(transactions[i]))
      group.rowIndexes.push(i)
    }
  }

  return [...groups.values()]
}

function normalizeAccountRef(ref: string): string {
  return ref.replace(/[\s\-]/g, "").toLowerCase()
}

function toBalanceRow(row: Record<string, unknown>): BalanceRow {
  return {
    debit: typeof row.debit === "number" ? row.debit : null,
    credit: typeof row.credit === "number" ? row.credit : null,
    running_balance: typeof row.running_balance === "number" ? row.running_balance : null,
  }
}
