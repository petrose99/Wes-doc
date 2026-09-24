import { nangoProxy } from "@/lib/nango"
import { quickbooksCompanyBase } from "@/lib/integrations/quickbooks/config"
import { quickbooksApiError } from "@/lib/integrations/quickbooks/errors"

/** Thin wrappers around the QuickBooks Online Accounting API, called through Nango's proxy (ADR
 * 0005: Nango owns the OAuth app and token refresh, `lib/nango.ts` is the only module that talks to
 * it directly, and classifies proxy failures into the same IntegrationAuthError/Permanent/Retryable
 * set `lib/integrations/quickbooks/errors.ts` used to build itself). No SDK — the surface used here
 * (a name-exact vendor query-or-create, one expense account list, one bill create) is small enough
 * that a dependency buys nothing. Every function throws (never returns an error union) so callers
 * use ordinary try/catch, matching the rest of the codebase's client wrappers (e.g. lib/mineru.ts). */

const PROVIDER_CONFIG_KEY = "quickbooks"

async function apiRequest<T>(realmId: string, connectionId: string, path: string, init?: RequestInit): Promise<T> {
  return nangoProxy<T>(connectionId, PROVIDER_CONFIG_KEY, `${quickbooksCompanyBase(realmId)}${path}`, init)
}

/** Escapes a value for QuickBooks' SQL-like query language single-quoted string literals. */
function escapeQbQuery(value: string): string {
  return value.replace(/'/g, "\\'")
}

export type QuickBooksAccount = { id: string; name: string }

/** Lists expense accounts (AccountType = "Expense") for the settings UI's default-account picker. */
export async function listExpenseAccounts(realmId: string, connectionId: string): Promise<QuickBooksAccount[]> {
  const query = `select Id, Name from Account where AccountType = 'Expense' maxresults 200`
  const result = await apiRequest<{ QueryResponse?: { Account?: Array<{ Id: string; Name: string }> } }>(
    realmId, connectionId, `/query?query=${encodeURIComponent(query)}`
  )
  return (result.QueryResponse?.Account ?? []).map((a) => ({ id: a.Id, name: a.Name }))
}

const QUERY_PAGE_SIZE = 200

/** Pages through a QuickBooks query with `startposition`/`maxresults` until a page comes back
 * short of a full page — QuickBooks has no total-count or next-cursor field, so "fewer than asked
 * for" is the only end-of-results signal the API gives. */
async function paginatedQuery<Row>(realmId: string, connectionId: string, queryWithoutPaging: string, entityKey: string): Promise<Row[]> {
  const rows: Row[] = []
  let startPosition = 1
  for (;;) {
    const query = `${queryWithoutPaging} startposition ${startPosition} maxresults ${QUERY_PAGE_SIZE}`
    const result = await apiRequest<{ QueryResponse?: Record<string, Row[] | undefined> }>(realmId, connectionId, `/query?query=${encodeURIComponent(query)}`)
    const page = result.QueryResponse?.[entityKey] ?? []
    rows.push(...page)
    if (page.length < QUERY_PAGE_SIZE) return rows
    startPosition += QUERY_PAGE_SIZE
  }
}

export type QuickBooksSyncedAccount = { id: string; name: string; active: boolean; accountType: string }
export type QuickBooksSyncedVendor = { id: string; name: string; active: boolean }
export type QuickBooksSyncedTaxCode = { id: string; name: string; active: boolean }

/** All active accounts of any type, for WP1.5's chart-of-accounts sync — distinct from
 * listExpenseAccounts above, which stays scoped to the default-account picker's narrower need.
 * `accountType` rides along (not selected by listExpenseAccounts, which already filters
 * server-side) so #429's Default-account guess can tell an Expense account from any other kind
 * without a second round-trip. */
export async function listAccounts(realmId: string, connectionId: string): Promise<QuickBooksSyncedAccount[]> {
  const rows = await paginatedQuery<{ Id: string; Name: string; Active: boolean; AccountType: string }>(realmId, connectionId, "select Id, Name, Active, AccountType from Account where Active = true", "Account")
  return rows.map((row) => ({ id: row.Id, name: row.Name, active: row.Active, accountType: row.AccountType }))
}

export async function listVendors(realmId: string, connectionId: string): Promise<QuickBooksSyncedVendor[]> {
  const rows = await paginatedQuery<{ Id: string; DisplayName: string; Active: boolean }>(realmId, connectionId, "select Id, DisplayName, Active from Vendor where Active = true", "Vendor")
  return rows.map((row) => ({ id: row.Id, name: row.DisplayName, active: row.Active }))
}

export async function listTaxCodes(realmId: string, connectionId: string): Promise<QuickBooksSyncedTaxCode[]> {
  const rows = await paginatedQuery<{ Id: string; Name: string; Active: boolean }>(realmId, connectionId, "select Id, Name, Active from TaxCode where Active = true", "TaxCode")
  return rows.map((row) => ({ id: row.Id, name: row.Name, active: row.Active }))
}

/** Finds a vendor by exact DisplayName, or creates one. No fuzzy dedup — an exact match or a new
 * vendor, per scope. */
export async function findOrCreateVendor(realmId: string, connectionId: string, name: string): Promise<string> {
  const query = `select Id from Vendor where DisplayName = '${escapeQbQuery(name)}'`
  const found = await apiRequest<{ QueryResponse?: { Vendor?: Array<{ Id: string }> } }>(
    realmId, connectionId, `/query?query=${encodeURIComponent(query)}`
  )
  const existing = found.QueryResponse?.Vendor?.[0]
  if (existing) return existing.Id
  const created = await apiRequest<{ Vendor: { Id: string } }>(realmId, connectionId, "/vendor", {
    method: "POST",
    body: JSON.stringify({ DisplayName: name }),
  })
  return created.Vendor.Id
}

/** WP2.4: true when a bill with this exact DocNumber already exists at QuickBooks — the
 * ledger-side duplicate guard checked in lib/integration-push.ts before every push, independent
 * of this app's own duplicate detection (lib/checks/duplicates.ts), which only ever sees documents
 * this app itself has processed. */
export async function findBillByDocNumber(realmId: string, connectionId: string, docNumber: string): Promise<boolean> {
  const query = `select Id from Bill where DocNumber = '${escapeQbQuery(docNumber)}'`
  const result = await apiRequest<{ QueryResponse?: { Bill?: Array<{ Id: string }> } }>(realmId, connectionId, `/query?query=${encodeURIComponent(query)}`)
  return Boolean(result.QueryResponse?.Bill?.length)
}

/** Creates the bill. `body` is the exact shape from lib/integrations/quickbooks/bill-mapper.ts.
 * A7.2: `requestId` rides QuickBooks' `requestid` idempotency param — the same token replayed
 * after a timeout returns the originally created bill instead of creating a second one. */
export async function createBill(realmId: string, connectionId: string, body: unknown, requestId?: string | null): Promise<{ id: string }> {
  const path = requestId ? `/bill?requestid=${encodeURIComponent(requestId)}` : "/bill"
  const created = await apiRequest<{ Bill: { Id: string } }>(realmId, connectionId, path, {
    method: "POST",
    body: JSON.stringify(body),
  })
  return { id: created.Bill.Id }
}

/** Fetches just the Id/SyncToken QBO's void operation needs — voidBill below can't just send the
 * bare externalId, QBO requires the bill's *current* SyncToken (an optimistic-concurrency stamp
 * that increments on every edit) or the void request is rejected as a stale-object conflict. */
async function getBillRef(realmId: string, connectionId: string, billId: string): Promise<{ id: string; syncToken: string }> {
  const query = `select Id, SyncToken from Bill where Id = '${escapeQbQuery(billId)}'`
  const result = await apiRequest<{ QueryResponse?: { Bill?: Array<{ Id: string; SyncToken: string }> } }>(realmId, connectionId, `/query?query=${encodeURIComponent(query)}`)
  const bill = result.QueryResponse?.Bill?.[0]
  if (!bill) throw quickbooksApiError(404, "bill_not_found")
  return { id: bill.Id, syncToken: bill.SyncToken }
}

/** Voids a bill via QBO's documented `POST /bill?operation=void` — per QBO's API, this needs the
 * bill's current Id + SyncToken, not just an id, so this first re-reads the bill (getBillRef) to
 * pick up its latest SyncToken before voiding. Throws exactly like createBill on any non-2xx
 * response (apiRequest's own error handling), and just as much a real irreversible write against
 * whatever org realmId points at — callers must treat it with the same care as createBill. */
export async function voidBill(realmId: string, connectionId: string, billId: string): Promise<void> {
  const ref = await getBillRef(realmId, connectionId, billId)
  await apiRequest(realmId, connectionId, "/bill?operation=void", {
    method: "POST",
    body: JSON.stringify({ Id: ref.id, SyncToken: ref.syncToken }),
  })
}

// ---- Phase B: ledger sync ----------------------------------------------------------------------

export type QuickBooksLedgerTransaction = {
  id: string
  docNumber: string | null
  txnDate: string | null
  totalAmt: number | null
  currencyCode: string | null
  contactId: string | null
  contactName: string | null
  /** The first expense line's account — a Bill/Purchase can have several lines against several
   * accounts; lib/health/sync.ts takes the first as this transaction's representative account,
   * same simplification each provider's bill-mapper.ts's single-account default-expense-account
   * flow already makes for the write path. */
  accountId: string | null
  accountName: string | null
}

type QbLine = { AccountBasedExpenseLineDetail?: { AccountRef?: { value: string; name?: string } } }

function firstLineAccount(lines: QbLine[] | undefined): { accountId: string | null; accountName: string | null } {
  const ref = lines?.find((line) => line.AccountBasedExpenseLineDetail?.AccountRef)?.AccountBasedExpenseLineDetail?.AccountRef
  return { accountId: ref?.value ?? null, accountName: ref?.name ?? null }
}

/** Bills (vendor bills, AP) for Phase B's ledger sync. */
export async function listBills(realmId: string, connectionId: string): Promise<QuickBooksLedgerTransaction[]> {
  type Row = { Id: string; DocNumber?: string; TxnDate?: string; TotalAmt?: number; CurrencyRef?: { value: string }; VendorRef?: { value: string; name?: string }; Line?: QbLine[] }
  const rows = await paginatedQuery<Row>(realmId, connectionId, "select * from Bill", "Bill")
  return rows.map((row) => ({
    id: row.Id, docNumber: row.DocNumber ?? null, txnDate: row.TxnDate ?? null,
    totalAmt: row.TotalAmt ?? null, currencyCode: row.CurrencyRef?.value ?? null,
    contactId: row.VendorRef?.value ?? null, contactName: row.VendorRef?.name ?? null,
    ...firstLineAccount(row.Line),
  }))
}

/** Purchase entities (QuickBooks' expense/purchase transaction — cash/check/credit-card spend not
 * routed through the AP bill workflow) for Phase B's ledger sync. QuickBooks has no separate
 * "BankTransaction" list entity the way Xero does, so Purchase doubles as this app's "expense" kind
 * and no listBankTransactions is implemented for this provider — see lib/health/sync.ts. */
export async function listExpenses(realmId: string, connectionId: string): Promise<QuickBooksLedgerTransaction[]> {
  type Row = { Id: string; DocNumber?: string; TxnDate?: string; TotalAmt?: number; CurrencyRef?: { value: string }; EntityRef?: { value: string; name?: string }; Line?: QbLine[] }
  const rows = await paginatedQuery<Row>(realmId, connectionId, "select * from Purchase", "Purchase")
  return rows.map((row) => ({
    id: row.Id, docNumber: row.DocNumber ?? null, txnDate: row.TxnDate ?? null,
    totalAmt: row.TotalAmt ?? null, currencyCode: row.CurrencyRef?.value ?? null,
    contactId: row.EntityRef?.value ?? null, contactName: row.EntityRef?.name ?? null,
    ...firstLineAccount(row.Line),
  }))
}
