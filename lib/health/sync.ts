import { prisma } from "@/lib/db"
import { getValidAccessToken } from "@/lib/integration-token-refresh"
import * as quickbooks from "@/lib/integrations/quickbooks/client"
import * as xero from "@/lib/integrations/xero/client"
import * as bigcapital from "@/lib/integrations/bigcapital/client"
import { unscoped } from "@/lib/workspace-scope"
import { Prisma } from "@/prisma/client"

/** Phase B: pulls bills/expenses/bank-transactions from the connection's provider and upserts
 * them as LedgerTransaction rows — mirrors lib/integrations/sync.ts's syncAccountingEntities
 * exactly (same connection lookup, same getValidAccessToken credential handling, same
 * upsert-then-soft-retire $transaction shape). A row from a prior sync the provider no longer
 * returns is marked inactive rather than deleted, same convention as AccountingEntity. */
export async function syncLedgerTransactions(connectionId: string): Promise<void> {
  const connection = await prisma.integrationConnection.findUniqueOrThrow({
    where: { id: connectionId },
    select: { id: true, workspaceId: true, provider: true, externalTenantId: true },
  })
  if (!connection.externalTenantId) throw new Error("integration_connection_not_ready")

  const accessToken = await getValidAccessToken(connection.id)
  const rows = await fetchProviderLedgerTransactions(connection.provider, connection.externalTenantId, accessToken)

  const syncedAt = new Date()
  // Phase 5: rows DocuBite itself reconciled must not be clobbered back to false by a sync that
  // fetches raw reconciled=false from a provider that doesn't track this concept. We look up
  // the existing rows and, when reconciledSource=='docubite' and the incoming row says false,
  // keep the current value. When the incoming row says true, we let the provider take over.
  const existingByKey = new Map<string, { reconciled: boolean; reconciledSource: string | null }>()
  // workspaceId is redundant for correctness — connectionId already identifies exactly one
  // workspace — but it's required for the scope guard, which refuses a bare read on a
  // workspace-scoped model. Without it the sync fails on every attempt for every connection
  // (observed in prod, health.log after 2026-09-09) and the health signal goes stale.
  const existing = await prisma.ledgerTransaction.findMany({
    where: { workspaceId: connection.workspaceId, connectionId: connection.id },
    select: { kind: true, externalId: true, reconciled: true, reconciledSource: true },
  })
  for (const row of existing) existingByKey.set(`${row.kind}:${row.externalId}`, { reconciled: row.reconciled, reconciledSource: row.reconciledSource })
  const chooseReconciled = (row: SyncRow) => {
    const prior = existingByKey.get(`${row.kind}:${row.externalId}`)
    if (prior?.reconciledSource === "docubite" && !row.reconciled) {
      return { reconciled: true, reconciledSource: "docubite" as const }
    }
    if (row.reconciled) return { reconciled: true, reconciledSource: "provider" as const }
    return { reconciled: false, reconciledSource: null }
  }
  await prisma.$transaction([
    ...rows.map((row) => {
      const rec = chooseReconciled(row)
      return prisma.ledgerTransaction.upsert({
      where: { connectionId_kind_externalId: { connectionId: connection.id, kind: row.kind, externalId: row.externalId } },
      create: {
        workspaceId: connection.workspaceId, connectionId: connection.id, externalId: row.externalId, kind: row.kind,
        contactExternalId: row.contactExternalId, contactName: row.contactName,
        accountExternalId: row.accountExternalId, accountName: row.accountName,
        docNumber: row.docNumber, amount: row.amount, taxAmount: row.taxAmount, currencyCode: row.currencyCode,
        txnDate: row.txnDate, reconciled: rec.reconciled, reconciledSource: rec.reconciledSource,
        active: true, raw: row.raw as Prisma.InputJsonValue,
        dueAmount: row.dueAmount, paidAmount: row.paidAmount, paymentStatus: row.paymentStatus,
        syncedAt,
      },
      update: {
        contactExternalId: row.contactExternalId, contactName: row.contactName,
        accountExternalId: row.accountExternalId, accountName: row.accountName,
        docNumber: row.docNumber, amount: row.amount, taxAmount: row.taxAmount, currencyCode: row.currencyCode,
        txnDate: row.txnDate, reconciled: rec.reconciled, reconciledSource: rec.reconciledSource,
        active: true, raw: row.raw as Prisma.InputJsonValue,
        dueAmount: row.dueAmount, paidAmount: row.paidAmount, paymentStatus: row.paymentStatus,
        syncedAt,
      },
    })
    }),
    // workspaceId is redundant next to connectionId — a connection belongs to one workspace — but
    // the scope guard reads the `where` and does not know that. Without it this throws, the whole
    // $transaction rolls back, no row ever gets a syncedAt, and syncDueLedgerConnections finds the
    // connection due again on the very next worker tick: every sync failed forever while refetching
    // the provider's bills, expenses and invoices every few seconds.
    prisma.ledgerTransaction.updateMany({
      where: { workspaceId: connection.workspaceId, connectionId: connection.id, syncedAt: { lt: syncedAt } },
      data: { active: false },
    }),
  ])
}

