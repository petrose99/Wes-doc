// The Company currency lock and change (ADR 0013). Not a "use server" module — the Owner check is
// at changeCompanyCurrencyAction (admin/companies/actions.ts).
import { recordDocumentAudit } from "@/lib/audit"
import { prisma } from "@/lib/db"
import { applyFxToDocument } from "@/lib/fx/apply-to-document"
import { isAllowedPair } from "@/lib/geo/company-currency"
import { requeueLedgerCurrencyFailures } from "@/lib/integrations/ledger-currency"
import { Prisma } from "@/prisma/client"

export type CurrencyLockCause = "bill" | "bank_statement" | "payment_batch"
export type CurrencyLock = { locked: false } | { locked: true; cause: CurrencyLockCause; provider: string | null; at: Date }

type Client = Prisma.TransactionClient | typeof prisma

const lockSelect = { currencyLockedAt: true, currencyLockCause: true, currencyLockProvider: true } as const

function toLock(row: { currencyLockedAt: Date | null; currencyLockCause: string | null; currencyLockProvider: string | null }): CurrencyLock {
  if (!row.currencyLockedAt) return { locked: false }
  return { locked: true, cause: (row.currencyLockCause ?? "bill") as CurrencyLockCause, provider: row.currencyLockProvider, at: row.currencyLockedAt }
}

/** The Company currency — gates, claim totals and notices use it; never a USD fallback. A missing
 * workspace throws (a gate run skips that runner rather than judge in USD). */
export async function getCompanyCurrency(workspaceId: string, client: Client = prisma): Promise<string> {
  const row = await client.workspace.findUnique({ where: { id: workspaceId }, select: { baseCurrency: true } })
  if (!row) throw new Error("workspace_not_found")
  return row.baseCurrency
}

export async function getCurrencyLock(workspaceId: string, client: Client = prisma): Promise<CurrencyLock> {
  return toLock(await client.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: lockSelect }))
}

/** Records the lock the first time anything in the Company currency reaches a ledger or a bank:
 * a succeeded push (attemptIntegrationPush) or a Payment batch (its create). Only when none is
 * recorded yet — the first cause stands, and deleting it later never reopens the currency. */
export async function recordCurrencyLock(workspaceId: string, cause: CurrencyLockCause, provider: string | null, at: Date, client: Client = prisma) {
  await client.workspace.updateMany({
    where: { id: workspaceId, currencyLockedAt: null },
    data: { currencyLockedAt: at, currencyLockCause: cause, currencyLockProvider: provider },
  })
}

export const unposted = (workspaceId: string) => ({ workspaceId, integrationPushes: { none: { status: "succeeded" } } })

/** Documents a currency change re-converts: everything not yet posted to a ledger. */
export async function countUnpostedDocuments(workspaceId: string): Promise<number> {
  return prisma.document.count({ where: unposted(workspaceId) })
}

/** Owner changes an unlocked company's currency (LS only: LSL ⇄ ZAR). The workspace row is held
 * FOR UPDATE so a concurrent push success or a second change waits; the lock and the pair are
 * re-read under it. A push mid-flight (leased) would post in the old currency, so it refuses.
 * Pushes refused for a ledger-currency mismatch are re-queued in the same transaction (`requeued`).
 * Unposted documents are re-converted after commit — applyFxToDocument is idempotent and keeps
 * each document's own rate date, so a crash part-way is repaired by the next edit or re-run. */
export async function changeCompanyCurrency(workspaceId: string, currency: string, actorId: string): Promise<{ count: number; requeued: number }> {
  const { documentIds, requeued } = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM workspaces WHERE id = ${workspaceId}::uuid FOR UPDATE`
    const workspace = await tx.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { country: true, baseCurrency: true, ...lockSelect } })
    if (toLock(workspace).locked) throw new Error("company_currency_locked")
    if (!isAllowedPair(workspace.country, currency)) throw new Error("company_currency_not_allowed")
    if (workspace.baseCurrency === currency) return { documentIds: [], requeued: 0 }
    if (await tx.integrationPush.count({ where: { workspaceId, status: "pending", leaseUntil: { gt: new Date() } } })) throw new Error("company_currency_push_in_flight")

    const documents = await tx.document.findMany({ where: unposted(workspaceId), select: { id: true } })
    await tx.workspace.update({ where: { id: workspaceId }, data: { baseCurrency: currency } })
    const requeued = await requeueLedgerCurrencyFailures(workspaceId, new Date(), tx)
    await recordDocumentAudit({ workspaceId, actorId, type: "company_currency_changed", detail: { from: workspace.baseCurrency, to: currency, count: documents.length, requeued } }, tx)
    return { documentIds: documents.map((d) => d.id), requeued }
  })
  for (const id of documentIds) await applyFxToDocument(id)
  return { count: documentIds.length, requeued }
}
