import { nangoProxy } from "@/lib/nango"
import { XERO_API_BASE } from "@/lib/integrations/xero/config"
import { IntegrationPermanentError } from "@/lib/integrations/errors"

/** Thin wrappers around the Xero Accounting API, called through Nango's proxy (ADR 0005: Nango
 * owns the OAuth app, token refresh, and tenant discovery — `getConnectionConfig` in lib/nango.ts
 * reads back the connected `tenantId` after the Nango `AUTH` webhook fires, replacing this file's
 * old fetchConnections). No SDK, same rationale as lib/integrations/quickbooks/client.ts. Every
 * function throws rather than returning an error union. */

const PROVIDER_CONFIG_KEY = "xero"

async function apiRequest<T>(tenantId: string, connectionId: string, path: string, init?: RequestInit): Promise<T> {
  return nangoProxy<T>(connectionId, PROVIDER_CONFIG_KEY, `${XERO_API_BASE}${path}`, {
    ...init,
    headers: { "xero-tenant-id": tenantId, ...(init?.headers || {}) },
  })
}

export type XeroAccount = { code: string; name: string }

/** Lists expense accounts (Class = "EXPENSE") for the settings UI's default-account picker. */
export async function listExpenseAccounts(tenantId: string, connectionId: string): Promise<XeroAccount[]> {
  const result = await apiRequest<{ Accounts?: Array<{ Code: string; Name: string }> }>(
    tenantId, connectionId, `/Accounts?where=${encodeURIComponent('Class=="EXPENSE"')}`
  )
  return (result.Accounts ?? []).map((a) => ({ code: a.Code, name: a.Name }))
}

export type XeroSyncedAccount = { code: string; name: string; active: boolean; accountClass: string; taxType: string | null }
export type XeroSyncedContact = { id: string; name: string; active: boolean }
/** `taxType` is the rate's stable key — what a bill line's TaxType is set from. */
export type XeroSyncedTaxRate = { taxType: string; name: string; percent: number; canApplyToExpenses: boolean; active: boolean }

/** All accounts (any class, any status) for WP1.5's chart-of-accounts sync — Xero has no
 * server-side pagination for /Accounts (unlike /Contacts), so this is a single request.
 * `accountClass` rides along so #429's Default-account guess can tell an EXPENSE account from any
 * other kind without a second round-trip. */
export async function listAccounts(tenantId: string, connectionId: string): Promise<XeroSyncedAccount[]> {
  const result = await apiRequest<{ Accounts?: Array<{ Code?: string; Name: string; Status: string; Class: string; TaxType?: string }> }>(tenantId, connectionId, "/Accounts")
  return (result.Accounts ?? []).filter((a) => a.Code).map((a) => ({ code: a.Code as string, name: a.Name, active: a.Status === "ACTIVE", accountClass: a.Class, taxType: a.TaxType ?? null }))
}

/** Every contact flagged as a supplier. /Contacts pages at 100 rows via the `page` query param;
 * a page shorter than the page size is Xero's own end-of-results signal for this endpoint. */
const CONTACTS_PAGE_SIZE = 100

export async function listContacts(tenantId: string, connectionId: string): Promise<XeroSyncedContact[]> {
  const contacts: XeroSyncedContact[] = []
  for (let page = 1; ; page++) {
    const result = await apiRequest<{ Contacts?: Array<{ ContactID: string; Name: string; ContactStatus: string }> }>(
      tenantId, connectionId, `/Contacts?where=${encodeURIComponent("IsSupplier==true")}&page=${page}`
    )
    const rows = result.Contacts ?? []
    contacts.push(...rows.map((row) => ({ id: row.ContactID, name: row.Name, active: row.ContactStatus === "ACTIVE" })))
    if (rows.length < CONTACTS_PAGE_SIZE) return contacts
  }
}

export async function listTaxRates(tenantId: string, connectionId: string): Promise<XeroSyncedTaxRate[]> {
  const result = await apiRequest<{ TaxRates?: Array<{ Name: string; TaxType: string; Status: string; EffectiveRate?: number; CanApplyToExpenses?: boolean }> }>(tenantId, connectionId, "/TaxRates")
  return (result.TaxRates ?? []).map((rate) => ({ taxType: rate.TaxType, name: rate.Name, percent: rate.EffectiveRate ?? 0, canApplyToExpenses: rate.CanApplyToExpenses === true, active: rate.Status === "ACTIVE" }))
}

