import config from "@/lib/config"
import { recordSystemAudit } from "@/lib/audit"
import { prisma } from "@/lib/db"
import { unscoped } from "@/lib/workspace-scope"
import { IntegrationAuthError, IntegrationPermanentError, safeErrorCode } from "@/lib/integrations/errors"
import { attachmentLimitViolation, type AttachProvider } from "@/lib/integrations/attach-limits"
import { fixedAttachFilename, loadAttachmentRendition } from "@/lib/integration-attach-rendition"
import { ATTACH_LEASE_MS, computeAttachUpdate, type AttachAttemptResult } from "@/lib/integration-attach-policy"
import * as quickbooks from "@/lib/integrations/quickbooks/client"
import * as xero from "@/lib/integrations/xero/client"

/** The attach loop: claim a due IntegrationAttachment, load and render the Document's Source file,
 * list the provider's existing attachments to find a fixed-filename match (never attached twice),
 * and upload it if no match exists yet. Modelled on lib/integration-push.ts's claim/attempt/drain
 * trio exactly, with its own smaller module (lib/integration-attach-policy.ts). Never throws for
 * an ordinary provider failure — every failure path is caught and recorded on the row. */

/** #461: called once, from attemptIntegrationPush's success branch, right after a push succeeds —
 * never from anywhere else. Upsert-or-skip: `@@unique([pushId])` means a second call for the same
 * push (a retried webhook, a re-run drain) is a no-op, not a second row. The row's fileName is
 * computed once here and never recomputed later (ADR 0016: "never attached twice: the file name
 * is fixed at the start"). Best-effort: never throws past the caller, same care as the bill.pushed
 * webhook emit beside it in attemptIntegrationPush. */
export async function enqueueAttachmentForPush(pushId: string): Promise<void> {
  try {
    const push = await prisma.integrationPush.findUnique({
      where: { id: pushId },
      select: { id: true, workspaceId: true, documentId: true, connectionId: true, provider: true, createdById: true },
    })
    if (!push) return
    const document = await prisma.document.findUnique({ where: { id: push.documentId }, select: { filename: true } })
    if (!document) return
    await prisma.integrationAttachment.create({
      data: {
        workspaceId: push.workspaceId,
        pushId: push.id,
        connectionId: push.connectionId,
        documentId: push.documentId,
        provider: push.provider,
        fileName: fixedAttachFilename(document.filename),
        createdById: push.createdById,
      },
    })
  } catch (error) {
    if (isPrismaUniqueViolation(error)) return // already enqueued for this push
    console.error("[integration-attach] enqueue failed:", error instanceof Error ? error.message : error)
  }
}

function isPrismaUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002"
}

/** Picks and atomically claims the next due attach. Returns its id, or null if nothing is due or
 * another drain won the race. Not wrapped in unscoped() itself — callers do that once around a
 * loop, exactly as claimNextIntegrationPush does. */
export async function claimNextIntegrationAttachment(now = new Date()): Promise<string | null> {
  const dueLease = { OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] }
  const candidate = await prisma.integrationAttachment.findFirst({
    where: { status: "pending", nextAttemptAt: { lte: now }, ...dueLease },
    orderBy: { nextAttemptAt: "asc" },
    select: { id: true },
  })
  if (!candidate) return null
  const claimed = await prisma.integrationAttachment.updateMany({
    where: { id: candidate.id, status: "pending", ...dueLease },
    data: { leaseUntil: new Date(now.getTime() + ATTACH_LEASE_MS) },
  })
  return claimed.count ? candidate.id : null
}

/** How often a paused attach (connection `needs_reconnect`) is re-checked — same fixed poke
 * interval as pauseForReconnect in lib/integration-push.ts, not the exponential backoff curve. */
const RECONNECT_POKE_MS = 5 * 60 * 1000