const LEDGER_SYNC_STALE_MS = 24 * 60 * 60 * 1000
const BIGCAPITAL_SYNC_STALE_MS = 1 * 60 * 60 * 1000

/** When each connection may next be attempted, and how many times in a row it has failed.
 *
 * This exists because "due" below is derived from the newest LedgerTransaction.syncedAt, which is
 * absent in the two cases that matter most:
 *
 *   - the sync FAILED, so it wrote nothing — a lapsed token, a provider outage, a bug in the write
 *     path. The connection is due again on the very next tick, seconds later, so any lasting
 *     failure becomes an unbounded retry loop against someone else's API.
 *   - the sync SUCCEEDED and the provider genuinely has no bills, expenses or invoices yet. A
 *     brand-new organization writes zero rows, so there is no syncedAt to age and the connection is
 *     permanently due — a full three-endpoint refetch every tick, forever, for an empty ledger.
 *
 * Between them those two kept this deployment rate-limited to a standstill. A failure now backs off
 * exponentially; a success waits out the same staleness window a connection with rows gets.
 *
 * Held in memory rather than on IntegrationConnection because it is a throttle, not a fact about
 * the connection: losing it on a worker restart costs one extra attempt per connection, which is
 * the behaviour a restart should have anyway. */
const SYNC_RETRY_BASE_MS = 5 * 60 * 1000
const SYNC_RETRY_MAX_MS = 6 * 60 * 60 * 1000
const syncHolds = new Map<string, { failures: number; nextAttemptAt: number }>()

/** Test seam: a fresh process starts with nothing held, and each test needs the same. */
export function resetLedgerSyncBackoff() {
  syncHolds.clear()
}

/** Drains every active IntegrationConnection whose ledger sync is due — more than 24h since its
 * newest LedgerTransaction.syncedAt, or a connection with no LedgerTransaction rows at all yet
 * (synced unconditionally, once). Called from app/api/internal/jobs/process/route.ts's cron drain,
 * same "never throw past the caller" posture as drainIntegrationPushes/drainProvisionJobs: one
 * connection's sync failure (a lapsed token, a provider outage) is logged and skipped, never lets
 * a bad connection block every other workspace's drain. A connection that fails is then held off
 * for a growing interval (see SYNC_RETRY_BASE_MS) rather than retried on the next tick. Returns
 * how many connections were synced, for the route's response body. */
export async function syncDueLedgerConnections(): Promise<number> {
  // Draining across every workspace's connections at once is the same shape as
  // IntegrationPush/WebhookDelivery's global drains — deliberately unscoped, per
  // lib/workspace-scope.ts's own documented exception for background workers that claim jobs
  // across all tenants.
  const connections = await unscoped(() => prisma.integrationConnection.findMany({
    where: { status: "active" },
    select: { id: true, provider: true },
  }))
  if (!connections.length) return 0

  const latestSyncByConnection = new Map(
    (await unscoped(() => prisma.ledgerTransaction.groupBy({
      by: ["connectionId"],
      _max: { syncedAt: true },
      where: { connectionId: { in: connections.map((c) => c.id) } },
    }))).map((row) => [row.connectionId, row._max.syncedAt]),
  )

  const now = Date.now()
  let synced = 0
  for (const connection of connections) {
    const latestSyncedAt = latestSyncByConnection.get(connection.id)
    const staleMs = connection.provider === "bigcapital" ? BIGCAPITAL_SYNC_STALE_MS : LEDGER_SYNC_STALE_MS
    const due = !latestSyncedAt || now - latestSyncedAt.getTime() > staleMs
    if (!due) continue
    const hold = syncHolds.get(connection.id)
    if (hold && now < hold.nextAttemptAt) continue
    try {
      await syncLedgerTransactions(connection.id)
      // Held for the staleness window even on success: if the provider returned nothing there is no
      // row to carry a syncedAt, and the check above would call this connection due again instantly.
      syncHolds.set(connection.id, { failures: 0, nextAttemptAt: now + staleMs })
      synced++
    } catch (error) {
      const failures = (hold?.failures ?? 0) + 1
      const delay = Math.min(SYNC_RETRY_BASE_MS * 2 ** (failures - 1), SYNC_RETRY_MAX_MS)
      syncHolds.set(connection.id, { failures, nextAttemptAt: now + delay })
      console.error(
        `[health] failed to sync ledger for connection ${connection.id} (attempt ${failures}, next in ${Math.round(delay / 60000)}m):`,
        error instanceof Error ? error.message : error,
      )
    }
  }
  return synced
}

