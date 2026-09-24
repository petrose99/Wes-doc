/** Xero OAuth + API endpoints. ADR 0005: Nango owns the OAuth app now, so AUTHORIZE/TOKEN/
 * CONNECTIONS below are dead once step 4 deletes the old connect/callback routes that used them;
 * XERO_API_BASE stays, it's the accounting API host the proxy forwards onto. */

export const XERO_AUTHORIZE_URL = "https://login.xero.com/identity/connect/authorize"
export const XERO_TOKEN_URL = "https://identity.xero.com/connect/token"
export const XERO_CONNECTIONS_URL = "https://api.xero.com/connections"
export const XERO_API_BASE = "https://api.xero.com/api.xro/2.0"
export const XERO_SCOPES = "offline_access accounting.transactions accounting.contacts accounting.settings"