async function pauseForReconnect(attachmentId: string, now: Date): Promise<void> {
  await prisma.integrationAttachment.update({
    where: { id: attachmentId },
    data: { leaseUntil: null, nextAttemptAt: new Date(now.getTime() + RECONNECT_POKE_MS) },
  })
}

type ProviderAttachment = { attachmentId: string; fileName: string }

async function listProviderAttachments(provider: string, externalTenantId: string, connectionId: string, externalBillId: string): Promise<ProviderAttachment[]> {
  switch (provider) {
    case "quickbooks":
      return quickbooks.listAttachments(externalTenantId, connectionId, externalBillId)
    case "xero":
      return xero.listAttachments(externalTenantId, connectionId, externalBillId)
    default:
      throw new IntegrationPermanentError(`${provider}_attach_not_implemented`)
  }
}

async function uploadProviderAttachment(provider: string, externalTenantId: string, connectionId: string, externalBillId: string, file: { buffer: Buffer; contentType: string; fileName: string }): Promise<ProviderAttachment> {
  switch (provider) {
    case "quickbooks":
      return quickbooks.attachFile(externalTenantId, connectionId, externalBillId, file)
    case "xero":
      return xero.attachFile(externalTenantId, connectionId, externalBillId, file)
    default:
      throw new IntegrationPermanentError(`${provider}_attach_not_implemented`)
  }
}

/** Xero's file-count ceiling (10/bill) is discoverable only here, from listAttachments' own count —
 * never statically (see lib/integrations/attach-limits.ts). Only Xero enforces a count; QBO's own
 * limits table (per #450) carries no count ceiling. */
function checkProviderAttachmentCount(provider: string, existing: ProviderAttachment[]): void {
  if (provider === "xero" && existing.length >= 10) throw new IntegrationPermanentError("attach_over_count")
}

/** Attempts one claimed attach and records the outcome. Safe to call on a row another driver may
 * also try, exactly like attemptIntegrationPush. */
