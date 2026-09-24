// Deliberately NOT a "use server" module, matching every other models/*.ts helper: trusts the
// workspaceId it is handed. Writes happen only in lib/integrations/sync.ts's syncAccountingEntities.
import { prisma } from "@/lib/db"
import { cache } from "react"

export const listAccountingEntities = cache(async (workspaceId: string, entityType: "account" | "vendor" | "tax_rate") => prisma.accountingEntity.findMany({
  where: { workspaceId, entityType, active: true },
  orderBy: { name: "asc" },
}))

/** Same as listAccountingEntities but including inactive rows — a prior sync marked an account
 * inactive once the provider stopped returning it (an archive at the provider). The Supplier
 * accounts table (#429) needs this to tell an archived supplier account's row apart from a live
 * one, which listAccountingEntities's active-only filter would otherwise hide entirely. */
export const listAccountingEntitiesIncludingInactive = cache(async (workspaceId: string, entityType: "account" | "vendor" | "tax_rate") => prisma.accountingEntity.findMany({
  where: { workspaceId, entityType },
  orderBy: { name: "asc" },
}))

/** The most recent sync across every entity type for this workspace's connection, or null if it
 * has never been synced — the settings card's "last synced" timestamp.
 *
 * Takes the workspaceId even though connectionId already identifies one workspace's connection:
 * AccountingEntity is workspace-scoped, so the guard requires the filter to be stated rather than
 * implied through a join key. Without it this throws and takes the whole Accounting page down with
 * it — the page has no data to fall back to. */
export const getLastSyncedAt = cache(async (workspaceId: string, connectionId: string): Promise<Date | null> => {
  const row = await prisma.accountingEntity.findFirst({ where: { workspaceId, connectionId }, orderBy: { syncedAt: "desc" }, select: { syncedAt: true } })
  return row?.syncedAt ?? null
})

/** Active account/vendor counts for the Accounting tab's "Sync & coding" card — how much a "Sync
 * now" actually pulled in, without the caller loading every row. */
export const getEntityCounts = cache(async (workspaceId: string, connectionId: string): Promise<{ accounts: number; vendors: number }> => {
  const [accounts, vendors] = await Promise.all([
    prisma.accountingEntity.count({ where: { workspaceId, connectionId, entityType: "account", active: true } }),
    prisma.accountingEntity.count({ where: { workspaceId, connectionId, entityType: "vendor", active: true } }),
  ])
  return { accounts, vendors }
})
