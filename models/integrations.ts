import { randomBytes, randomUUID } from "crypto"
import { prisma } from "@/lib/db"
import type { Prisma } from "@/prisma/client"
import { generateApiKey } from "@/lib/api-key"
import { encryptSecret } from "@/lib/secret-crypto"
import { assertUrlSafe } from "@/lib/url-safety"
import { isWebhookEventType } from "@/lib/webhooks"
import { getDocumentFieldValues } from "@/models/document-field-values"
import { stageToStatusFilter, type PipelineStage } from "@/lib/documents/stages"
import { enqueueAttachmentForPush, kickIntegrationAttachDrain } from "@/lib/integration-attach"

/** There is no plan tier gating the integrations surface anymore — every workspace has it,
 * subject only to the deployment-level gate (config.integrations.enabled). */
export async function workspaceIntegrationsPlanEnabled(_workspaceId: string): Promise<boolean> {
  return true
}

/** The data layer for the integrations surface (P1): API keys, webhook endpoints, delivery history,
 * and the API-shaped document reads that /api/v1 serves. Every query is workspace-scoped. Secrets are
 * generated and sealed here (crypto lives in lib/); the plaintext is returned exactly once, to the
 * caller that created it, and never persisted. */

// --- API keys ---

/** Never selects keyHash — it is write-only. keyPrefix is the safe display label. */
export async function listWorkspaceApiKeys(workspaceId: string) {
  return prisma.workspaceApiKey.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, keyPrefix: true, lastUsedAt: true, revokedAt: true, createdAt: true },
  })
}

export async function createWorkspaceApiKey(workspaceId: string, input: { name: string; createdById: string }) {
  const key = generateApiKey()
  const record = await prisma.workspaceApiKey.create({
    data: { workspaceId, name: input.name.trim() || "API key", keyHash: key.keyHash, keyPrefix: key.keyPrefix, createdById: input.createdById },
    select: { id: true, name: true, keyPrefix: true, createdAt: true },
  })
  // The one and only time the plaintext exists outside the caller's request.
  return { plaintext: key.plaintext, record }
}

export async function revokeWorkspaceApiKey(workspaceId: string, keyId: string) {
  const res = await prisma.workspaceApiKey.updateMany({ where: { id: keyId, workspaceId, revokedAt: null }, data: { revokedAt: new Date() } })
  if (!res.count) throw new Error("api_key_not_found")
}

// --- Webhook endpoints ---

function generateWebhookSecret(): string {
  return "whsec_" + randomBytes(24).toString("base64url")
}

export async function listWorkspaceWebhookEndpoints(workspaceId: string) {
  return prisma.webhookEndpoint.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    select: { id: true, url: true, events: true, status: true, failureCount: true, createdAt: true },
  })
}

export async function createWorkspaceWebhookEndpoint(workspaceId: string, input: { url: string; events?: string[]; createdById?: string }) {
  // Validated here so registration fails fast on an unsafe or unreachable URL — checked AGAIN at
  // delivery time (DNS can change). Throws UnsafeUrlError, surfaced to the caller as an error code.
  await assertUrlSafe(input.url)
  const events = input.events ?? []
  const cleanEvents = events.filter(isWebhookEventType)
  if (events.length !== cleanEvents.length) throw new Error("invalid_event_type")
  const secret = generateWebhookSecret()
  const endpoint = await prisma.webhookEndpoint.create({
    // createdById omitted (null) for API-key-created endpoints; the settings UI passes the user.
    data: { workspaceId, url: input.url, events: cleanEvents, secretEnc: encryptSecret(secret), createdById: input.createdById || null },
    select: { id: true, url: true, events: true, status: true, createdAt: true },
  })
  return { secret, endpoint }
}

/** A9.7: rotate one endpoint's signing secret without breaking in-flight receivers. Generates a
 * fresh secret, moves the current secret into `previousSecretEnc`, stamps the rotation time so
 * a scheduled job can auto-expire ancient dual-active windows, and returns the plaintext once
 * for the settings UI to reveal. During the window, buildSignatureHeader stacks both signatures
 * into the outbound header — see lib/webhook-delivery.ts. */
