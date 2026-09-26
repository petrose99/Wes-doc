import { prisma } from "@/lib/db"
import * as quickbooks from "@/lib/integrations/quickbooks/client"
import * as xero from "@/lib/integrations/xero/client"
import { readLedgerCapabilities } from "@/lib/integrations/ledger-capabilities"
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
  await readLedgerCapabilities(connection)

  const rows = await fetchProviderEntities(connection.provider, connection.externalTenantId, connection.id)

  const syncedAt = new Date()
  await prisma.$transaction([
    ...rows.map((row) => prisma.accountingEntity.upsert({
      where: { connectionId_entityType_externalId: { connectionId: connection.id, entityType: row.entityType, externalId: row.externalId } },
      create: { workspaceId: connection.workspaceId, connectionId: connection.id, entityType: row.entityType, externalId: row.externalId, code: row.code, name: row.name, active: row.active, raw: row.raw as Prisma.InputJsonValue, syncedAt },
      update: { code: row.code, name: row.name, active: row.active, raw: row.raw as Prisma.InputJsonValue, syncedAt },
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

type SyncRow = { entityType: "account" | "vendor" | "tax_rate"; externalId: string; code: string | null; name: string; active: boolean; raw: unknown }

function fetchProviderEntities(provider: string, externalTenantId: string, connectionId: string): Promise<SyncRow[]> {
  switch (provider) {
    case "quickbooks":
      return fetchQuickBooksEntities(externalTenantId, connectionId)
    case "xero":
      return fetchXeroEntities(externalTenantId, connectionId)
    default:
      throw new Error(`unsupported_integration_provider_${provider}`)
  }
}

async function fetchQuickBooksEntities(realmId: string, connectionId: string): Promise<SyncRow[]> {
  const [accounts, vendors, taxCodes] = await Promise.all([
    quickbooks.listAccounts(realmId, connectionId),
    quickbooks.listVendors(realmId, connectionId),
    quickbooks.listTaxCodes(realmId, connectionId),
  ])
  return [
    ...accounts.map((a): SyncRow => ({ entityType: "account", externalId: a.id, code: null, name: a.name, active: a.active, raw: a })),
    ...vendors.map((v): SyncRow => ({ entityType: "vendor", externalId: v.id, code: null, name: v.name, active: v.active, raw: v })),
    ...taxCodes.map((t): SyncRow => ({ entityType: "tax_rate", externalId: t.id, code: null, name: t.name, active: t.active, raw: t })),
  ]
}

async function fetchXeroEntities(tenantId: string, connectionId: string): Promise<SyncRow[]> {
  const [accounts, contacts, taxRates] = await Promise.all([
    xero.listAccounts(tenantId, connectionId),
    xero.listContacts(tenantId, connectionId),
    xero.listTaxRates(tenantId, connectionId),
  ])
  return [
    ...accounts.map((a): SyncRow => ({ entityType: "account", externalId: a.code, code: a.code, name: a.name, active: a.active, raw: a })),
    ...contacts.map((c): SyncRow => ({ entityType: "vendor", externalId: c.id, code: null, name: c.name, active: c.active, raw: c })),
    // Xero tax rates have no stable id in the API response — their Name is the only identifier a
    // client ever sees or sets a bill's TaxType from, so it doubles as this row's externalId.
    ...taxRates.map((t): SyncRow => ({ entityType: "tax_rate", externalId: t.name, code: null, name: t.name, active: t.active, raw: t })),
  ]
}
