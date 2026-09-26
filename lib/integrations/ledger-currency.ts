import { randomUUID } from "node:crypto"
import { prisma } from "@/lib/db"
import * as quickbooks from "@/lib/integrations/quickbooks/client"
import * as xero from "@/lib/integrations/xero/client"
import type { Prisma } from "@/prisma/client"

/** Xero allows 60 calls a minute per tenant; a read this recent is reused before a push rather than
 * spending one call per bill in a bulk post. */
export const LEDGER_CURRENCY_REUSE_MS = 60_000

type LedgerConnection = {
  id: string
  workspaceId: string
  provider: string
  externalTenantId: string | null
  ledgerCurrency?: string | null
  ledgerCurrencyReadAt?: Date | null
}

function fetchLedgerCurrency(provider: string, tenantId: string, connectionId: string): Promise<string> | null {
  if (provider === "quickbooks") return quickbooks.getHomeCurrency(tenantId, connectionId)
  if (provider === "xero") return xero.getBaseCurrency(tenantId, connectionId)
  return null
}

/** The ledger's own currency, read from the provider and stored on the connection. A stored read no
 * older than `reuseMs` is returned as is. Never throws: a failed read leaves the stored value alone
 * and returns null, so a connect never fails on it and a push treats it as "not known yet". */
export async function readLedgerCurrency(connection: LedgerConnection, now = new Date(), reuseMs = 0): Promise<string | null> {
  const readAt = connection.ledgerCurrencyReadAt
  if (reuseMs > 0 && connection.ledgerCurrency && readAt && now.getTime() - readAt.getTime() <= reuseMs) return connection.ledgerCurrency
  if (!connection.externalTenantId) return null
  try {
    const pending = fetchLedgerCurrency(connection.provider, connection.externalTenantId, connection.id)
    if (!pending) return null
    const ledgerCurrency = (await pending).toUpperCase()
    await prisma.integrationConnection.updateMany({
      where: { id: connection.id, workspaceId: connection.workspaceId },
      data: { ledgerCurrency, ledgerCurrencyReadAt: now },
    })
    return ledgerCurrency
  } catch (error) {
    console.error("[ledger-currency] read failed:", error instanceof Error ? error.message : error)
    return null
  }
}

/** After a Company currency change: every push refused because the ledger kept another currency goes
 * back in the queue as a new intent (fresh idempotency key, attempts reset) and its open pre-flight
 * task is resolved — the push gate checks the currencies again before anything is posted. Returns
 * how many were re-queued. */
export async function requeueLedgerCurrencyFailures(workspaceId: string, now = new Date(), client: Prisma.TransactionClient | typeof prisma = prisma): Promise<number> {
  const pushes = await client.integrationPush.findMany({
    where: { workspaceId, status: "failed", errorCode: "ledger_currency_differs" },
    select: { id: true, documentId: true },
  })
  if (!pushes.length) return 0
  for (const push of pushes) {
    await client.integrationPush.update({
      where: { id: push.id },
      data: { status: "pending", attempts: 0, nextAttemptAt: now, leaseUntil: null, errorCode: null, completedAt: null, idempotencyKey: randomUUID() },
    })
  }
  await client.reviewTask.updateMany({
    where: { workspaceId, documentId: { in: pushes.map((p) => p.documentId) }, reason: "push_preflight", status: { in: ["open", "in_review"] }, detail: { contains: "ledger_currency_differs" } },
    data: { status: "approved", resolvedAt: now },
  })
  return pushes.length
}