export async function rotateWorkspaceWebhookEndpointSecret(workspaceId: string, endpointId: string) {
  const existing = await prisma.webhookEndpoint.findFirst({ where: { id: endpointId, workspaceId }, select: { secretEnc: true } })
  if (!existing) throw new Error("webhook_endpoint_not_found")
  const secret = generateWebhookSecret()
  await prisma.webhookEndpoint.update({
    where: { id: endpointId },
    data: { secretEnc: encryptSecret(secret), previousSecretEnc: existing.secretEnc, previousSecretRotatedAt: new Date() },
  })
  return { secret }
}

/** A9.7: end a rotation window — after the customer has cut their receiver over to the new
 * secret, they call this to drop the previous secret from the outbound header. */
export async function completeWorkspaceWebhookEndpointRotation(workspaceId: string, endpointId: string) {
  const res = await prisma.webhookEndpoint.updateMany({
    where: { id: endpointId, workspaceId, previousSecretEnc: { not: null } },
    data: { previousSecretEnc: null, previousSecretRotatedAt: null },
  })
  if (!res.count) throw new Error("no_rotation_in_flight")
}

export async function deleteWorkspaceWebhookEndpoint(workspaceId: string, endpointId: string) {
  const res = await prisma.webhookEndpoint.deleteMany({ where: { id: endpointId, workspaceId } })
  if (!res.count) throw new Error("webhook_endpoint_not_found")
}

/** Owner toggles an endpoint on/off. Re-enabling resets failureCount so a fixed endpoint starts
 * clean rather than one failure away from being auto-disabled again. */
export async function setWorkspaceWebhookEndpointStatus(workspaceId: string, endpointId: string, status: "active" | "disabled") {
  const res = await prisma.webhookEndpoint.updateMany({
    where: { id: endpointId, workspaceId },
    data: status === "active" ? { status, failureCount: 0 } : { status },
  })
  if (!res.count) throw new Error("webhook_endpoint_not_found")
}

// --- Delivery history ---

export async function listWorkspaceWebhookDeliveries(workspaceId: string, limit = 50) {
  return prisma.webhookDelivery.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 100),
    select: {
      id: true, endpointId: true, eventId: true, eventType: true, status: true, attempts: true,
      responseStatus: true, errorCode: true, nextAttemptAt: true, deliveredAt: true, createdAt: true,
    },
  })
}

/** Requeues a delivery for a full fresh retry cycle (attempts reset to 0, due now). Idempotent-safe:
 * a delivery to a since-disabled endpoint will simply fail again as endpoint_disabled. */
export async function redeliverWorkspaceWebhookDelivery(workspaceId: string, deliveryId: string) {
  const res = await prisma.webhookDelivery.updateMany({
    where: { id: deliveryId, workspaceId },
    data: { status: "pending", attempts: 0, nextAttemptAt: new Date(), leaseUntil: null, errorCode: null, responseStatus: null, deliveredAt: null },
  })
  if (!res.count) throw new Error("delivery_not_found")
}

// --- API-shaped document reads (served by /api/v1) ---

/** Cursor-paginated document list — the Zapier polling trigger. Ordered newest-first by receivedAt
 * then id (id breaks ties and is the stable cursor). `cursor` is the last id of the previous page. */
export async function listDocumentsForApi(
  workspaceId: string,
  filters: { status?: string; stage?: PipelineStage; updatedSince?: Date; cursor?: string; limit?: number } = {}
) {
  const take = Math.min(Math.max(filters.limit ?? 50, 1), 100)
  const where: Prisma.DocumentWhereInput = {
    workspaceId,
    // `status` is the original, back-compat filter every existing Zapier subscription depends on
    // — an exact match on the raw persisted value, unchanged. `stage` is additive: a caller can
    // opt into the pipeline's tab vocabulary instead, which composes with (not replaces) status.
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.stage ? stageToStatusFilter(filters.stage) : {}),
    ...(filters.updatedSince ? { updatedAt: { gte: filters.updatedSince } } : {}),
  }
  const rows = await prisma.document.findMany({
    where,
    orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
    take: take + 1, // over-fetch one to know if there's a next page
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    include: { template: true },
  })
  const hasMore = rows.length > take
  const documents = hasMore ? rows.slice(0, take) : rows
  return { documents, nextCursor: hasMore ? documents[documents.length - 1]?.id ?? null : null }
}