type SyncRow = {
  kind: "bill" | "expense" | "bank_transaction" | "invoice"
  externalId: string
  contactExternalId: string | null
  contactName: string | null
  accountExternalId: string | null
  accountName: string | null
  docNumber: string | null
  amount: number | null
  taxAmount: number | null
  currencyCode: string | null
  txnDate: Date | null
  reconciled: boolean
  dueAmount: number | null
  paidAmount: number | null
  paymentStatus: string | null
  raw: unknown
}

function toDate(value: string | null): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Read `IsReconciled` from a Xero bank transaction payload, if the client surfaced it. Kept
 * tolerant of shape drift — a missing/non-boolean value falls back to false. */
function readXeroIsReconciled(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false
  const raw = payload as Record<string, unknown>
  return raw.IsReconciled === true || raw.isReconciled === true
}

function fetchProviderLedgerTransactions(provider: string, externalTenantId: string, accessToken: string): Promise<SyncRow[]> {
  switch (provider) {
    case "quickbooks":
      return fetchQuickBooksLedgerTransactions(externalTenantId, accessToken)
    case "xero":
      return fetchXeroLedgerTransactions(externalTenantId, accessToken)
    case "bigcapital":
      return fetchBigcapitalLedgerTransactions(externalTenantId, accessToken)
    default:
      throw new Error(`unsupported_integration_provider_${provider}`)
  }
}

/** QuickBooks has no separate bank-transaction entity — its Purchase entity already covers
 * non-bill spend, so it doubles as this app's "expense" kind and no "bank_transaction" rows are
 * ever produced for this provider (see lib/integrations/quickbooks/client.ts's listExpenses). Every
 * row starts reconciled: false — QuickBooks' API has no "cleared/reconciled" flag on Bill/Purchase
 * (that concept lives on bank feed transactions, which this app doesn't sync), so
 * unreconciled_transactions.ts is only ever informative, never a false "already reconciled". */
async function fetchQuickBooksLedgerTransactions(realmId: string, accessToken: string): Promise<SyncRow[]> {
  const [bills, expenses] = await Promise.all([
    quickbooks.listBills(realmId, accessToken),
    quickbooks.listExpenses(realmId, accessToken),
  ])
  return [
    ...bills.map((b): SyncRow => ({
      kind: "bill", externalId: b.id, contactExternalId: b.contactId, contactName: b.contactName,
      accountExternalId: b.accountId, accountName: b.accountName, docNumber: b.docNumber,
      amount: b.totalAmt, taxAmount: null, currencyCode: b.currencyCode, txnDate: toDate(b.txnDate),
      reconciled: false, dueAmount: null, paidAmount: null, paymentStatus: null, raw: b,
    })),
    ...expenses.map((e): SyncRow => ({
      kind: "expense", externalId: e.id, contactExternalId: e.contactId, contactName: e.contactName,
      accountExternalId: e.accountId, accountName: e.accountName, docNumber: e.docNumber,
      amount: e.totalAmt, taxAmount: null, currencyCode: e.currencyCode, txnDate: toDate(e.txnDate),
      reconciled: false, dueAmount: null, paidAmount: null, paymentStatus: null, raw: e,
    })),
  ]
}

/** Xero has no separate "expense" entity — a SPEND bank transaction already covers non-bill spend,
 * so no "expense" rows are ever produced for this provider (see
 * lib/integrations/xero/client.ts's listBankTransactions). accountCode doubles as both
 * accountExternalId and accountName here (Xero accounts have no separate numeric id — see
 * lib/integrations/sync.ts's fetchXeroEntities using the same Code-as-id convention). */
