import { nangoProxy } from "@/lib/nango"
import { SAGE_API_BASE } from "@/lib/integrations/sage/config"

/** Thin wrapper around the Sage Business Cloud Accounting API, called through Nango's proxy (ADR
 * 0005, scopes/hosts researched in #378). Unlike QuickBooks/Xero, Sage's OAuth grant is not scoped
 * to one business up front — a token can span several — so the only client function this step adds
 * is `listBusinesses`, the `GET /businesses` pick DocuBite's own connect flow (step 4/#383) needs to
 * learn which business id to store as `externalTenantId`, same role QuickBooks' realmId and Xero's
 * tenantId play. The read/write entity surface (contacts, ledger accounts, tax rates, purchase
 * invoices, attachments — endpoints recorded on #378) is deliberately not built here: #384 (Sage
 * bill mapping) fixes the exact field shapes against Sage's v3.1 API before a client commits to
 * them, the same order QuickBooks/Xero followed (their bill-mapper.ts shaped their client
 * functions, not the reverse). */

const PROVIDER_CONFIG_KEY = "sage"

async function apiRequest<T>(connectionId: string, path: string, init?: RequestInit): Promise<T> {
  return nangoProxy<T>(connectionId, PROVIDER_CONFIG_KEY, `${SAGE_API_BASE}${path}`, init)
}

export type SageBusiness = { id: string; name: string }

/** `GET /businesses` — the one-time pick a Sage connect flow makes right after auth, before any
 * other call can be scoped to a business id. */
export async function listBusinesses(connectionId: string): Promise<SageBusiness[]> {
  const result = await apiRequest<{ $items?: Array<{ id: string; business_name?: string; displayed_as?: string }> }>(connectionId, "/businesses")
  return (result.$items ?? []).map((b) => ({ id: b.id, name: b.business_name ?? b.displayed_as ?? b.id }))
}
