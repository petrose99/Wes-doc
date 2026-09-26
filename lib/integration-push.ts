import config from "@/lib/config"
import { recordSystemAudit } from "@/lib/audit"
import { prisma } from "@/lib/db"
import type { Prisma } from "@/prisma/client"
import { unscoped } from "@/lib/workspace-scope"
import { NormalizedBill } from "@/lib/integration-bill-mapping"
import { IntegrationAuthError, IntegrationPermanentError, IntegrationRetryableError, safeErrorCode } from "@/lib/integrations/errors"
import { checkLedgerCurrency } from "@/lib/checks/ledger-currency"
import { LEDGER_CURRENCY_REUSE_MS, readLedgerCurrency } from "@/lib/integrations/ledger-currency"
import { checkLineCoding, ledgerReadBackChecks, lineCodingInputFromBill } from "@/lib/checks/line-coding"
import type { CheckResult } from "@/lib/checks/types"
import { recordLedgerReadBack } from "@/models/document-checks"
import { LEDGER_CAPABILITIES_REUSE_MS, readLedgerCapabilities } from "@/lib/integrations/ledger-capabilities"
import { loadLineCodingContext } from "@/models/accounting-entities"
import { readCompanyCurrencyForPush, recordCurrencyLock } from "@/models/company-currency"
import * as quickbooks from "@/lib/integrations/quickbooks/client"
import { toQuickBooksBillBody } from "@/lib/integrations/quickbooks/bill-mapper"
import * as xero from "@/lib/integrations/xero/client"
import { toXeroBillBody } from "@/lib/integrations/xero/bill-mapper"
import { computePushUpdate, PUSH_LEASE_MS, type PushAttemptResult } from "@/lib/integration-push-policy"
import { preflightPush } from "@/lib/integration-preflight"
import { createReviewTask } from "@/models/review-tasks"
import { emitAccountsPayableEvent } from "@/lib/webhooks"
import { kickWebhookDrain } from "@/lib/webhook-delivery"

/** The push loop: claim a due IntegrationPush, resolve the vendor/contact + default expense account
 * at the provider, create the bill, and apply the pure policy's verdict (succeeded / retry-with-
 * backoff / give up). Modelled on lib/webhook-delivery.ts's claim/process/drain trio exactly, with
 * its own smaller lease and attempt cap (see lib/integration-push-policy.ts). Never throws for an
 * ordinary provider failure — every failure path is caught and recorded on the row. */

/** Picks and atomically claims the next due push. Returns its id, or null if nothing is due or
 * another drain won the race. Not wrapped in unscoped() itself — callers do that once around a loop,
 * exactly as claimNextWebhookDelivery does. */
export async function claimNextIntegrationPush(now = new Date()): Promise<string | null> {
  const dueLease = { OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] }
  const candidate = await prisma.integrationPush.findFirst({
    where: { status: "pending", nextAttemptAt: { lte: now }, ...dueLease },
    orderBy: { nextAttemptAt: "asc" },
    select: { id: true },
  })
  if (!candidate) return null
  const claimed = await prisma.integrationPush.updateMany({
    where: { id: candidate.id, status: "pending", ...dueLease },
    data: { leaseUntil: new Date(now.getTime() + PUSH_LEASE_MS) },
  })
  return claimed.count ? candidate.id : null
}

/** WP2.4: checks the provider's own ledger for a bill/invoice already carrying this document's
 * reference number, before ever creating one — a duplicate this app's own detection can't see
 * (e.g. the same invoice pushed once from here and once entered by hand at the provider). Never
 * throws: a lookup failure (network blip, transient provider error) must not block a push that
 * would otherwise succeed, so this swallows any error and reports "not a duplicate" rather than
 * risk false-blocking every push whenever the lookup itself is flaky. */
async function ledgerHasDuplicate(provider: string, externalTenantId: string | null, connectionId: string, referenceNumber: string): Promise<boolean> {
  if (!externalTenantId) return false
  try {
    switch (provider) {
      case "quickbooks":
        return await quickbooks.findBillByDocNumber(externalTenantId, connectionId, referenceNumber)
      case "xero":
        return await xero.findBillByInvoiceNumber(externalTenantId, connectionId, referenceNumber)
      default:
        return false
    }
  } catch (error) {
    console.error("[integration-push] ledger duplicate lookup failed, proceeding with push:", error instanceof Error ? error.message : error)
    return false
  }
}

