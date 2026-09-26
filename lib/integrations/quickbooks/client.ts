import { nangoProxy } from "@/lib/nango"
import { quickbooksCompanyBase } from "@/lib/integrations/quickbooks/config"
import { quickbooksApiError } from "@/lib/integrations/quickbooks/errors"
import { IntegrationPermanentError } from "@/lib/integrations/errors"

/** Thin wrappers around the QuickBooks Online Accounting API, called through Nango's proxy (ADR
 * 0005: Nango owns the OAuth app and token refresh, `lib/nango.ts` is the only module that talks to
 * it directly, and classifies proxy failures into the same IntegrationAuthError/Permanent/Retryable
 * set `lib/integrations/quickbooks/errors.ts` used to build itself). No SDK — the surface used here
 * (a name-exact vendor query-or-create, one expense account list, one bill create) is small enough
 * that a dependency buys nothing. Every function throws (never returns an error union) so callers
 * use ordinary try/catch, matching the rest of the codebase's client wrappers (e.g. lib/mineru.ts). */

const PROVIDER_CONFIG_KEY = "quickbooks"

async function apiRequest<T>(realmId: string, connectionId: string, path: string, init?: RequestInit): Promise<T> {
  return nangoProxy<T>(connectionId, PROVIDER_CONFIG_KEY, `${quickbooksCompanyBase(realmId)}${path}`, init, quickbooksApiError)
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

export type QuickBooksSyncedAccount = { id: string; name: string; active: boolean; accountType: string; taxCodeId: string | null }
export type QuickBooksSyncedVendor = { id: string; name: string; active: boolean }
/** Class, Department (Location) and Customer rows — the same three fields each. */
export type QuickBooksSyncedListItem = QuickBooksSyncedVendor
/** `forPurchases`: the code carries a purchase rate, so a bill line may use it; `percent` sums
 * those purchase rates (a code can stack several), null when it has none. */
export type QuickBooksSyncedTaxCode = { id: string; name: string; active: boolean; forPurchases: boolean; percent: number | null }

/** All active accounts of any type, for WP1.5's chart-of-accounts sync — distinct from
 * listExpenseAccounts above, which stays scoped to the default-account picker's narrower need.
 * `accountType` rides along (not selected by listExpenseAccounts, which already filters
 * server-side) so #429's Default-account guess can tell an Expense account from any other kind
 * without a second round-trip. */
export async function listAccounts(realmId: string, connectionId: string): Promise<QuickBooksSyncedAccount[]> {
  const rows = await paginatedQuery<{ Id: string; Name: string; Active: boolean; AccountType: string; TaxCodeRef?: { value: string } }>(realmId, connectionId, "select Id, Name, Active, AccountType, TaxCodeRef from Account where Active = true", "Account")
  return rows.map((row) => ({ id: row.Id, name: row.Name, active: row.Active, accountType: row.AccountType, taxCodeId: row.TaxCodeRef?.value ?? null }))
}

export async function listVendors(realmId: string, connectionId: string): Promise<QuickBooksSyncedVendor[]> {
  const rows = await paginatedQuery<{ Id: string; DisplayName: string; Active: boolean }>(realmId, connectionId, "select Id, DisplayName, Active from Vendor where Active = true", "Vendor")
  return rows.map((row) => ({ id: row.Id, name: row.DisplayName, active: row.Active }))
}

export async function listTaxCodes(realmId: string, connectionId: string): Promise<QuickBooksSyncedTaxCode[]> {
  type Wire = { Id: string; Name: string; Active: boolean; PurchaseTaxRateList?: { TaxRateDetail?: Array<{ TaxRateRef: { value: string } }> } }
  const [codes, rates] = await Promise.all([
    paginatedQuery<Wire>(realmId, connectionId, "select * from TaxCode where Active = true", "TaxCode"),
    paginatedQuery<{ Id: string; RateValue?: number }>(realmId, connectionId, "select Id, RateValue from TaxRate", "TaxRate"),
  ])
  const percentByRate = new Map(rates.map((rate) => [rate.Id, rate.RateValue ?? 0]))
  return codes.map((row) => {
    const purchaseRates = row.PurchaseTaxRateList?.TaxRateDetail ?? []
    const forPurchases = purchaseRates.length > 0
    const percent = forPurchases ? purchaseRates.reduce((sum, d) => sum + (percentByRate.get(d.TaxRateRef.value) ?? 0), 0) : null
    return { id: row.Id, name: row.Name, active: row.Active, forPurchases, percent }
  })
}

/** Class and Department use the full "Parent:Child" path as their name — the same label QuickBooks
 * shows in its own pickers, so a nested Class never reads as its bare leaf. */
async function listNamedList(realmId: string, connectionId: string, entity: "Class" | "Department"): Promise<QuickBooksSyncedListItem[]> {
  const rows = await paginatedQuery<{ Id: string; FullyQualifiedName: string; Active: boolean }>(realmId, connectionId, `select Id, FullyQualifiedName, Active from ${entity} where Active = true`, entity)
  return rows.map((row) => ({ id: row.Id, name: row.FullyQualifiedName, active: row.Active }))
}

export const listClasses = (realmId: string, connectionId: string) => listNamedList(realmId, connectionId, "Class")
/** QuickBooks calls a Location a Department in its API. */
export const listDepartments = (realmId: string, connectionId: string) => listNamedList(realmId, connectionId, "Department")

export async function listCustomers(realmId: string, connectionId: string): Promise<QuickBooksSyncedListItem[]> {
  const rows = await paginatedQuery<{ Id: string; DisplayName: string; Active: boolean }>(realmId, connectionId, "select Id, DisplayName, Active from Customer where Active = true", "Customer")
  return rows.map((row) => ({ id: row.Id, name: row.DisplayName, active: row.Active }))
}

export type QuickBooksSyncedItem = {
  id: string; code: string | null; name: string; itemType: string; trackedInventory: boolean; active: boolean
  accountExternalId: string | null; taxCodeExternalId: string | null
}

/** Only items purchasable on a bill: a Service item with neither an ExpenseAccountRef nor an
 * AssetAccountRef is sales-only and is dropped, mirroring the tax-code `forPurchases` filter above. */
export async function listItems(realmId: string, connectionId: string): Promise<QuickBooksSyncedItem[]> {
  type Wire = {
    Id: string; Sku?: string; Name: string; Type: string; Active: boolean
    ExpenseAccountRef?: { value: string }; AssetAccountRef?: { value: string }; PurchaseTaxCodeRef?: { value: string }
  }
  const rows = await paginatedQuery<Wire>(realmId, connectionId, "select * from Item where Active = true", "Item")
  return rows
    .filter((row) => row.ExpenseAccountRef || row.AssetAccountRef)
    .map((row) => ({
      id: row.Id, code: row.Sku ?? null, name: row.Name, itemType: row.Type, trackedInventory: row.Type === "Inventory",
      active: row.Active, accountExternalId: row.ExpenseAccountRef?.value ?? row.AssetAccountRef?.value ?? null,
      taxCodeExternalId: row.PurchaseTaxCodeRef?.value ?? null,
    }))
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
/** ADR 0014: returns the VAT and total QuickBooks computed so the push can compare them with the
 * invoice. QuickBooks' create response carries no warnings list, so `warnings` is always empty. */
export async function createBill(realmId: string, connectionId: string, body: unknown, requestId?: string | null): Promise<{ id: string; totalTax: number | null; total: number | null; warnings: string[] }> {
  const path = requestId ? `/bill?requestid=${encodeURIComponent(requestId)}` : "/bill"
  const created = await apiRequest<{ Bill: { Id: string; TotalAmt?: number; TxnTaxDetail?: { TotalTax?: number } } }>(realmId, connectionId, path, {
    method: "POST",
    body: JSON.stringify(body),
  })
  const bill = created.Bill
  return { id: bill.Id, totalTax: bill.TxnTaxDetail?.TotalTax ?? null, total: bill.TotalAmt ?? null, warnings: [] }
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

// ---- #430: correcting posted bills' Accounts -----------------------------------------------

/** The full bill row this correction path needs: Id/SyncToken for the update write, Balance/
 * TotalAmt to tell paid from unpaid (QBO has no boolean "Paid" field — a Bill is paid when its
 * Balance has dropped to 0), and the current Line array so the update can resend every line
 * (amount, description, tax) unchanged except the AccountRef the caller is correcting. */
async function getBillForCorrection(realmId: string, connectionId: string, billId: string): Promise<{ id: string; syncToken: string; balance: number; totalAmt: number; lines: QbLine[] }> {
  const query = `select Id, SyncToken, Balance, TotalAmt, Line from Bill where Id = '${escapeQbQuery(billId)}'`
  const result = await apiRequest<{ QueryResponse?: { Bill?: Array<{ Id: string; SyncToken: string; Balance?: number; TotalAmt?: number; Line?: QbLine[] }> } }>(realmId, connectionId, `/query?query=${encodeURIComponent(query)}`)
  const bill = result.QueryResponse?.Bill?.[0]
  if (!bill) throw quickbooksApiError(404, "bill_not_found")
  return { id: bill.Id, syncToken: bill.SyncToken, balance: bill.Balance ?? 0, totalAmt: bill.TotalAmt ?? 0, lines: bill.Line ?? [] }
}

/** QuickBooks' company-wide books-closed date (`AccountingInfoPrefs.BookCloseDate` on
 * `/preferences`) — a bill dated on or before this date is in a closed period and QBO refuses any
 * edit to it. `null` when the company has never set one (nothing is closed). */
export async function getBookCloseDate(realmId: string, connectionId: string): Promise<string | null> {
  const result = await apiRequest<{ Preferences?: { AccountingInfoPrefs?: { BookCloseDate?: string } } }>(realmId, connectionId, "/preferences")
  return result.Preferences?.AccountingInfoPrefs?.BookCloseDate ?? null
}

/** The currency the QuickBooks company keeps its books in (`CurrencyPrefs.HomeCurrency` on
 * `/preferences`), as an ISO code. Throws when the provider does not say — a push must never guess. */
export async function getHomeCurrency(realmId: string, connectionId: string): Promise<string> {
  const result = await apiRequest<{ Preferences?: { CurrencyPrefs?: { HomeCurrency?: { value?: string } } } }>(realmId, connectionId, "/preferences")
  const code = result.Preferences?.CurrencyPrefs?.HomeCurrency?.value
  if (!code) throw new Error("ledger_currency_missing")
  return code
}

/** The parts of `/companyinfo` the ledger capabilities read: the plan rides in `NameValue` as
 * `OfferingSku` ("QuickBooks Online Plus"). */
export type QuickBooksCompanyInfo = { NameValue?: Array<{ Name?: string; Value?: string }> }

/** The `/preferences` flags the ledger capabilities read. Any of them may be absent; the caller
 * decides what an absence means (lib/integrations/ledger-capabilities.ts). */
export type QuickBooksPreferences = {
  TaxPrefs?: { UsingSalesTax?: boolean }
  AccountingInfoPrefs?: { ClassTrackingPerTxnLine?: boolean; TrackDepartments?: boolean }
  VendorAndPurchasesPrefs?: { BillableExpenseTracking?: boolean }
}

export async function getCompanyInfo(realmId: string, connectionId: string): Promise<QuickBooksCompanyInfo> {
  const result = await apiRequest<{ CompanyInfo?: QuickBooksCompanyInfo }>(realmId, connectionId, `/companyinfo/${encodeURIComponent(realmId)}`)
  return result.CompanyInfo ?? {}
}

export async function getPreferences(realmId: string, connectionId: string): Promise<QuickBooksPreferences> {
  const result = await apiRequest<{ Preferences?: QuickBooksPreferences }>(realmId, connectionId, "/preferences")
  return result.Preferences ?? {}
}

export type QuickBooksBillCorrectionCheck =
  | { offered: true }
  | { offered: false; reason: "book_closed" | "paid" }

/** Screen 1/Screen 2's pre-check: is this bill's Account still changeable? Conservative per the
 * spec's Engineering questions — a paid QBO bill is refused until sandbox verification proves the
 * payment link survives an account-only resend; a bill dated on/before the books-closed date is
 * refused because QBO itself would reject the write. */
export async function checkQuickBooksBillCorrectable(realmId: string, connectionId: string, billId: string, txnDate: string): Promise<QuickBooksBillCorrectionCheck> {
  const [bookCloseDate, bill] = await Promise.all([
    getBookCloseDate(realmId, connectionId),
    getBillForCorrection(realmId, connectionId, billId),
  ])
  if (bookCloseDate && txnDate <= bookCloseDate) return { offered: false, reason: "book_closed" }
  if (bill.balance <= 0 && bill.totalAmt > 0) return { offered: false, reason: "paid" }
  return { offered: true }
}

/** Resends every current line of a posted bill with `accountRefByLineIndex` swapped in for the
 * corrected lines' `AccountRef.value` — QBO's full-update semantics null out any field omitted
 * from the request, so every line must ride along even though only the account is changing (per
 * the spec's "account only, nothing else" design approach: amounts/descriptions are read back
 * from QBO immediately before the write, never taken from a stale local copy). One stale-token
 * retry: if the write is rejected as a conflicting SyncToken, this re-reads the bill once more and
 * retries with the fresh token before giving up. */
export async function updateBillAccounts(realmId: string, connectionId: string, billId: string, accountRefByLineIndex: Map<number, string>): Promise<void> {
  const attempt = async (): Promise<void> => {
    const bill = await getBillForCorrection(realmId, connectionId, billId)
    const line = bill.lines.map((l, index) => {
      const newAccount = accountRefByLineIndex.get(index)
      if (!newAccount || !l.AccountBasedExpenseLineDetail?.AccountRef) return l
      return { ...l, AccountBasedExpenseLineDetail: { ...l.AccountBasedExpenseLineDetail, AccountRef: { value: newAccount } } }
    })
    await apiRequest(realmId, connectionId, "/bill", {
      method: "POST",
      body: JSON.stringify({ Id: bill.id, SyncToken: bill.syncToken, sparse: false, Line: line }),
    })
  }
  try {
    await attempt()
  } catch (err) {
    // QBO has no distinct "stale SyncToken" status — it comes back as the same http_400 any bad
    // request shape does (lib/nango.ts's classifyHttpStatus drops the body a Fault payload would
    // disambiguate with). Per the spec's Engineering questions, the write path retries once,
    // re-reading the bill fresh, for exactly this shape of failure; an auth failure is never
    // retried — reconnecting is a person's job, not a second identical write.
    if (!(err instanceof IntegrationPermanentError)) throw err
    await attempt()
  }
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
