import { prisma } from "@/lib/db"
import * as quickbooks from "@/lib/integrations/quickbooks/client"
import * as xero from "@/lib/integrations/xero/client"
import { readLedgerCapabilities, type LedgerCapabilities } from "@/lib/integrations/ledger-capabilities"
import type { AccountingEntityType } from "@/models/accounting-entities"
import { refreshLineCodingChecksForConnection } from "@/models/document-checks"
import { guessQuickBooksDefaultAccount } from "@/lib/integrations/quickbooks/default-account-guess"
import { guessXeroDefaultAccount } from "@/lib/integrations/xero/default-account-guess"
import { Prisma } from "@/prisma/client"

/** WP1.5: pulls the chart of accounts, vendor list, and tax rates from the connection's provider
 * and upserts them as AccountingEntity rows — the local cache the rules UI's account picker
 * (WP1.6) reads from, so it never needs a live provider round-trip on page render. Any row from a
 * prior sync that the provider no longer returns is marked inactive rather than deleted: a rule
 * already pointing at a retired account should keep showing what it points at, not go blank.
 * #429: also guesses the connection's Default expense account off the freshly-synced chart, but
 * only while `defaultExpenseAccountGuessed` is still true — once an Owner has confirmed a Default
 * (or a post has), a re-sync must not silently swap it out from under them. */
export async function syncAccountingEntities(connectionId: string): Promise<void> {
  const connection = await prisma.integrationConnection.findUniqueOrThrow({
    where: { id: connectionId },
    select: { id: true, workspaceId: true, provider: true, externalTenantId: true, defaultExpenseAccountGuessed: true },
  })
  if (!connection.externalTenantId) throw new Error("integration_connection_not_ready")
  // Fresh on connect and every sync: a plan or VAT setting changed in the ledger must reach the
  // coding Checks before the next post (ADR 0014).
  const capabilities = await readLedgerCapabilities(connection)

  const rows = await fetchProviderEntities(connection.provider, connection.externalTenantId, connection.id, capabilities)

  const syncedAt = new Date()
  await prisma.$transaction([
    ...rows.map(({ entityType, externalId, raw, ...fields }) => prisma.accountingEntity.upsert({
      where: { connectionId_entityType_externalId: { connectionId: connection.id, entityType, externalId } },
      create: { workspaceId: connection.workspaceId, connectionId: connection.id, entityType, externalId, ...fields, raw: raw as Prisma.InputJsonValue, syncedAt },
      update: { ...fields, raw: raw as Prisma.InputJsonValue, syncedAt },
    })),
    // workspaceId is redundant next to connectionId — a connection belongs to one workspace — but
    // the scope guard reads the `where` and does not know that. Same fault, same fix, as the ledger
    // sync in lib/health/sync.ts: without it the whole $transaction rolls back and no entity is
    // ever synced.
    prisma.accountingEntity.updateMany({
      where: { workspaceId: connection.workspaceId, connectionId: connection.id, syncedAt: { lt: syncedAt } },
      data: { active: false },
    }),
  ])

  if (connection.defaultExpenseAccountGuessed) {
    const guess = guessDefaultAccount(connection.provider, rows)
    if (guess) {
      await prisma.integrationConnection.update({
        where: { id: connection.id },
        data: { defaultExpenseAccountId: guess.externalId, defaultExpenseAccountName: guess.name, defaultExpenseAccountGuessed: true },
      })
    }
  }
  // The fresh capabilities and references may clear, or raise, a coding Check on unposted bills.
  await refreshLineCodingChecksForConnection(connection.workspaceId, connection.id)
}

function guessDefaultAccount(provider: string, rows: SyncRow[]): SyncRow | null {
  switch (provider) {
    case "quickbooks":
      return guessQuickBooksDefaultAccount(rows)
    case "xero":
      return guessXeroDefaultAccount(rows)
    default:
      return null
  }
}

/** The type-specific columns (parent, tax percent/purchase flag, account default Tax code) are
 * optional here and land null for every other type. */
