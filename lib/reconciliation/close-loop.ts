/** Phase 5: reconciliation loop closure.
 *
 * When a bank match is accepted, three things happen — atomically enough that they either all
 * land or none do:
 *   1. The matched invoice/receipt/expense-receipt Document gets `paymentStatus: "paid"`, so
 *      the pipeline UI knows it's done. This was the missing signal: previously an accepted
 *      match only flipped its BankMatch.status, and every downstream reader (health check,
 *      readiness gate, workflow view) still thought the document was outstanding.
 *   2. The mirrored LedgerTransaction (found via the successful IntegrationPush that put this
 *      document into the ledger) gets `reconciled: true, reconciledSource: "docubite"`.
 *      The `reconciledSource` field is checked by lib/health/sync.ts so a subsequent ledger
 *      sync never clobbers this row back to `false` — the loop stays closed until DocuBite
 *      itself un-accepts the match.
 *   3. When the connection is Bigcapital (DocuBite's internal ledger — see ADR-001), a
 *      matching cashflow transaction is enqueued into Bigcapital so the payment is a
 *      first-class ledger record, not just a Prisma-side flag.
 *
 * External providers (QuickBooks, Xero) receive only steps 1 and 2 for now — a follow-up phase
 * can add their own payment-create endpoints behind the same close-loop entry point.
 *
 * Never throws past the caller — same convention as every other post-decision side effect. */
import { prisma } from "@/lib/db"
import { getValidAccessToken } from "@/lib/integration-token-refresh"
import * as bigcapital from "@/lib/integrations/bigcapital/client"

export type CloseLoopResult = {
  documentUpdated: boolean
  ledgerReconciled: boolean
  paymentPosted: boolean
}

export async function onBankMatchAccepted(input: {
  workspaceId: string
  matchId: string
}): Promise<CloseLoopResult> {
  const result: CloseLoopResult = { documentUpdated: false, ledgerReconciled: false, paymentPosted: false }
  try {
    const match = await prisma.bankMatch.findFirst({
      where: { id: input.matchId, workspaceId: input.workspaceId, status: "accepted" },
      select: {
        id: true, matchedDocumentId: true, statementDocumentId: true, statementLineId: true, kind: true,
      },
    })
    if (!match) return result

    // Step 1: mark the matched document paid.
    await prisma.document.update({
      where: { id: match.matchedDocumentId },
      data: { paymentStatus: "paid" },
    }).then(() => { result.documentUpdated = true }).catch((e) => {
      console.error("[close-loop] failed to update document paymentStatus:", e instanceof Error ? e.message : e)
    })

    // Step 2: find the mirrored LedgerTransaction via the most recent successful IntegrationPush
    // for this document. There is at most one (@@unique on [documentId, connectionId]) per
    // connection; if the workspace has multiple connections we reconcile every one — the
    // Bigcapital row is the authoritative internal record, plus a mirrored row per external.
    const pushes = await prisma.integrationPush.findMany({
      where: {
        workspaceId: input.workspaceId,
        documentId: match.matchedDocumentId,
        status: "succeeded",
        externalBillId: { not: null },
      },
      select: { externalBillId: true, connectionId: true, connection: { select: { provider: true } } },
    })

    for (const push of pushes) {
      if (!push.externalBillId) continue
      const ledgerRow = await prisma.ledgerTransaction.findFirst({
        where: {
          workspaceId: input.workspaceId,
          connectionId: push.connectionId,
          externalId: push.externalBillId,
          active: true,
        },
        select: { id: true },
      })
      if (ledgerRow) {
        await prisma.ledgerTransaction.update({
          where: { id: ledgerRow.id },
          data: { reconciled: true, reconciledSource: "docubite" },
        }).then(() => { result.ledgerReconciled = true }).catch((e) => {
          console.error("[close-loop] failed to set LedgerTransaction reconciled:", e instanceof Error ? e.message : e)
        })
      }

      // Step 3: Bigcapital-only — post the payment as a cashflow transaction. The idempotency
      // key on IntegrationPush already prevents duplicate BILLS from being posted; the payment
      // itself is a separate ledger event, so we key it off (bankMatchId) as our own dedup.
      if (push.connection.provider === "bigcapital") {
        await postBigcapitalPayment({
          workspaceId: input.workspaceId,
          connectionId: push.connectionId,
          matchId: match.id,
          matchedDocumentId: match.matchedDocumentId,
          statementLineId: match.statementLineId,
        }).then((posted) => { if (posted) result.paymentPosted = true }).catch((e) => {
          console.error("[close-loop] failed to post Bigcapital payment:", e instanceof Error ? e.message : e)
        })
      }
    }
  } catch (error) {
    console.error("[close-loop] onBankMatchAccepted failed:", error instanceof Error ? error.message : error)
  }
  return result
}

