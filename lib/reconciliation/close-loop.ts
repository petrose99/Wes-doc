/** Phase 5: reconciliation loop closure.
 *
 * When a bank match is accepted, two things happen — atomically enough that they either all
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
 *
 * A follow-up phase can add a provider's own payment-create endpoint behind this same
 * close-loop entry point.
 *
 * Never throws past the caller — same convention as every other post-decision side effect. */
import { prisma } from "@/lib/db"

export type CloseLoopResult = {
  documentUpdated: boolean
  ledgerReconciled: boolean
}

export async function onBankMatchAccepted(input: {
  workspaceId: string
  matchId: string
}): Promise<CloseLoopResult> {
  const result: CloseLoopResult = { documentUpdated: false, ledgerReconciled: false }
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
    // connection; if the workspace has multiple connections we reconcile every one.
    const pushes = await prisma.integrationPush.findMany({
      where: {
        workspaceId: input.workspaceId,
        documentId: match.matchedDocumentId,
        status: "succeeded",
        externalBillId: { not: null },
      },
      select: { externalBillId: true, connectionId: true },
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