async function fetchXeroLedgerTransactions(tenantId: string, accessToken: string): Promise<SyncRow[]> {
  const [bills, bankTransactions] = await Promise.all([
    xero.listBills(tenantId, accessToken),
    xero.listBankTransactions(tenantId, accessToken),
  ])
  return [
    ...bills.map((b): SyncRow => ({
      kind: "bill", externalId: b.id, contactExternalId: b.contactId, contactName: b.contactName,
      accountExternalId: b.accountCode, accountName: b.accountCode, docNumber: b.docNumber,
      amount: b.total, taxAmount: null, currencyCode: b.currencyCode, txnDate: toDate(b.txnDate),
      reconciled: false, dueAmount: null, paidAmount: null, paymentStatus: null, raw: b,
    })),
    ...bankTransactions.map((t): SyncRow => ({
      kind: "bank_transaction", externalId: t.id, contactExternalId: t.contactId, contactName: t.contactName,
      accountExternalId: t.accountCode, accountName: t.accountCode, docNumber: t.docNumber,
      amount: t.total, taxAmount: null, currencyCode: t.currencyCode, txnDate: toDate(t.txnDate),
      // Phase 5: Xero's bank transactions carry IsReconciled — surface it instead of hard-coding
      // false. The chooseReconciled decision above still lets a docubite-source row keep its
      // truth over a provider that says false.
      reconciled: readXeroIsReconciled(t),
      dueAmount: null, paidAmount: null, paymentStatus: null, raw: t,
    })),
  ]
}

/** Bigcapital's connection carries an API key (never rotated by getValidAccessToken — see
 * models/bigcapital.ts) rather than an OAuth access token, same as fetchBigcapitalEntities in
 * lib/integrations/sync.ts. No bank-transaction list is synced for this provider — its
 * /api/banking/transactions endpoint requires a specific accountId (verified against a real
 * instance during this phase; there is no top-level "list every bank transaction" endpoint), which
 * doesn't fit this sync's one-connection-wide pull; a later phase can add a per-account loop once
 * bank/cash accounts are identifiable from cached data (see control-account-postings.ts's note
 * about account-type data not being cached today). */
function computePaymentStatus(dueAmount: number | null, paidAmount: number | null, total: number | null): string | null {
  if (dueAmount == null && paidAmount == null) return null
  const due = dueAmount ?? total ?? 0
  const paid = paidAmount ?? 0
  if (due <= 0 && paid > 0) return "paid"
  if (paid <= 0) return "unpaid"
  return "partial"
}

async function fetchBigcapitalLedgerTransactions(organizationId: string, apiKey: string): Promise<SyncRow[]> {
  const [bills, expenses, invoices] = await Promise.all([
    bigcapital.listBills(apiKey, organizationId),
    bigcapital.listExpenses(apiKey, organizationId),
    bigcapital.listSaleInvoices(apiKey, organizationId),
  ])
  return [
    ...bills.map((b): SyncRow => ({
      kind: "bill", externalId: b.id, contactExternalId: b.contactId, contactName: b.contactName,
      accountExternalId: b.accountId, accountName: b.accountName, docNumber: b.docNumber,
      amount: b.total, taxAmount: b.taxAmount, currencyCode: b.currencyCode, txnDate: toDate(b.txnDate),
      reconciled: false,
      dueAmount: b.dueAmount, paidAmount: b.paidAmount,
      paymentStatus: computePaymentStatus(b.dueAmount, b.paidAmount, b.total),
      raw: b,
    })),
    ...expenses.map((e): SyncRow => ({
      kind: "expense", externalId: e.id, contactExternalId: e.contactId, contactName: e.contactName,
      accountExternalId: e.accountId, accountName: e.accountName, docNumber: e.docNumber,
      amount: e.total, taxAmount: e.taxAmount, currencyCode: e.currencyCode, txnDate: toDate(e.txnDate),
      reconciled: false,
      dueAmount: e.dueAmount, paidAmount: e.paidAmount,
      paymentStatus: computePaymentStatus(e.dueAmount, e.paidAmount, e.total),
      raw: e,
    })),
    ...invoices.map((inv): SyncRow => ({
      kind: "invoice" as SyncRow["kind"], externalId: inv.id, contactExternalId: inv.contactId, contactName: inv.contactName,
      accountExternalId: inv.accountId, accountName: inv.accountName, docNumber: inv.docNumber,
      amount: inv.total, taxAmount: inv.taxAmount, currencyCode: inv.currencyCode, txnDate: toDate(inv.txnDate),
      reconciled: false,
      dueAmount: inv.dueAmount, paidAmount: inv.paidAmount,
      paymentStatus: computePaymentStatus(inv.dueAmount, inv.paidAmount, inv.total),
      raw: inv,
    })),
  ]
}