// #429: accountId/accountCode are no longer threaded into the bill body — each line now carries
// its own resolved accountExternalId (lib/integration-bill-mapping.ts's NormalizedLineItem), read
// directly by the mapper. The caller still passes expenseAccountId through for the preflight cache
// check below (does *a* resolved account exist in the synced chart at all).
type CreatedBill = Awaited<ReturnType<typeof quickbooks.createBill>>

async function pushToQuickbooks(realmId: string, connectionId: string, bill: NormalizedBill, idempotencyKey: string | null): Promise<CreatedBill> {
  const vendorRef = await quickbooks.findOrCreateVendor(realmId, connectionId, bill.vendorName)
  const body = toQuickBooksBillBody(bill, vendorRef)
  return quickbooks.createBill(realmId, connectionId, body, idempotencyKey)
}

async function pushToXero(tenantId: string, connectionId: string, bill: NormalizedBill, idempotencyKey: string | null): Promise<CreatedBill> {
  const contactId = await xero.findOrCreateContact(tenantId, connectionId, bill.vendorName)
  const body = toXeroBillBody(bill, contactId)
  return xero.createBill(tenantId, connectionId, body, idempotencyKey)
}

/** A7.1: validates the push against the synced AccountingEntity cache and fails CLOSED — a
 * problem becomes a terminal error code plus one open review task, never a provider round-trip
 * that half-creates records. Cache-read failures wave the push through (the provider itself is
 * the final validator; pre-flight exists to fail fast, not to add a new way to get stuck). */
async function preflightAgainstCache(push: { workspaceId: string; documentId: string }, connectionId: string, expenseAccountId: string, vendorName: string | null): Promise<void> {
  let verdict: ReturnType<typeof preflightPush>
  try {
    const entities = await prisma.accountingEntity.findMany({
      where: { workspaceId: push.workspaceId, connectionId, entityType: { in: ["account", "vendor"] } },
      select: { entityType: true, externalId: true, code: true, name: true, active: true },
    })
    verdict = preflightPush({ expenseAccountId, vendorName, entities })
  } catch (error) {
    console.error("[integration-push] preflight cache read failed, proceeding with push:", error instanceof Error ? error.message : error)
    return
  }
  if (verdict.ok) return
  await failPreflight(push, verdict.errorCode, verdict.message)
}

/** Opens one `push_preflight` review task for the cause (one open task per document+reason, same
 * dedupe shape as models/document-checks.ts) and fails the push terminally. */
async function failPreflight(push: { workspaceId: string; documentId: string }, errorCode: string, message: string): Promise<never> {
  const existing = await prisma.reviewTask.findFirst({
    where: { workspaceId: push.workspaceId, documentId: push.documentId, reason: "push_preflight", status: { in: ["open", "in_review"] }, detail: { contains: errorCode } },
    select: { id: true },
  }).catch(() => null)
  if (!existing) {
    await createReviewTask({ workspaceId: push.workspaceId, documentId: push.documentId, reason: "push_preflight", detail: `${errorCode}: ${message}`, priority: 1, createdById: null }).catch(() => {})
  }
  throw new IntegrationPermanentError(errorCode)
}

/** ADR 0013: nothing is posted into a ledger kept in another currency than the Company's. Every push
 * kind, bank statements included. An unreadable ledger currency is transient — the backoff retries
 * it, and nothing is posted meanwhile; a mismatch is terminal until the currency is changed, which
 * re-queues it (requeueLedgerCurrencyFailures). */
async function gateLedgerCurrency(push: { workspaceId: string; documentId: string }, connection: { id: string; provider: string; externalTenantId: string | null; ledgerCurrency: string | null; ledgerCurrencyReadAt: Date | null }, now: Date): Promise<void> {
  const ledgerCurrency = await readLedgerCurrency({ ...connection, workspaceId: push.workspaceId }, now, LEDGER_CURRENCY_REUSE_MS)
  if (!ledgerCurrency) throw new IntegrationRetryableError("ledger_currency_unreadable")
  const check = checkLedgerCurrency({ provider: connection.provider, ledgerCurrency, companyCurrency: await readCompanyCurrencyForPush(push.workspaceId) })
  if (check.status === "fail") await failPreflight(push, check.checkCode, String(check.detail?.text))
}

type GateConnection = { id: string; provider: string; externalTenantId: string | null; ledgerCapabilities: Prisma.JsonValue | null; ledgerCapabilitiesReadAt: Date | null }

/** ADR 0014: nothing posts a line coding the ledger can't take — the same Check as the document's,
 * run over the snapshot against the ledger's capabilities read now (a stored read up to a day old;
 * `reuseMs` 0 after a 5030). An unreadable capability read throws retryable: never posted on a
 * guess. A snapshot taken before line coding existed carries no taxBasis and is not judged. */