export async function attemptIntegrationAttachment(attachmentId: string, now = new Date()): Promise<void> {
  const attachment = await prisma.integrationAttachment.findUnique({
    where: { id: attachmentId },
    select: {
      id: true, workspaceId: true, documentId: true, status: true, attempts: true, fileName: true, provider: true,
      connection: { select: { id: true, provider: true, status: true, externalTenantId: true } },
      push: { select: { status: true, externalBillId: true } },
    },
  })
  if (!attachment || attachment.status !== "pending") return
  const connection = attachment.connection

  // connectionId is nullable (IntegrationConnection.onDelete: SetNull) — the connection was
  // disconnected out from under an already-queued attach. Same terminal branch as the push side.
  if (!connection) {
    const update = computeAttachUpdate(attachment.attempts, { success: false, errorCode: "integration_connection_disabled", externalAttachmentId: null }, now, true)
    await prisma.integrationAttachment.update({ where: { id: attachment.id }, data: update })
    return
  }

  if (connection.status === "needs_reconnect") {
    await pauseForReconnect(attachment.id, now)
    return
  }

  let result: AttachAttemptResult
  let forceTerminal = false

  if (connection.status !== "connected") {
    result = { success: false, errorCode: "integration_connection_disabled", externalAttachmentId: null }
    forceTerminal = true
  } else if (attachment.push.status !== "succeeded" || !attachment.push.externalBillId) {
    // The push this attach belongs to hasn't actually succeeded yet (shouldn't happen — enqueue
    // only runs from the success branch — but a manual retry or a race is worth a retryable wait,
    // never a silent no-op).
    result = { success: false, errorCode: "attach_push_not_succeeded", externalAttachmentId: null }
  } else if (!connection.externalTenantId) {
    result = { success: false, errorCode: "integration_default_account_not_configured", externalAttachmentId: null }
    forceTerminal = true
  } else {
    try {
      const existing = await listProviderAttachments(connection.provider, connection.externalTenantId, connection.id, attachment.push.externalBillId)
      const match = existing.find((a) => a.fileName === attachment.fileName)
      if (match) {
        result = { success: true, errorCode: null, externalAttachmentId: match.attachmentId }
      } else {
        checkProviderAttachmentCount(connection.provider, existing)
        const document = await prisma.document.findUnique({
          where: { id: attachment.documentId },
          select: { storageKey: true, mimeType: true, pageRange: true, filename: true },
        })
        if (!document) throw new IntegrationPermanentError("attach_bill_gone")
        const rendition = await loadAttachmentRendition(document)
        const violation = attachmentLimitViolation(connection.provider as AttachProvider, { contentType: rendition.contentType, sizeBytes: rendition.buffer.byteLength })
        if (violation) throw new IntegrationPermanentError(violation.code)
        const uploaded = await uploadProviderAttachment(connection.provider, connection.externalTenantId, connection.id, attachment.push.externalBillId, rendition)
        result = { success: true, errorCode: null, externalAttachmentId: uploaded.attachmentId }
      }
    } catch (error) {
      if (error instanceof IntegrationAuthError) {
        await prisma.integrationConnection.update({ where: { id: connection.id }, data: { status: "needs_reconnect" } }).catch(() => {})
        await pauseForReconnect(attachment.id, now)
        return
      } else if (error instanceof IntegrationPermanentError) {
        result = { success: false, errorCode: error.code, externalAttachmentId: null }
        forceTerminal = true
      } else {
        result = { success: false, errorCode: safeErrorCode(error), externalAttachmentId: null }
      }
    }
  }

  const update = computeAttachUpdate(attachment.attempts, result, now, forceTerminal)
  await prisma.integrationAttachment.update({ where: { id: attachment.id }, data: update })

  if (result.success) {
    await recordSystemAudit({
      workspaceId: attachment.workspaceId,
      type: "integration_attach_succeeded",
      detail: { attachmentId: attachment.id, connectionId: connection.id, documentId: attachment.documentId, provider: connection.provider, externalAttachmentId: result.externalAttachmentId },
    })
  } else if (update.status === "failed") {
    // Terminal only — every retry would otherwise get its own row and drown the signal in noise.
    await recordSystemAudit({
      workspaceId: attachment.workspaceId,
      type: "integration_attach_failed",
      detail: { attachmentId: attachment.id, connectionId: connection.id, documentId: attachment.documentId, provider: connection.provider, errorCode: result.errorCode, attempts: update.attempts },
    })
  }
}

/** Claim + attempt the next due attach. Returns its id if one ran, null if the queue was empty.
 * Unscoped: it spans workspaces like the push drain, so it wraps the scope guard exactly as
 * processNextIntegrationPush does. */
export async function processNextIntegrationAttachment(now = new Date()): Promise<string | null> {
  return unscoped(async () => {
    const id = await claimNextIntegrationAttachment(now)
    if (!id) return null
    await attemptIntegrationAttachment(id, now)
    return id
  })
}

/** Drains up to `max` due attaches in one pass, stopping early when the queue empties. */
export async function drainIntegrationAttaches(max = 20): Promise<number> {
  let processed = 0
  for (let i = 0; i < max; i++) {
    const id = await processNextIntegrationAttachment()
    if (!id) break
    processed++
  }
  return processed
}

/** Fire-and-forget nudge to drain the attach queue right after one is enqueued, mirroring
 * kickIntegrationPushDrain exactly — best-effort, swallowed on failure, backed by the cron/worker
 * safety net. */
export async function kickIntegrationAttachDrain(): Promise<void> {
  try {
    await fetch(`${config.app.baseURL}/api/internal/jobs/process`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${config.aws.internalWorkerSecret}` },
      body: JSON.stringify({ drainIntegrationAttaches: true }),
      signal: AbortSignal.timeout(5000),
    })
  } catch { /* swallowed: the drain drivers are the guarantee, this is only latency */ }
}
