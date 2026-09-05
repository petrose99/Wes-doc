import { prisma } from "@/lib/db"
import type { Prisma } from "@/prisma/client"
import { checkDocumentAgainstBudgets, type Budget, type BudgetCheckResult, type BudgetDocument } from "./engine"

export async function checkDocumentBudgets(
  workspaceId: string,
  document: BudgetDocument,
): Promise<BudgetCheckResult[]> {
  if (document.amount == null || document.amount <= 0) return []

  const dbBudgets = await prisma.workspaceBudget.findMany({
    where: { workspaceId, isActive: true },
    select: { id: true, name: true, category: true, vendor: true, templateCode: true, amount: true, periodType: true, warnAtPercent: true },
  })

  if (dbBudgets.length === 0) return []

  const budgets: Budget[] = dbBudgets.map((b: { id: string; name: string; category: string | null; vendor: string | null; templateCode: string | null; amount: number; periodType: string; warnAtPercent: number }) => ({
    id: b.id,
    name: b.name,
    category: b.category,
    vendor: b.vendor,
    templateCode: b.templateCode,
    amount: b.amount,
    periodType: b.periodType,
    warnAtPercent: b.warnAtPercent,
  }))

  const periodStart = getPeriodStart(new Date())
  const spendByBudgetId: Record<string, number> = {}

  for (const budget of budgets) {
    const conditions: string[] = [`d."workspace_id" = $1::uuid`, `d."status" NOT IN ('received', 'queued', 'failed')`]
    const params: unknown[] = [workspaceId]

    params.push(periodStart)
    conditions.push(`d."received_at" >= $${params.length}::timestamp`)

    if (budget.category) {
      params.push(budget.category)
      conditions.push(`LOWER(btrim(d."coding_data"->>'account')) = LOWER($${params.length})`)
    }
    if (budget.vendor) {
      params.push(budget.vendor)
      conditions.push(`LOWER(btrim(total."value_text")) = LOWER($${params.length})`)
    }

    const vendorJoin = budget.vendor
      ? `LEFT JOIN "document_field_values" total ON total."document_id" = d."id" AND total."workspace_id" = $1::uuid AND total."field_key" = 'vendor' AND total."item_key" IS NULL`
      : ""

    const amountJoin = `JOIN "document_field_values" amt ON amt."document_id" = d."id" AND amt."workspace_id" = $1::uuid AND amt."field_key" = 'total' AND amt."item_key" IS NULL`

    const sql = `SELECT COALESCE(SUM(amt."value_number"), 0) AS "spend" FROM "documents" d ${amountJoin} ${vendorJoin} WHERE ${conditions.join(" AND ")}`

    const rows = await prisma.$queryRawUnsafe<{ spend: number | string }[]>(sql, ...params)
    spendByBudgetId[budget.id] = Number(rows[0]?.spend ?? 0)
  }

  return checkDocumentAgainstBudgets(budgets, document, spendByBudgetId)
}

function getPeriodStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}