async function gateLineCoding(push: { workspaceId: string; documentId: string }, connection: GateConnection, bill: NormalizedBill & { documentType?: string }, now: Date, reuseMs = LEDGER_CAPABILITIES_REUSE_MS): Promise<void> {
  if (bill.documentType === "bank_statement" || bill.taxBasis === undefined) return
  const capabilities = await readLedgerCapabilities({ ...connection, workspaceId: push.workspaceId }, now, reuseMs)
  const context = await loadLineCodingContext(push.workspaceId, connection, capabilities)
  const fail = context && checkLineCoding({ ...context, ...lineCodingInputFromBill(bill) })[0]
  if (fail) await failPreflight(push, fail.checkCode, String(fail.detail?.text))
}

const QUICKBOOKS_FEATURE_NOT_SUPPORTED = "QuickBooks turned down a field this plan doesn't offer. Sync accounts, then check the bill."

/** #459: matches a Xero Warning saying an ItemCode was dropped (build-time substring fallback per
 * spec — Xero's exact wording is verified against the sandbox/docs at build; a warning mentioning
 * both "Item" and "code" is treated as this case either way). */
function itemCodeStrippedWarning(message: string): boolean {
  const lower = message.toLowerCase()
  return lower.includes("item") && lower.includes("code")
}

/** How often a paused push (connection `needs_reconnect`) is re-checked — a fixed poke interval,
 * not the exponential backoff curve, since nothing will succeed until a human reconnects. See the
 * `needs_reconnect` pre-check below. */
const RECONNECT_POKE_MS = 5 * 60 * 1000

/** Leaves `push` pending without burning an attempt or the lease: used both by the `needs_reconnect`
 * pre-check and by the mid-attempt `IntegrationAuthError` fallback, so a broken connection never
 * exhausts MAX_PUSH_ATTEMPTS while a human hasn't yet reconnected (map Notes: "pauses posts, no
 * attempts burned"). Reconnecting doesn't itself requeue — the existing `nextAttemptAt` poke picks
 * the push back up within RECONNECT_POKE_MS, same as any other pending row. */
async function pauseForReconnect(pushId: string, now: Date): Promise<void> {
  await prisma.integrationPush.update({
    where: { id: pushId },
    data: { leaseUntil: null, nextAttemptAt: new Date(now.getTime() + RECONNECT_POKE_MS) },
  })
}

/** Attempts one claimed push and records the outcome. Safe to call on a row another driver may also
 * try, exactly like deliverWebhook. */