export async function getDocumentForApi(workspaceId: string, documentId: string) {
  const document = await prisma.document.findFirst({ where: { id: documentId, workspaceId }, include: { template: true } })
  if (!document) return null
  const fieldValues = await getDocumentFieldValues(workspaceId, documentId)
  return { document, fieldValues }
}

// --- Accounting connectors (P2): QuickBooks / Xero ---

/** ADR 0005: no access/refresh token ever lives in this table — Nango holds them. Every column here
 * is safe to select and return as-is. */
export async function listWorkspaceIntegrationConnections(workspaceId: string) {
  return prisma.integrationConnection.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true, provider: true, externalTenantId: true, tenantName: true, status: true,
      defaultExpenseAccountId: true, defaultExpenseAccountName: true, defaultExpenseAccountGuessed: true, createdAt: true,
      ledgerCurrency: true, ledgerCapabilities: true,
    },
  })
}

export async function getWorkspaceIntegrationConnection(workspaceId: string, provider: "quickbooks" | "xero" | "sage") {
  return prisma.integrationConnection.findFirst({
    where: { workspaceId, provider },
    select: {
      id: true, provider: true, providerConfigKey: true, externalTenantId: true, tenantName: true, status: true,
      defaultExpenseAccountId: true, defaultExpenseAccountName: true, createdAt: true,
    },
  })
}

/** Finds a connection by its id alone (the id Nango calls back with in a webhook is DocuBite's
 * own `connectionId`, minted at session-creation — see connect-session route — but the webhook
 * carries no workspaceId, so this is the one lookup in this file not scoped by it). */
export async function getIntegrationConnectionById(connectionId: string) {
  return prisma.integrationConnection.findUnique({
    where: { id: connectionId },
    select: { id: true, workspaceId: true, provider: true, providerConfigKey: true, status: true, createdById: true },
  })
}

/** Creates the row on the Nango `AUTH` webhook's `operation: "creation", success: true` event
 * (ADR 0005) — the webhook is the trigger; DocuBite never marks itself connected off the
 * frontend's resolved promise. `id` is the same `connectionId` DocuBite minted at session-creation
 * (connect-session route) and Nango echoes back unchanged, so no separate Nango-id column exists.
 * A retry/redelivery of the same webhook is an upsert, not a duplicate-key error. */
export async function createIntegrationConnectionFromNango(input: {
  connectionId: string
  workspaceId: string
  provider: "quickbooks" | "xero" | "sage"
  providerConfigKey: string
  externalTenantId: string | null
  tenantName: string | null
  createdById: string | null
}) {
  return prisma.integrationConnection.upsert({
    where: { id: input.connectionId },
    create: {
      id: input.connectionId,
      workspaceId: input.workspaceId,
      provider: input.provider,
      providerConfigKey: input.providerConfigKey,
      externalTenantId: input.externalTenantId,
      tenantName: input.tenantName,
      status: "connected",
      createdById: input.createdById,
    },
    update: { status: "connected", externalTenantId: input.externalTenantId, tenantName: input.tenantName },
    select: { id: true, workspaceId: true, provider: true, status: true },
  })
}

/** Flips a connection to `needs_reconnect` (Nango `AUTH` webhook `operation: "refresh"`,
 * `success: false`, or a synchronous `IntegrationAuthError` off a live proxy call — ADR 0005).
 * Returns whether this call is the transition INTO the broken state (previous status was
 * `connected`) so the caller can send the Owner email once per break, not on every redelivery of
 * an already-`needs_reconnect` webhook. Returns null if the connection no longer exists (already
 * disconnected). */
export async function markIntegrationConnectionNeedsReconnect(connectionId: string): Promise<{ isNewBreak: boolean; workspaceId: string } | null> {
  const existing = await prisma.integrationConnection.findUnique({ where: { id: connectionId }, select: { status: true, workspaceId: true } })
  if (!existing) return null
  const isNewBreak = existing.status !== "needs_reconnect"
  if (isNewBreak) await prisma.integrationConnection.update({ where: { id: connectionId }, data: { status: "needs_reconnect" } })
  return { isNewBreak, workspaceId: existing.workspaceId }
}