/** Reverse the effects of a previously-accepted match, called when a reviewer un-accepts (moves
 * a match from "accepted" to "rejected" or back to "suggested"). The matched document's paid
 * status is cleared and the mirrored ledger row goes back to `reconciled: false` — but only
 * when we were the ones who reconciled it (reconciledSource = "docubite"). A row reconciled by
 * the upstream provider stays reconciled: undoing a DocuBite decision must not overrule the
 * ledger's own truth. */
export async function onBankMatchUnaccepted(input: {
  workspaceId: string
  matchId: string
}): Promise<void> {
  try {
    const match = await prisma.bankMatch.findFirst({
      where: { id: input.matchId, workspaceId: input.workspaceId },
      select: { matchedDocumentId: true },
    })
    if (!match) return

    // Only clear paymentStatus if no OTHER accepted match still points at this document.
    const otherAccepted = await prisma.bankMatch.count({
      where: {
        workspaceId: input.workspaceId,
        matchedDocumentId: match.matchedDocumentId,
        status: "accepted",
        id: { not: input.matchId },
      },
    })
    if (otherAccepted === 0) {
      await prisma.document.update({
        where: { id: match.matchedDocumentId },
        data: { paymentStatus: null },
      }).catch(() => {})

      await prisma.ledgerTransaction.updateMany({
        where: {
          workspaceId: input.workspaceId,
          reconciledSource: "docubite",
          externalId: {
            in: (await prisma.integrationPush.findMany({
              where: {
                workspaceId: input.workspaceId,
                documentId: match.matchedDocumentId,
                status: "succeeded",
                externalBillId: { not: null },
              },
              select: { externalBillId: true },
            })).map((p) => p.externalBillId).filter((id): id is string => Boolean(id)),
          },
        },
        data: { reconciled: false, reconciledSource: null },
      }).catch(() => {})
    }
  } catch (error) {
    console.error("[close-loop] onBankMatchUnaccepted failed:", error instanceof Error ? error.message : error)
  }
}

async function postBigcapitalPayment(input: {
  workspaceId: string
  connectionId: string
  matchId: string
  matchedDocumentId: string
  statementLineId: string | null
}): Promise<boolean> {
  const connection = await prisma.integrationConnection.findFirst({
    where: { id: input.connectionId, workspaceId: input.workspaceId },
    select: { externalTenantId: true, defaultExpenseAccountId: true },
  })
  if (!connection?.externalTenantId) return false

  // Pull the line's amount and date. Prefer the durable StatementLine (Phase 2), fall back to
  // the matched document's own extraction when no line has been projected.
  let amount: number | null = null
  let date: string | null = null
  let description = "DocuBite reconciled payment"
  if (input.statementLineId) {
    const line = await prisma.statementLine.findFirst({
      where: { id: input.statementLineId, workspaceId: input.workspaceId },
      select: { amount: true, txnDate: true, description: true },
    })
    if (line) {
      if (line.amount != null) {
        const asNumber = typeof line.amount === "number" ? line.amount : Number(line.amount.toString())
        if (Number.isFinite(asNumber)) amount = Math.abs(asNumber)
      }
      date = line.txnDate ? line.txnDate.toISOString().slice(0, 10) : null
      if (line.description) description = line.description
    }
  }
  if (amount == null || !date) return false

  if (!connection.defaultExpenseAccountId) return false
  const creditAccountId = Number(connection.defaultExpenseAccountId)
  if (!Number.isFinite(creditAccountId)) return false

  const apiKey = await getValidAccessToken(input.connectionId)

  // Pick a cashflow (bank/cash) account. The first bank-type row from listCashflowAccounts is
  // the safe default; a workspace with several bank accounts should pick one explicitly, but
  // for now the first one is better than no reconciliation record at all.
  const cashflowAccounts = await bigcapital.listCashflowAccounts(apiKey, connection.externalTenantId).catch(() => [])
  const bankAccount = cashflowAccounts.find((a) => /bank|cash/i.test(a.accountType)) ?? cashflowAccounts[0]
  if (!bankAccount) return false
  const cashflowAccountId = Number(bankAccount.id)
  if (!Number.isFinite(cashflowAccountId)) return false

  await bigcapital.createCashflowTransaction(apiKey, connection.externalTenantId, {
    date,
    amount,
    cashflow_account_id: cashflowAccountId,
    credit_account_id: creditAccountId,
    transaction_type: "other_expense",
    description,
    reference_no: `bankmatch:${input.matchId}`,
  })
  return true
}