export async function attemptIntegrationPush(pushId: string, now = new Date()): Promise<void> {
  const push = await prisma.integrationPush.findUnique({
    where: { id: pushId },
    select: {
      id: true, workspaceId: true, documentId: true, status: true, attempts: true, payload: true, idempotencyKey: true,
      connection: {
        select: {
          id: true, provider: true, status: true, externalTenantId: true,
          defaultExpenseAccountId: true, ledgerCurrency: true, ledgerCurrencyReadAt: true,
          ledgerCapabilities: true, ledgerCapabilitiesReadAt: true,
        },
      },
    },
  })
  if (!push || push.status !== "pending") return
  const connection = push.connection

  // `connection` is nullable (IntegrationConnection.onDelete: SetNull) — the connection was
  // disconnected out from under an already-queued push. Same terminal branch as any other
  // disabled connection, just skipping the field reads that need it below.
  if (!connection) {
    const update = computePushUpdate(push.attempts, { success: false, errorCode: "integration_connection_disabled", externalBillId: null }, now, true)
    await prisma.integrationPush.update({ where: { id: push.id }, data: update })
    return
  }

  if (connection.status === "needs_reconnect") {
    await pauseForReconnect(push.id, now)
    return
  }

  let result: PushAttemptResult
  let forceTerminal = false
  let readBack: CheckResult[] = []

  if (connection.status !== "connected") {
    result = { success: false, errorCode: "integration_connection_disabled", externalBillId: null }
    forceTerminal = true
  } else {
    const payloadRaw = push.payload as unknown as NormalizedBill & { expenseAccountId?: string; documentType?: string }
    const expenseAccountId = payloadRaw.expenseAccountId ?? connection.defaultExpenseAccountId
    if (!connection.externalTenantId || !expenseAccountId) {
      result = { success: false, errorCode: "integration_default_account_not_configured", externalBillId: null }
      forceTerminal = true
    } else {
      try {
        const bill = { ...payloadRaw, currencyCode: payloadRaw.currencyCode ?? null }
        await gateLedgerCurrency(push, connection, now)
        await gateLineCoding(push, connection, bill, now)
        // A7.1: bill-shaped pushes are validated against the entity cache before any provider
        // call; bank-statement batches carry no vendor/expense-account pair to validate.
        if (payloadRaw.documentType !== "bank_statement") {
          await preflightAgainstCache(push, connection.id, expenseAccountId, bill.vendorName ?? null)
        }
        const isDuplicate = bill.referenceNumber ? await ledgerHasDuplicate(connection.provider, connection.externalTenantId, connection.id, bill.referenceNumber) : false
        if (isDuplicate) throw new IntegrationPermanentError("ledger_duplicate")
        let created: CreatedBill
        switch (connection.provider) {
          case "quickbooks":
            created = await pushToQuickbooks(connection.externalTenantId, connection.id, bill, push.idempotencyKey).catch(async (error) => {
              if (!(error instanceof IntegrationPermanentError) || error.code !== "quickbooks_feature_not_supported") throw error
              // The plan turned down a field: a fresh read names the Check that explains it, when one does.
              await gateLineCoding(push, connection, bill, now, 0).catch((gateError) => { if (gateError instanceof IntegrationPermanentError) throw gateError })
              return failPreflight(push, error.code, QUICKBOOKS_FEATURE_NOT_SUPPORTED)
            })
            break
          case "xero":
            created = await pushToXero(connection.externalTenantId, connection.id, bill, push.idempotencyKey)
            break
          default:
            throw new IntegrationPermanentError(`${connection.provider}_push_not_implemented`)
        }
        // #459: a Xero Warning that strips an ItemCode silently turned an item line into an
        // account line at the ledger — never-silently-drop-data means that's a failed post, not
        // a succeeded-with-warning, even though Xero itself returned 200 and an InvoiceID.
        if (connection.provider === "xero" && bill.lineItems.some((line) => line.itemExternalId) && created.warnings.some(itemCodeStrippedWarning)) {
          throw new IntegrationPermanentError("xero_item_code_stripped")
        }
        result = { success: true, errorCode: null, externalBillId: created.id }
        readBack = ledgerReadBackChecks(connection.provider, bill, created)
      } catch (error) {
        if (error instanceof IntegrationAuthError) {
          // Nango's AUTH webhook is the authoritative signal (attemptIntegrationPush never expects
          // to see this synchronously), but an ordinary proxy 401 can race ahead of it — flip the
          // row as a fallback and pause exactly like the needs_reconnect pre-check, rather than
          // burning an attempt on a call that can't succeed until a human reconnects.
          await prisma.integrationConnection.update({ where: { id: connection.id }, data: { status: "needs_reconnect" } }).catch(() => {})
          await pauseForReconnect(push.id, now)
          return
        } else if (error instanceof IntegrationPermanentError) {
          result = { success: false, errorCode: error.code, externalBillId: null }
          forceTerminal = true
        } else {
          result = { success: false, errorCode: safeErrorCode(error), externalBillId: null }
        }
      }
    }
  }

  const update = computePushUpdate(push.attempts, result, now, forceTerminal)
  // The first succeeded push of any kind locks the Company currency (ADR 0013), recorded with the
  // success itself so a currency change can never slip in between the two.
  const lockCause = (push.payload as { documentType?: string } | null)?.documentType === "bank_statement" ? "bank_statement" : "bill"
  await prisma.$transaction(async (tx) => {
    await tx.integrationPush.update({ where: { id: push.id }, data: update })
    if (result.success) await recordCurrencyLock(push.workspaceId, lockCause, connection.provider, now, tx)
  })

  if (result.success) {
    // Written only once the push is marked posted, and never able to undo that: the bill is in the
    // ledger, so a failed write here is logged rather than sending the push back to retry.
    if (readBack.length) {
      await recordLedgerReadBack(push.workspaceId, push.documentId, readBack).catch((error) => {
        console.error("[integration-push] ledger read-back check write failed:", error instanceof Error ? error.message : error)
      })
    }
    await recordSystemAudit({
      workspaceId: push.workspaceId,
      type: "integration_push_succeeded",
      detail: { pushId: push.id, connectionId: connection.id, documentId: push.documentId, provider: connection.provider, externalBillId: result.externalBillId },
    })
    // WP-AP1: bill.pushed webhook, best-effort — never throw past attemptIntegrationPush.
    const externalRecordKind = await prisma.integrationPush.findUnique({ where: { id: push.id }, select: { externalRecordKind: true } }).then((r) => r?.externalRecordKind ?? null).catch(() => null)
    try {
      const emitted = await emitAccountsPayableEvent(prisma, {
        workspaceId: push.workspaceId,
        createdAt: now,
        event: {
          type: "bill.pushed",
          documentId: push.documentId,
          data: { provider: connection.provider, connection_id: connection.id, external_bill_id: result.externalBillId, external_record_kind: externalRecordKind },
        },
      })
      if (emitted.queued > 0) await kickWebhookDrain()
    } catch (error) {
      console.error("[integration-push] bill.pushed webhook emit failed:", error instanceof Error ? error.message : error)
    }
  } else if (update.status === "failed") {
    // Terminal only — every retry would otherwise get its own row and drown the signal in noise.
    await recordSystemAudit({
      workspaceId: push.workspaceId,
      type: "integration_push_failed",
      detail: { pushId: push.id, connectionId: connection.id, documentId: push.documentId, provider: connection.provider, errorCode: result.errorCode, attempts: update.attempts },
    })
  }
}

