import { createHmac, timingSafeEqual } from "crypto"
import config from "@/lib/config"
import { classifyHttpStatus } from "@/lib/integrations/errors"

/** ADR 0005: Nango owns the OAuth app and every provider token for QuickBooks, Xero and Sage — this
 * is the only module in DocuBite that talks to Nango's API. No row lock, no refresh scheduling:
 * Nango serializes refreshes on its own side, so a proxy call either succeeds with a live token or
 * fails with an ordinary HTTP status, same as any other outbound fetch. */

const REQUEST_TIMEOUT_MS = 15_000

function authHeader(): string {
  return `Bearer ${config.integrations.nango.secretKey}`
}

/** Mints a Nango Connect session token scoped to exactly one `providerConfigKey`, for the
 * connect-session route to hand to the frontend `nango.auth()` call. `endUserId` is DocuBite's own
 * (workspaceId, so a session cannot be reused across workspaces); Nango returns the browser-facing
 * `token` plus its own expiry — DocuBite does not need to track expiry itself, an expired token
 * simply fails the frontend handshake. */
export async function createConnectSession(params: {
  endUserId: string
  providerConfigKey: string
}): Promise<{ token: string; expiresAt: string }> {
  const response = await fetch(`${config.integrations.nango.host}/connect/sessions`, {
    method: "POST",
    headers: { authorization: authHeader(), "content-type": "application/json" },
    body: JSON.stringify({
      end_user: { id: params.endUserId },
      allowed_integrations: [params.providerConfigKey],
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!response.ok) throw classifyHttpStatus(response.status)
  const json = (await response.json()) as { data: { token: string; expires_at: string } }
  return { token: json.data.token, expiresAt: json.data.expires_at }
}

/** Reads back the fields DocuBite writes to `externalTenantId`/`tenantName` itself (ADR 0005):
 * QuickBooks' `realmId`, Xero's chosen `tenantId`, both surfaced via Nango's `connection_config`
 * after the `AUTH` webhook fires. Sage has no such field — its client calls `GET /businesses`
 * through the proxy instead; this helper is not used for Sage. */
export async function getConnectionConfig(connectionId: string, providerConfigKey: string): Promise<Record<string, unknown>> {
  const url = `${config.integrations.nango.host}/connection/${encodeURIComponent(connectionId)}?provider_config_key=${encodeURIComponent(providerConfigKey)}`
  const response = await fetch(url, {
    headers: { authorization: authHeader() },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!response.ok) throw classifyHttpStatus(response.status)
  const json = (await response.json()) as { connection_config?: Record<string, unknown> }
  return json.connection_config ?? {}
}

/** Deletes the connection at Nango (best-effort revocation of the provider grant, per #379's open
 * item — Nango's docs do not confirm every provider revokes on delete). The local row's own
 * deletion is the caller's responsibility (models/integrations.ts), same request-shaped intent as
 * today's disconnect action, just aimed at Nango instead of at nothing. */
export async function deleteConnection(connectionId: string, providerConfigKey: string): Promise<void> {
  const url = `${config.integrations.nango.host}/connection/${encodeURIComponent(connectionId)}?provider_config_key=${encodeURIComponent(providerConfigKey)}`
  const response = await fetch(url, {
    method: "DELETE",
    headers: { authorization: authHeader() },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!response.ok && response.status !== 404) throw classifyHttpStatus(response.status)
}

/** Calls a provider's API through Nango's proxy, `connectionId` + `providerConfigKey` standing in
 * for a bearer token — Nango attaches the live access token server-side and refreshes it
 * transparently. `path` is the provider-API-relative path exactly as today's direct fetch calls
 * built it (e.g. QuickBooks' `/v3/company/{realmId}/query?...`); Nango forwards it unmodified past
 * `/proxy`. Throws the same classified errors as a direct fetch would (401/403 →
 * IntegrationAuthError, etc.) — callers do not need to know they are going through a proxy. A
 * provider whose error body changes the verdict (QuickBooks' Fault codes) passes its own `classify`. */
export async function nangoProxy<T>(
  connectionId: string, providerConfigKey: string, path: string, init?: RequestInit,
  classify: (status: number, body: string) => Error = classifyHttpStatus,
): Promise<T> {
  const response = await fetch(`${config.integrations.nango.host}/proxy${path}`, {
    ...init,
    headers: {
      authorization: authHeader(),
      "connection-id": connectionId,
      "provider-config-key": providerConfigKey,
      accept: "application/json",
      "content-type": "application/json",
      ...(init?.headers || {}),
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!response.ok) throw classify(response.status, await response.text().catch(() => ""))
  return (await response.json()) as T
}

/** Verifies the `X-Nango-Signature` header Nango sends on every webhook delivery: a plain
 * SHA-256 HMAC (hex) of the raw request body under `NANGO_WEBHOOK_SECRET` — no timestamp field, so
 * unlike lib/webhook-signature.ts's outbound scheme there is no independent replay window here;
 * Nango's own webhook `id`/dedupe on the payload is what makes redelivery idempotent instead. */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader || !config.integrations.nango.webhookSecret) return false
  const expected = createHmac("sha256", config.integrations.nango.webhookSecret).update(rawBody).digest("hex")
  if (signatureHeader.length !== expected.length) return false
  try {
    return timingSafeEqual(Buffer.from(signatureHeader, "hex"), Buffer.from(expected, "hex"))
  } catch {
    return false
  }
}
