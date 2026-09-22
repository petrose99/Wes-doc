/** ADR 0005: Nango owns the OAuth app and resolves sandbox vs. production from the integration's
 * own dashboard config, so DocuBite no longer picks a host — `nangoProxy` (lib/nango.ts) forwards
 * this path past its own `/proxy` prefix onto whichever QuickBooks host the connection points at. */
export function quickbooksCompanyBase(realmId: string): string {
  return `/v3/company/${realmId}`
}