type SyncRow = {
  entityType: AccountingEntityType; externalId: string; code: string | null; name: string; active: boolean; raw: unknown
  parentExternalId?: string; parentName?: string; taxRatePercent?: number | null; forPurchases?: boolean; defaultTaxCode?: string | null
}

function fetchProviderEntities(provider: string, externalTenantId: string, connectionId: string, capabilities: LedgerCapabilities): Promise<SyncRow[]> {
  switch (provider) {
    case "quickbooks":
      return fetchQuickBooksEntities(externalTenantId, connectionId, capabilities)
    case "xero":
      return fetchXeroEntities(externalTenantId, connectionId)
    default:
      throw new Error(`unsupported_integration_provider_${provider}`)
  }
}

const none = Promise.resolve([])

async function fetchQuickBooksEntities(realmId: string, connectionId: string, capabilities: LedgerCapabilities): Promise<SyncRow[]> {
  // Class and Department lists only exist on the plans that have them; asking a plan without them
  // for either is at best an empty page, so the capability read decides.
  const [accounts, vendors, taxCodes, classes, departments, customers] = await Promise.all([
    quickbooks.listAccounts(realmId, connectionId),
    quickbooks.listVendors(realmId, connectionId),
    quickbooks.listTaxCodes(realmId, connectionId),
    capabilities.tracking.length ? quickbooks.listClasses(realmId, connectionId) : none,
    capabilities.location ? quickbooks.listDepartments(realmId, connectionId) : none,
    quickbooks.listCustomers(realmId, connectionId),
  ])
  const item = (entityType: AccountingEntityType) => (row: quickbooks.QuickBooksSyncedListItem): SyncRow => ({ entityType, externalId: row.id, code: null, name: row.name, active: row.active, raw: row })
  return [
    ...accounts.map((a): SyncRow => ({ entityType: "account", externalId: a.id, code: null, name: a.name, active: a.active, raw: a, defaultTaxCode: a.taxCodeId })),
    ...vendors.map(item("vendor")),
    ...taxCodes.map((t): SyncRow => ({ entityType: "tax_rate", externalId: t.id, code: null, name: t.name, active: t.active, raw: t, taxRatePercent: t.percent, forPurchases: t.forPurchases })),
    ...classes.map((c): SyncRow => ({ ...item("tracking_option")(c), parentExternalId: "class", parentName: "Class" })),
    ...departments.map(item("location")),
    ...customers.map(item("customer")),
  ]
}

async function fetchXeroEntities(tenantId: string, connectionId: string): Promise<SyncRow[]> {
  const [accounts, contacts, taxRates, trackingCategories] = await Promise.all([
    xero.listAccounts(tenantId, connectionId),
    xero.listContacts(tenantId, connectionId),
    xero.listTaxRates(tenantId, connectionId),
    xero.listTrackingCategories(tenantId, connectionId),
  ])
  return [
    ...accounts.map((a): SyncRow => ({ entityType: "account", externalId: a.code, code: a.code, name: a.name, active: a.active, raw: a, defaultTaxCode: a.taxType })),
    ...contacts.map((c): SyncRow => ({ entityType: "vendor", externalId: c.id, code: null, name: c.name, active: c.active, raw: c })),
    // Keyed by TaxType, the value a bill line is set from. Rows from before this was the key were
    // keyed by Name; nothing reads their ids, so the next sync simply marks them inactive.
    ...taxRates.map((t): SyncRow => ({ entityType: "tax_rate", externalId: t.taxType, code: null, name: t.name, active: t.active, raw: t, taxRatePercent: t.percent, forPurchases: t.canApplyToExpenses })),
    ...trackingCategories.flatMap((category) => category.options.map((o): SyncRow => ({
      entityType: "tracking_option", externalId: o.id, code: null, name: o.name, raw: o,
      active: o.status === "ACTIVE" && category.status === "ACTIVE", parentExternalId: category.id, parentName: category.name,
    }))),
  ]
}
