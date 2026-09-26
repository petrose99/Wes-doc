// Deliberately NOT a "use server" module, matching every other models/*.ts helper: trusts the
// workspaceId it is handed. Writes happen only in lib/integrations/sync.ts's syncAccountingEntities.
import { prisma } from "@/lib/db"
import { cache } from "react"
import type { LineCodingInput } from "@/lib/checks/line-coding"
import { codingReferencesFrom } from "@/lib/finance/line-coding"
import { parseLedgerCapabilities } from "@/lib/integrations/ledger-capabilities"
import { decimalToNumber } from "@/lib/money"
import type { Prisma } from "@/prisma/client"

export type AccountingEntityType = "account" | "vendor" | "tax_rate" | "tracking_option" | "location" | "customer" | "item"

export const listAccountingEntities = cache(async (workspaceId: string, entityType: AccountingEntityType) => prisma.accountingEntity.findMany({
  where: { workspaceId, entityType, active: true },
  orderBy: { name: "asc" },
}))

/** Same as listAccountingEntities but including inactive rows — a prior sync marked an account
 * inactive once the provider stopped returning it (an archive at the provider). The Supplier
 * accounts table (#429) needs this to tell an archived supplier account's row apart from a live
 * one, which listAccountingEntities's active-only filter would otherwise hide entirely. Scoped to
 * one connection: inactive rows outlive a disconnect, and a prior ledger's archived account must
 * never read as this ledger's. */
export const listAccountingEntitiesIncludingInactive = cache(async (workspaceId: string, connectionId: string, entityType: AccountingEntityType) => prisma.accountingEntity.findMany({
  where: { workspaceId, connectionId, entityType },
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

export type LineCodingContext = Pick<LineCodingInput, "provider" | "capabilities" | "references" | "taxRates" | "names">

/** ADR 0014: what the line-coding Check reads about one ledger connection — its stored
 * capabilities (or `capabilities` passed in, a fresh read at push time), the references a bill can
 * use now, each Tax code's purchase rate, and Tracking names (inactive options included, so a
 * vanished option is still named). Null when the capabilities were never read: nothing can be
 * judged yet, and the push gate reads them before anything posts. */
export async function loadLineCodingContext(
  workspaceId: string,
  connection: { id: string; provider: string; ledgerCapabilities?: Prisma.JsonValue | null },
  capabilities = parseLedgerCapabilities(connection.ledgerCapabilities),
): Promise<LineCodingContext | null> {
  if (!capabilities) return null
  const entities = await prisma.accountingEntity.findMany({
    where: { workspaceId, connectionId: connection.id, entityType: { in: ["tax_rate", "tracking_option", "location", "item"] } },
    select: { entityType: true, externalId: true, parentExternalId: true, forPurchases: true, active: true, name: true, taxRatePercent: true, trackedInventory: true },
  })
  const names: Record<string, string> = Object.fromEntries(capabilities.tracking.map((category) => [category.id, category.name]))
  for (const option of entities.filter((entity) => entity.entityType === "tracking_option")) names[`${option.parentExternalId}:${option.externalId}`] = option.name
  // #459: item names too — checkLineCoding's item_not_in_ledger/item_quantity_needed name the item
  // by externalId the same way tracking names it by category:option.
  for (const item of entities.filter((entity) => entity.entityType === "item")) names[item.externalId] = item.name
  const taxRates = Object.fromEntries(entities.filter((entity) => entity.entityType === "tax_rate").map((code) => [code.externalId, decimalToNumber(code.taxRatePercent)]))
  return { provider: connection.provider, capabilities, references: codingReferencesFrom(entities), taxRates, names }
}
