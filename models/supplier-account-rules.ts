// Deliberately NOT a "use server" module, matching every other models/*.ts helper: trusts the
// workspaceId it is handed. Writes happen only via lib/finance/actions.ts's learn-on-approval
// upsert (#429); this file is the Accounting page's read + "Forget" surface.
import { prisma } from "@/lib/db"

export type SupplierAccountRuleRow = {
  id: string
  supplierName: string
  accountExternalId: string
  lastUsedAt: Date
}

export async function listSupplierAccountRules(workspaceId: string, connectionId: string): Promise<SupplierAccountRuleRow[]> {
  return prisma.supplierAccountRule.findMany({
    where: { workspaceId, connectionId },
    select: { id: true, supplierName: true, accountExternalId: true, lastUsedAt: true },
    orderBy: { supplierName: "asc" },
  })
}

/** "Forget" (Accounting page) deletes the row outright rather than blanking it, so the next
 * approval re-learns fresh rather than resurrecting a stale account (#429 / ADR 0011). */
export async function deleteSupplierAccountRule(workspaceId: string, connectionId: string, ruleId: string): Promise<void> {
  await prisma.supplierAccountRule.deleteMany({ where: { workspaceId, connectionId, id: ruleId } })
}