/** Claim + attempt the next due push. Returns its id if one ran, null if the queue was empty.
 * Unscoped: it spans workspaces like the webhook drain, so it wraps the scope guard exactly as
 * processNextWebhookDelivery does. */
export async function processNextIntegrationPush(now = new Date()): Promise<string | null> {
  return unscoped(async () => {
    const id = await claimNextIntegrationPush(now)
    if (!id) return null
    await attemptIntegrationPush(id, now)
    return id
  })
}

/** Drains up to `max` due pushes in one pass, stopping early when the queue empties. */
export async function drainIntegrationPushes(max = 20): Promise<number> {
  let processed = 0
  for (let i = 0; i < max; i++) {
    const id = await processNextIntegrationPush()
    if (!id) break
    processed++
  }
  return processed
}

/** Fire-and-forget nudge to drain the push queue right after one is enqueued, mirroring
 * kickWebhookDrain exactly — best-effort, swallowed on failure, backed by the cron/worker safety
 * net. */
export async function kickIntegrationPushDrain(): Promise<void> {
  try {
    await fetch(`${config.app.baseURL}/api/internal/jobs/process`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${config.aws.internalWorkerSecret}` },
      body: JSON.stringify({ drainIntegrationPushes: true }),
      signal: AbortSignal.timeout(5000),
    })
  } catch { /* swallowed: the drain drivers are the guarantee, this is only latency */ }
}

/** #281: the bulk Post button's target connection, shared by the Invoice, Receipt and Bank
 * Statement queue pages (hoisted once a third page needed the same lookup — ladder rung 2). Null
 * (integrations off, none configured, or none active) still lets the button render — the confirm
 * dialog and the connection-failure band are what tell the operator why, never a hidden button. */
export async function getActiveIntegrationConnectionId(workspaceId: string): Promise<string | null> {
  if (!config.integrations.enabled) return null
  const connection = await prisma.integrationConnection.findFirst({ where: { workspaceId, status: "connected" }, select: { id: true } })
  return connection?.id ?? null
}

export type LedgerBandStatus = "disconnected" | "needs_reconnect"

/** #281 spec.md §6, widened by #380, narrowed by ADR 0005: the cause behind the queue-scoped
 * connection-failure band — null only when a connection is connected (band hidden). Integrations
 * being off no longer suppresses the band: with Bigcapital removed and no ledger connect flow
 * built yet (a later ticket), "no ledger" is the default state every workspace is in, and the
 * glossary's rule ("posting is offered nowhere while no ledger is connected; the queue says why
 * once, above the rows") applies regardless of whether the integrations feature is configured.
 * The glossary names exactly three connection states — Connected, Needs reconnecting, absent — so
 * there is no default-account-missing band state; CONTEXT.md.
 * Most-recent connection by `createdAt` mirrors `getActiveIntegrationConnectionId`'s own "the"
 * connection — one workspace, one ledger. */
export async function getLedgerConnectionBandStatus(workspaceId: string): Promise<LedgerBandStatus | null> {
  if (!config.integrations.enabled) return "disconnected"
  const connection = await prisma.integrationConnection.findFirst({
    where: { workspaceId }, orderBy: { createdAt: "desc" }, select: { status: true },
  })
  if (!connection) return "disconnected"
  if (connection.status === "needs_reconnect") return "needs_reconnect"
  return null
}