// #429: an Owner picking the Default account here — same as a post confirming it — is the
// signal that ends the "Guessed" state; a later chart re-sync must not silently swap it back
// out from under them (see lib/integrations/sync.ts).
export async function setWorkspaceIntegrationDefaultAccount(
  workspaceId: string,
  connectionId: string,
  account: { id: string; name: string }
) {
  const res = await prisma.integrationConnection.updateMany({
    where: { id: connectionId, workspaceId },
    data: { defaultExpenseAccountId: account.id, defaultExpenseAccountName: account.name, defaultExpenseAccountGuessed: false },
  })
  if (!res.count) throw new Error("integration_connection_not_found")
}

/** Sage has no `connection_config` tenant field (ADR 0005): the AUTH webhook creates its row with
 * `externalTenantId: null`, and the connect flow's own in-page "Choose a business" step (a
 * `GET /businesses` proxy call, listBusinesses in lib/integrations/sage/client.ts) fills it in
 * here once the owner picks one. */
export async function setWorkspaceIntegrationTenant(
  workspaceId: string,
  connectionId: string,
  tenant: { externalTenantId: string; tenantName: string }
) {
  const res = await prisma.integrationConnection.updateMany({
    where: { id: connectionId, workspaceId, provider: "sage" },
    data: { externalTenantId: tenant.externalTenantId, tenantName: tenant.tenantName },
  })
  if (!res.count) throw new Error("integration_connection_not_found")
}

/** Disconnects (deletes) a connection: Nango-side revocation is the caller's job (lib/nango.ts's
 * deleteConnection) before this runs. Per ADR 0005 its IntegrationPush/LedgerTransaction rows keep
 * their `connectionId` as a nullable, now-dangling FK (onDelete: SetNull, not Cascade) — they are
 * the audit trail of what was actually posted/synced and must survive a disconnect. */
export async function deleteWorkspaceIntegrationConnection(workspaceId: string, connectionId: string) {
  const res = await prisma.integrationConnection.deleteMany({ where: { id: connectionId, workspaceId } })
  if (!res.count) throw new Error("integration_connection_not_found")
}

// --- Accounting pushes ---

/** Latest succeeded push per document, batched — for the Synced/Paid tab chips that name the
 * destination and time without a per-row round trip. Keyed by documentId so the pipeline page
 * can merge it into row objects in one pass. Empty input short-circuits so the caller can guard
 * with a stage check without also having to check `documentIds.length`. */
export async function listLatestPushesForDocuments(workspaceId: string, documentIds: string[]) {
  if (!documentIds.length) return new Map<string, { destination: string; at: Date }>()
  const pushes = await prisma.integrationPush.findMany({
    where: { workspaceId, documentId: { in: documentIds }, status: "succeeded" },
    orderBy: { completedAt: "desc" },
    select: { documentId: true, completedAt: true, provider: true, connection: { select: { tenantName: true, provider: true } } },
  })
  const latest = new Map<string, { destination: string; at: Date }>()
  for (const push of pushes) {
    if (!push.completedAt || latest.has(push.documentId)) continue
    latest.set(push.documentId, {
      destination: push.connection?.tenantName || push.connection?.provider || push.provider,
      at: push.completedAt,
    })
  }
  return latest
}

export async function listWorkspaceIntegrationPushes(workspaceId: string, documentId?: string) {
  return prisma.integrationPush.findMany({
    where: { workspaceId, ...(documentId ? { documentId } : {}) },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, connectionId: true, documentId: true, provider: true, status: true, attempts: true,
      externalBillId: true, externalRecordKind: true, errorCode: true, createdAt: true, completedAt: true,
    },
  })
}

/** Learns category→account mappings from succeeded pushes: reads the payload of every succeeded push
 * for this connection, extracts the (category, expenseAccountId) pair, and returns the most recent
 * account for each category. Only pushes that recorded both fields contribute — historical pushes
 * from before per-document account selection are silently skipped. */
export async function getCategoryAccountMap(workspaceId: string, connectionId: string): Promise<Record<string, string>> {
  const pushes = await prisma.integrationPush.findMany({
    where: { workspaceId, connectionId, status: "succeeded" },
    orderBy: { completedAt: "desc" },
    select: { payload: true },
  })
  const map: Record<string, string> = {}
  for (const push of pushes) {
    const p = push.payload as Record<string, unknown> | null
    if (!p) continue
    const category = typeof p.category === "string" ? p.category : null
    const accountId = typeof p.expenseAccountId === "string" ? p.expenseAccountId : null
    if (category && accountId && !(category in map)) {
      map[category] = accountId
    }
  }
  return map
}

