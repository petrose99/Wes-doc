// Deliberately NOT a "use server" module, matching every other models/*.ts helper: trusts the
// workspaceId it is handed. Writes happen only via lib/finance/actions.ts's learn-on-approval
// upsert (#429, models/documents.ts); this file is the Accounting page's read + "Forget" surface.
import { prisma } from "@/lib/db"

export type SupplierAccountRuleRow = {
  id: string
  supplierName: string
  accountExternalId: string
  taxCodeExternalId: string | null
  tracking: { categoryId: string; optionId: string }[]
  locationExternalId: string | null
  lastUsedAt: Date
}

/** The rule's stored Tracking; anything not shaped `{categoryId, optionId}` is dropped, never thrown. */
export function parseRuleTracking(json: unknown): { categoryId: string; optionId: string }[] {
  if (!Array.isArray(json)) return []
  return json
    .filter((t) => t && typeof t.categoryId === "string" && typeof t.optionId === "string")
    .map((t) => ({ categoryId: t.categoryId, optionId: t.optionId }))
}

export async function listSupplierAccountRules(workspaceId: string, connectionId: string): Promise<SupplierAccountRuleRow[]> {
  const rows = await prisma.supplierAccountRule.findMany({
    where: { workspaceId, connectionId },
    select: { id: true, supplierName: true, accountExternalId: true, taxCodeExternalId: true, tracking: true, locationExternalId: true, lastUsedAt: true },
    orderBy: { supplierName: "asc" },
  })
  return rows.map((row) => ({ ...row, tracking: parseRuleTracking(row.tracking) }))
}

/** "Forget" (Accounting page) deletes the row outright rather than blanking it, so the next
 * approval re-learns fresh rather than resurrecting a stale account (#429 / ADR 0011). */
export async function deleteSupplierAccountRule(workspaceId: string, connectionId: string, ruleId: string): Promise<void> {
  await prisma.supplierAccountRule.deleteMany({ where: { workspaceId, connectionId, id: ruleId } })
}
