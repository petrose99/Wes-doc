import { prisma } from "@/lib/db"
import { IntegrationRetryableError } from "@/lib/integrations/errors"
import * as quickbooks from "@/lib/integrations/quickbooks/client"
import type { QuickBooksCompanyInfo, QuickBooksPreferences } from "@/lib/integrations/quickbooks/client"
import * as xero from "@/lib/integrations/xero/client"
import type { XeroTrackingCategory } from "@/lib/integrations/xero/client"
import type { Prisma } from "@/prisma/client"

/** What the connected ledger (its plan and its settings) can take on a bill (ADR 0014): whether it
 * keeps VAT, which Tracking it offers (≤ 2; [] = off), and whether a line can carry a Location,
 * Customer or Billable flag. A held value the ledger can't take fails a blocking Check — so a flag
 * the provider didn't state reads `false` (blocks), never `true` (would drop the value silently). */
export type LedgerCapabilities = {
  vat: boolean
  tracking: { id: string; name: string }[]
  location: boolean
  customer: boolean
  billable: boolean
  itemLines: boolean
}

/** A push reuses a stored read this recent; sync and the 5030 retry always read fresh. */
export const LEDGER_CAPABILITIES_REUSE_MS = 24 * 60 * 60 * 1000

const NONE: LedgerCapabilities = { vat: false, tracking: [], location: false, customer: false, billable: false, itemLines: false }

/** Null when the company does not say its plan or whether VAT is on — never posted to on a guess. */
export function deriveQuickBooksCapabilities(companyInfo: QuickBooksCompanyInfo, preferences: QuickBooksPreferences): LedgerCapabilities | null {
  const sku = companyInfo.NameValue?.find((entry) => entry.Name === "OfferingSku")?.Value
  const vat = preferences.TaxPrefs?.UsingSalesTax
  if (!sku || typeof vat !== "boolean") return null
  const plus = /\b(Plus|Advanced)\b/i.test(sku)
  return {
    vat,
    tracking: plus && preferences.AccountingInfoPrefs?.ClassTrackingPerTxnLine === true ? [{ id: "class", name: "Class" }] : [],
    location: plus && preferences.AccountingInfoPrefs?.TrackDepartments === true,
    customer: true,
    billable: plus && preferences.VendorAndPurchasesPrefs?.BillableExpenseTracking === true,
    itemLines: plus,
  }
}

export function deriveXeroCapabilities(trackingCategories: XeroTrackingCategory[]): LedgerCapabilities {
  const tracking = trackingCategories.filter((c) => c.status === "ACTIVE").slice(0, 2).map((c) => ({ id: c.id, name: c.name }))
  return { ...NONE, vat: true, tracking, itemLines: true }
}

/** The stored JSON back as capabilities; anything that isn't exactly that shape is null. */
export function parseLedgerCapabilities(json: unknown): LedgerCapabilities | null {
  if (!json || typeof json !== "object") return null
  const value = json as Record<string, unknown>
  const flags = ["vat", "location", "customer", "billable", "itemLines"] as const
  if (!flags.every((key) => typeof value[key] === "boolean")) return null
  if (!Array.isArray(value.tracking) || !value.tracking.every((t) => t && typeof t.id === "string" && typeof t.name === "string")) return null
  return {
    vat: value.vat as boolean,
    tracking: (value.tracking as { id: string; name: string }[]).map((t) => ({ id: t.id, name: t.name })),
    location: value.location as boolean,
    customer: value.customer as boolean,
    billable: value.billable as boolean,
    itemLines: value.itemLines as boolean,
  }
}

type LedgerConnection = {
  id: string
  workspaceId: string
  provider: string
  externalTenantId: string | null
  ledgerCapabilities?: Prisma.JsonValue | null
  ledgerCapabilitiesReadAt?: Date | null
}

async function fetchCapabilities(provider: string, tenantId: string, connectionId: string): Promise<LedgerCapabilities | null> {
  if (provider === "quickbooks") {
    const [companyInfo, preferences] = await Promise.all([quickbooks.getCompanyInfo(tenantId, connectionId), quickbooks.getPreferences(tenantId, connectionId)])
    return deriveQuickBooksCapabilities(companyInfo, preferences)
  }
  return deriveXeroCapabilities(await xero.listTrackingCategories(tenantId, connectionId))
}

/** The ledger's capabilities, read from the provider and stored on the connection; a stored read no
 * older than `reuseMs` is returned as is. Unlike the currency read this throws: a ledger whose VAT
 * setting can't be read is never posted to, so the push retries rather than guessing. */
export async function readLedgerCapabilities(connection: LedgerConnection, now = new Date(), reuseMs = 0): Promise<LedgerCapabilities> {
  // Sage is connect-only: nothing posts to it, so it can take nothing.
  if (connection.provider !== "quickbooks" && connection.provider !== "xero") return NONE
  const stored = parseLedgerCapabilities(connection.ledgerCapabilities)
  const readAt = connection.ledgerCapabilitiesReadAt
  if (reuseMs > 0 && stored && readAt && now.getTime() - readAt.getTime() <= reuseMs) return stored
  if (!connection.externalTenantId) throw new IntegrationRetryableError("ledger_capabilities_unreadable")
  const capabilities = await fetchCapabilities(connection.provider, connection.externalTenantId, connection.id)
  if (!capabilities) throw new IntegrationRetryableError("ledger_capabilities_unreadable")
  await prisma.integrationConnection.updateMany({
    where: { id: connection.id, workspaceId: connection.workspaceId },
    data: { ledgerCapabilities: capabilities, ledgerCapabilitiesReadAt: now },
  })
  return capabilities
}