/** Resolves account display names by externalId from the synced chart of accounts (#430 Screen 1
 * — the review-approval trigger only has ids from `SupplierAccountRule`, unlike the Default-save
 * trigger which already has the picked account's name in hand). Falls back to the id itself for
 * any account not found (stale sync, or an id from before the entity existed). */
export async function resolveAccountNames(connectionId: string, accountExternalIds: string[]): Promise<Record<string, string>> {
  const ids = Array.from(new Set(accountExternalIds))
  if (!ids.length) return {}
  const rows = await prisma.accountingEntity.findMany({
    where: { connectionId, entityType: "account", externalId: { in: ids } },
    select: { externalId: true, name: true },
  })
  // #430 evaluate re-run finding (P1): this used to fall back to the raw external id itself when the
  // AccountingEntity lookup missed, which meant callers' own "resolve or format the id" guards
  // (page.tsx, account-correction-actions.ts) never fired — the raw id always looked "resolved".
  // Omit the key entirely on a miss so callers' `names[id] ?? formatUnresolvedAccountId(id)` fallback
  // actually runs.
  const map: Record<string, string> = {}
  for (const id of ids) {
    const name = rows.find((r) => r.externalId === id)?.name
    if (name) map[id] = name
  }
  return map
}

/** Upserts the push row for (documentId, connectionId): re-pushing after a document edit reuses the
 * same row rather than creating a duplicate bill, per the unique constraint. Resets it to a fresh
 * pending attempt cycle so a push after a previous failure (or success) is a normal retry, not stuck
 * behind stale state. */
export async function upsertWorkspaceIntegrationPush(
  workspaceId: string,
  input: { connectionId: string; documentId: string; provider: "quickbooks" | "xero"; payload: object; createdById: string | null }
) {
  return prisma.integrationPush.upsert({
    where: { documentId_connectionId: { documentId: input.documentId, connectionId: input.connectionId } },
    create: {
      workspaceId,
      connectionId: input.connectionId,
      documentId: input.documentId,
      provider: input.provider,
      payload: input.payload as Prisma.InputJsonValue,
      status: "pending",
      nextAttemptAt: new Date(),
      createdById: input.createdById,
      idempotencyKey: randomUUID(),
    },
    update: {
      payload: input.payload as Prisma.InputJsonValue,
      status: "pending",
      attempts: 0,
      nextAttemptAt: new Date(),
      leaseUntil: null,
      errorCode: null,
      completedAt: null,
      // A7.2: a re-push is a NEW intent (possibly after an edit, possibly deliberately re-sending)
      // — it gets a fresh idempotency token; only retries of one intent share a token.
      idempotencyKey: randomUUID(),
    },
    select: { id: true, status: true },
  })
}

/** #461: how many succeeded pushes in this workspace predate the attach feature and so have no
 * `IntegrationAttachment` row at all — the owner-only one-time back-fill's count, shown before
 * they commit to running it. A push with an attachment row (any status) is not counted, even a
 * failed one — that one is retried through the ordinary Retry action, not re-enqueued here. */
export async function countBackfillableAttachments(workspaceId: string): Promise<number> {
  return prisma.integrationPush.count({
    where: { workspaceId, status: "succeeded", attachment: null },
  })
}

/** Enqueues an attach for every succeeded push in the workspace that has none yet, then kicks the
 * drain once for the whole batch. Returns how many were queued. Safe to run more than once: a
 * push already enqueued (by this call or the ordinary push-success path) is simply excluded by
 * the same `attachment: null` filter next time. */
export async function queueBackfillAttachments(workspaceId: string): Promise<number> {
  const pushes = await prisma.integrationPush.findMany({
    where: { workspaceId, status: "succeeded", attachment: null },
    select: { id: true },
  })
  for (const push of pushes) await enqueueAttachmentForPush(push.id)
  if (pushes.length) await kickIntegrationAttachDrain()
  return pushes.length
}