/** Finds a contact by exact Name, or creates one. No fuzzy dedup, per scope. */
export async function findOrCreateContact(tenantId: string, connectionId: string, name: string): Promise<string> {
  const found = await apiRequest<{ Contacts?: Array<{ ContactID: string }> }>(
    tenantId, connectionId, `/Contacts?where=${encodeURIComponent(`Name=="${name.replace(/"/g, '\\"')}"`)}`
  )
  const existing = found.Contacts?.[0]
  if (existing) return existing.ContactID
  const created = await apiRequest<{ Contacts: Array<{ ContactID: string }> }>(tenantId, connectionId, "/Contacts", {
    method: "PUT",
    body: JSON.stringify({ Contacts: [{ Name: name }] }),
  })
  return created.Contacts[0].ContactID
}

/** WP2.4: true when an ACCPAY invoice with this exact InvoiceNumber already exists at Xero —
 * the ledger-side duplicate guard checked in lib/integration-push.ts before every push. */
export async function findBillByInvoiceNumber(tenantId: string, connectionId: string, invoiceNumber: string): Promise<boolean> {
  const escaped = invoiceNumber.replace(/"/g, '\\"')
  const where = `Type=="ACCPAY" AND InvoiceNumber=="${escaped}"`
  const result = await apiRequest<{ Invoices?: Array<{ InvoiceID: string }> }>(tenantId, connectionId, `/Invoices?where=${encodeURIComponent(where)}`)
  return Boolean(result.Invoices?.length)
}

/** Creates the bill (an ACCPAY invoice). `body` is the exact shape from
 * lib/integrations/xero/bill-mapper.ts. */
export async function createBill(tenantId: string, connectionId: string, body: unknown, idempotencyKey?: string | null): Promise<{ id: string }> {
  const created = await apiRequest<{ Invoices: Array<{ InvoiceID: string }> }>(tenantId, connectionId, "/Invoices", {
    method: "POST",
    body: JSON.stringify(body),
    // A7.2: Xero dedupes on this for 24h — a retry after a timeout can't double-create the bill.
    ...(idempotencyKey ? { headers: { "Idempotency-Key": idempotencyKey } } : {}),
  })
  return { id: created.Invoices[0].InvoiceID }
}

/** Voids a bill (an ACCPAY invoice) — Xero has no separate delete endpoint for invoices, only a
 * status transition: `POST Invoices/{id}` with `{ Status: "VOIDED" }` in the body, same
 * authenticated-request shape createBill uses. Throws exactly like createBill on any non-2xx
 * response (apiRequest's own error handling). A real, irreversible write against whatever tenant
 * tenantId points at — callers must treat it with the same care as createBill. */
export async function voidBill(tenantId: string, connectionId: string, invoiceId: string): Promise<void> {
  await apiRequest(tenantId, connectionId, `/Invoices/${invoiceId}`, {
    method: "POST",
    body: JSON.stringify({ Status: "VOIDED" }),
  })
}

// ---- #430: correcting posted bills' Accounts -----------------------------------------------

/** Xero's org-wide period lock dates: `PeriodLockDate` (general ledger lock, any role) and
 * `EndOfYearLockDate` (year-end lock, advisor-only override) from `/Organisation`. A bill dated on
 * or before whichever is later and set is in a locked period and Xero refuses any edit to it. */
export async function getOrganisationLockDates(tenantId: string, connectionId: string): Promise<{ periodLockDate: string | null; endOfYearLockDate: string | null }> {
  const result = await apiRequest<{ Organisations?: Array<{ PeriodLockDate?: string; EndOfYearLockDate?: string }> }>(tenantId, connectionId, "/Organisation")
  const org = result.Organisations?.[0]
  return { periodLockDate: org?.PeriodLockDate ?? null, endOfYearLockDate: org?.EndOfYearLockDate ?? null }
}

/** The currency the Xero organisation keeps its books in (`BaseCurrency` on `/Organisation`), as
 * an ISO code. Throws when the provider does not say — a push must never guess. */
export async function getBaseCurrency(tenantId: string, connectionId: string): Promise<string> {
  const result = await apiRequest<{ Organisations?: Array<{ BaseCurrency?: string }> }>(tenantId, connectionId, "/Organisation")
  const code = result.Organisations?.[0]?.BaseCurrency
  if (!code) throw new Error("ledger_currency_missing")
  return code
}

export type XeroTrackingCategory = { id: string; name: string; status: string; options: Array<{ id: string; name: string; status: string }> }

/** Every tracking category with its options, archived ones included, in Xero's own order — the
 * ledger capabilities keep the first two ACTIVE ones (Xero allows two on a line). */
export async function listTrackingCategories(tenantId: string, connectionId: string): Promise<XeroTrackingCategory[]> {
  type Wire = { TrackingCategoryID: string; Name: string; Status: string; Options?: Array<{ TrackingOptionID: string; Name: string; Status: string }> }
  const result = await apiRequest<{ TrackingCategories?: Wire[] }>(tenantId, connectionId, "/TrackingCategories?includeArchived=true")
  return (result.TrackingCategories ?? []).map((c) => ({
    id: c.TrackingCategoryID,
    name: c.Name,
    status: c.Status,
    options: (c.Options ?? []).map((o) => ({ id: o.TrackingOptionID, name: o.Name, status: o.Status })),
  }))
}

/** The full invoice row this correction path needs: Status/AmountPaid to tell paid from unpaid,
 * and the current LineItems so the update can resend every line unchanged except the AccountCode
 * the caller is correcting (Xero deletes any line omitted from an update, per the spec's design
 * approach — every line must ride along). */
async function getInvoiceForCorrection(tenantId: string, connectionId: string, invoiceId: string): Promise<{ id: string; status: string; amountPaid: number; total: number; lineItems: XeroLineItem[] }> {
  const result = await apiRequest<{ Invoices?: Array<{ InvoiceID: string; Status: string; AmountPaid?: number; Total?: number; LineItems?: XeroLineItem[] }> }>(tenantId, connectionId, `/Invoices/${invoiceId}`)
  const invoice = result.Invoices?.[0]
  if (!invoice) throw new IntegrationPermanentError("bill_not_found")
  return { id: invoice.InvoiceID, status: invoice.Status, amountPaid: invoice.AmountPaid ?? 0, total: invoice.Total ?? 0, lineItems: invoice.LineItems ?? [] }
}

export type XeroBillCorrectionCheck =
  | { offered: true }
  | { offered: false; reason: "period_locked" | "voided" }

/** Screen 1/Screen 2's pre-check: is this bill's AccountCode still changeable? Per the spec's
 * design approach, Xero offers the correction on paid bills too (AccountCode is on Xero's
 * editable-on-paid field list) — only a locked period or an already-voided invoice refuses it. */
export async function checkXeroBillCorrectable(tenantId: string, connectionId: string, invoiceId: string, txnDate: string): Promise<XeroBillCorrectionCheck> {
  const [lockDates, invoice] = await Promise.all([
    getOrganisationLockDates(tenantId, connectionId),
    getInvoiceForCorrection(tenantId, connectionId, invoiceId),
  ])
  const lockedThrough = [lockDates.periodLockDate, lockDates.endOfYearLockDate].filter((d): d is string => Boolean(d)).sort().pop() ?? null
  if (lockedThrough && txnDate <= lockedThrough) return { offered: false, reason: "period_locked" }
  if (invoice.status === "VOIDED" || invoice.status === "DELETED") return { offered: false, reason: "voided" }
  return { offered: true }
}

/** Resends every current line of a posted bill with `accountCodeByLineIndex` swapped in for the
 * corrected lines' `AccountCode` — Xero's update semantics delete any line omitted from the
 * request, so every line must ride along even though only the account is changing. No SyncToken
 * equivalent for Xero (per the spec's Engineering questions), so the one retry re-reads the
 * invoice's current line set and resends it rather than comparing a version stamp. */
export async function updateBillAccounts(tenantId: string, connectionId: string, invoiceId: string, accountCodeByLineIndex: Map<number, string>): Promise<void> {
  const attempt = async (): Promise<void> => {
    const invoice = await getInvoiceForCorrection(tenantId, connectionId, invoiceId)
    const lineItems = invoice.lineItems.map((item, index) => {
      const newAccountCode = accountCodeByLineIndex.get(index)
      return newAccountCode ? { ...item, AccountCode: newAccountCode } : item
    })
    await apiRequest(tenantId, connectionId, `/Invoices/${invoiceId}`, {
      method: "POST",
      body: JSON.stringify({ LineItems: lineItems }),
    })
  }
  try {
    await attempt()
  } catch (err) {
    // Same rationale as the QuickBooks client: a permanent (400-shaped) failure is retried once
    // against a freshly re-read line set; an auth failure is never retried.
    if (!(err instanceof IntegrationPermanentError)) throw err
    await attempt()
  }
}

// ---- Phase B: ledger sync ----------------------------------------------------------------------

export type XeroLedgerTransaction = {
  id: string
  docNumber: string | null
  txnDate: string | null
  total: number | null
  currencyCode: string | null
  contactId: string | null
  contactName: string | null
  /** The first line item's account code — an invoice/bank transaction can have several lines
   * against several accounts; the first is taken as this transaction's representative account,
   * same simplification the QuickBooks ledger-sync function makes. */
  accountCode: string | null
}

type XeroLineItem = { AccountCode?: string }

function firstLineAccountCode(lineItems: XeroLineItem[] | undefined): string | null {
  return lineItems?.find((item) => item.AccountCode)?.AccountCode ?? null
}

/** ACCPAY invoices (vendor bills) for Phase B's ledger sync — Xero has no separate "Bill" entity,
 * an ACCPAY Invoice IS a bill, same distinction lib/integrations/xero/bill-mapper.ts already
 * relies on for the write path. Paginated the same way listContacts is. */
export async function listBills(tenantId: string, connectionId: string): Promise<XeroLedgerTransaction[]> {
  type Row = { InvoiceID: string; InvoiceNumber?: string; Date?: string; Total?: number; CurrencyCode?: string; Contact?: { ContactID: string; Name?: string }; LineItems?: XeroLineItem[] }
  const invoices: XeroLedgerTransaction[] = []
  for (let page = 1; ; page++) {
    const result = await apiRequest<{ Invoices?: Row[] }>(tenantId, connectionId, `/Invoices?where=${encodeURIComponent('Type=="ACCPAY"')}&page=${page}`)
    const rows = result.Invoices ?? []
    invoices.push(...rows.map((row): XeroLedgerTransaction => ({
      id: row.InvoiceID, docNumber: row.InvoiceNumber ?? null, txnDate: row.Date ?? null,
      total: row.Total ?? null, currencyCode: row.CurrencyCode ?? null,
      contactId: row.Contact?.ContactID ?? null, contactName: row.Contact?.Name ?? null,
      accountCode: firstLineAccountCode(row.LineItems),
    })))
    if (rows.length < CONTACTS_PAGE_SIZE) return invoices
  }
}

/** Bank transactions (SPEND type — money going out through a bank account, not routed through
 * the AP bill workflow) for Phase B's ledger sync. Xero has no separate "Expense" entity distinct
 * from a bill or a bank transaction, so no listExpenses is implemented for this provider — see
 * lib/health/sync.ts. Paginated the same way /Contacts is (Xero has no server-side pagination for
 * plain /Accounts, but both /Contacts and /BankTransactions do page). */
const BANK_TRANSACTIONS_PAGE_SIZE = 100

export async function listBankTransactions(tenantId: string, connectionId: string): Promise<XeroLedgerTransaction[]> {
  type Row = { BankTransactionID: string; Reference?: string; Date?: string; Total?: number; CurrencyCode?: string; Contact?: { ContactID: string; Name?: string }; LineItems?: XeroLineItem[] }
  const transactions: XeroLedgerTransaction[] = []
  for (let page = 1; ; page++) {
    const result = await apiRequest<{ BankTransactions?: Row[] }>(tenantId, connectionId, `/BankTransactions?where=${encodeURIComponent('Type=="SPEND"')}&page=${page}`)
    const rows = result.BankTransactions ?? []
    transactions.push(...rows.map((row): XeroLedgerTransaction => ({
      id: row.BankTransactionID, docNumber: row.Reference ?? null, txnDate: row.Date ?? null,
      total: row.Total ?? null, currencyCode: row.CurrencyCode ?? null,
      contactId: row.Contact?.ContactID ?? null, contactName: row.Contact?.Name ?? null,
      accountCode: firstLineAccountCode(row.LineItems),
    })))
    if (rows.length < BANK_TRANSACTIONS_PAGE_SIZE) return transactions
  }
}
