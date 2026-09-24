import config from "@/lib/config"
import { getConnectionConfig, verifyWebhookSignature } from "@/lib/nango"
import { sendReminderEmail } from "@/lib/email"
import { createIntegrationConnectionFromNango, markIntegrationConnectionNeedsReconnect } from "@/models/integrations"
import { resolveOwnerRecipients } from "@/models/reminders"
import { syncAccountingEntities } from "@/lib/integrations/sync"

/** ADR 0005 step 3: the one authoritative signal for a connection's `connected`/`needs_reconnect`
 * state — DocuBite never marks itself connected off the frontend's resolved promise (#379). Nango
 * subscribes only the `auth` webhook type for this integration (no sync/proxy webhooks configured
 * at the provider setup, per the ADR's "Routes" note), so any other `type` is acknowledged and
 * ignored rather than treated as a signature failure. */

type NangoAuthWebhookPayload = {
  type: string
  operation?: "creation" | "refresh" | "override"
  connectionId?: string
  providerConfigKey?: string
  provider?: string
  success?: boolean
  endUser?: { endUserId?: string }
  error?: { type?: string; description?: string }
}

const KNOWN_PROVIDERS = new Set(["quickbooks", "xero", "sage"])

function isKnownProvider(value: string | undefined): value is "quickbooks" | "xero" | "sage" {
  return Boolean(value) && KNOWN_PROVIDERS.has(value as string)
}

/** QuickBooks' `realmId`/Xero's chosen `tenantId` live in Nango's `connection_config`, read back
 * once here rather than trusted off the webhook body itself (Nango does not include them on the
 * `auth` event) — Sage has no such field (ADR 0005), so this returns nulls for it and the connect
 * flow's own `GET /businesses` pick (step 4/#383) fills `externalTenantId` in later. */
async function resolveTenant(connectionId: string, providerConfigKey: string): Promise<{ externalTenantId: string | null; tenantName: string | null }> {
  if (providerConfigKey === "sage") return { externalTenantId: null, tenantName: null }
  const connectionConfig = await getConnectionConfig(connectionId, providerConfigKey)
  const realmId = typeof connectionConfig.realmId === "string" ? connectionConfig.realmId : null
  const tenantId = typeof connectionConfig.tenantId === "string" ? connectionConfig.tenantId : null
  const tenantName = typeof connectionConfig.tenantName === "string" ? connectionConfig.tenantName : null
  return { externalTenantId: realmId ?? tenantId, tenantName }
}

/** Owner email, once per break (ADR 0005's "Owners are told once", CONTEXT.md) — suppressed here by
 * `markIntegrationConnectionNeedsReconnect`'s `isNewBreak` flag, which is false on a redelivery of a
 * webhook for a connection that is already `needs_reconnect`, keeping this handler idempotent. */
async function notifyOwnersOfBreak(workspaceId: string): Promise<void> {
  const recipients = await resolveOwnerRecipients(workspaceId)
  if (!recipients.length) return
  const actionUrl = `${config.app.baseURL}/workspaces/${workspaceId}/admin/integrations`
  await Promise.all(recipients.map((to) => sendReminderEmail({
    to,
    subject: "Your ledger connection needs reconnecting",
    heading: "A ledger connection needs your attention",
    body: "DocuBite lost access to your accounting connection and paused sending bills until it's reconnected.",
    actionUrl,
    actionLabel: "Reconnect it",
  })))
}

export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text()
  const signature = request.headers.get("x-nango-signature")
  if (!verifyWebhookSignature(rawBody, signature)) return new Response("forbidden", { status: 403 })

  let payload: NangoAuthWebhookPayload
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return new Response("bad_request", { status: 400 })
  }

  if (payload.type !== "auth") return new Response("ignored", { status: 200 })
  const { connectionId, providerConfigKey, operation, success } = payload
  if (!connectionId || !isKnownProvider(providerConfigKey) || !operation) return new Response("bad_request", { status: 400 })

  if (success === false) {
    const result = await markIntegrationConnectionNeedsReconnect(connectionId)
    if (result?.isNewBreak) await notifyOwnersOfBreak(result.workspaceId)
    return new Response("ok", { status: 200 })
  }

  if (operation === "creation") {
    const workspaceId = payload.endUser?.endUserId
    if (!workspaceId) return new Response("bad_request", { status: 400 })
    const { externalTenantId, tenantName } = await resolveTenant(connectionId, providerConfigKey)
    await createIntegrationConnectionFromNango({
      connectionId,
      workspaceId,
      provider: providerConfigKey,
      providerConfigKey,
      externalTenantId,
      tenantName,
      createdById: null,
    })
    // #429: chart sync (and the Default-account guess it drives) right after Nango reports
    // success — Sage has no tenant yet at this point (ADR 0005), so its sync happens off
    // confirmSageBusinessAction instead, once a business is chosen. A sync failure here must not
    // fail the webhook: the connection is still validly created, and the Default row's surface
    // shows the retry state (spec "Backend changes" point 1) rather than the webhook 500ing and
    // Nango redelivering a creation that already happened.
    if (externalTenantId) {
      try {
        await syncAccountingEntities(connectionId)
      } catch {
        // left for the Default row's retry state; nothing else to do with a webhook response.
      }
    }
    return new Response("ok", { status: 200 })
  }

  // A successful `refresh`/`override` on an already-connected row needs no write — `connected` is
  // already its status, and re-reading `connection_config` on every silent token refresh would be
  // pure waste for a tenant id that does not change after creation.
  return new Response("ok", { status: 200 })
}
