/** Pure budget threshold engine — no Prisma.
 *
 * Checks a document's spend against workspace budgets, returning warnings/violations
 * for any that would be breached or are approaching their threshold.
 *
 * Arithmetic runs on integer cents so a budget threshold sitting on a cent boundary (100.00 vs
 * 99.99999998) does not silently flip percent-used across the warn/exceed line — see lib/money.ts.
 */

import { addCents, fromCents, toCents } from "@/lib/money"

export type Budget = {
  id: string
  name: string
  category: string | null
  vendor: string | null
  templateCode: string | null
  amount: number
  periodType: string
  warnAtPercent: number
}

export type BudgetDocument = {
  templateCode: string
  vendor: string | null
  category: string | null
  amount: number | null
}

export type BudgetCheckResult = {
  budgetId: string
  budgetName: string
  budgetAmount: number
  currentSpend: number
  projectedSpend: number
  percentUsed: number
  status: "ok" | "warning" | "exceeded"
}

export function matchesBudget(budget: Budget, document: BudgetDocument): boolean {
  if (budget.templateCode && budget.templateCode !== document.templateCode) return false
  if (budget.vendor && document.vendor) {
    if (budget.vendor.toLowerCase() !== document.vendor.toLowerCase()) return false
  } else if (budget.vendor && !document.vendor) {
    return false
  }
  if (budget.category && document.category) {
    if (budget.category.toLowerCase() !== document.category.toLowerCase()) return false
  } else if (budget.category && !document.category) {
    return false
  }
  return true
}

export function checkBudget(
  budget: Budget,
  currentSpend: number,
  documentAmount: number,
): BudgetCheckResult {
  const projectedCents = addCents([currentSpend, documentAmount])
  const projectedSpend = fromCents(projectedCents)
  const budgetCents = toCents(budget.amount)
  const percentUsed = budgetCents > 0 ? (projectedCents / budgetCents) * 100 : 0

  let status: BudgetCheckResult["status"] = "ok"
  if (percentUsed >= 100) {
    status = "exceeded"
  } else if (percentUsed >= budget.warnAtPercent) {
    status = "warning"
  }

  return {
    budgetId: budget.id,
    budgetName: budget.name,
    budgetAmount: budget.amount,
    currentSpend,
    projectedSpend,
    percentUsed: Math.round(percentUsed * 10) / 10,
    status,
  }
}

export function checkDocumentAgainstBudgets(
  budgets: Budget[],
  document: BudgetDocument,
  spendByBudgetId: Record<string, number>,
): BudgetCheckResult[] {
  if (document.amount == null || document.amount <= 0) return []

  const results: BudgetCheckResult[] = []
  for (const budget of budgets) {
    if (!matchesBudget(budget, document)) continue
    const currentSpend = spendByBudgetId[budget.id] ?? 0
    const result = checkBudget(budget, currentSpend, document.amount)
    if (result.status !== "ok") {
      results.push(result)
    }
  }
  return results.sort((a, b) => b.percentUsed - a.percentUsed)
}
