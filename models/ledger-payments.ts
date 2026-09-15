import { prisma } from "@/lib/db"
import { decimalToNumber } from "@/lib/money"

export type DocumentPaymentStatus = {
  paymentStatus: string | null
  dueAmount: number | null
  paidAmount: number | null
  syncedAt: Date
}

export async function getDocumentPaymentStatuses(
  workspaceId: string,
  documentIds: string[],
): Promise<Map<string, DocumentPaymentStatus>> {
  if (!documentIds.length) return new Map()

  const pushes = await prisma.integrationPush.findMany({
    where: { workspaceId, documentId: { in: documentIds }, status: "succeeded", externalBillId: { not: null } },
    select: { documentId: true, externalBillId: true, connectionId: true, externalRecordKind: true, completedAt: true },
  })
  if (!pushes.length) return new Map()

  const connectionIds = [...new Set(pushes.map((p) => p.connectionId))]
  const externalIds = pushes.map((p) => p.externalBillId!).filter(Boolean)
  const ledgerRows = await prisma.ledgerTransaction.findMany({
    where: {
      workspaceId,
      connectionId: { in: connectionIds },
      kind: { in: ["bill", "invoice"] },
      active: true,
      externalId: { in: externalIds },
    },
    select: { connectionId: true, externalId: true, kind: true, paymentStatus: true, dueAmount: true, paidAmount: true, syncedAt: true },
  })

  const ledgerByKey = new Map(ledgerRows.map((row) => [`${row.connectionId}:${row.externalId}`, row]))

  const result = new Map<string, DocumentPaymentStatus>()
  for (const push of pushes) {
    const row = ledgerByKey.get(`${push.connectionId}:${push.externalBillId}`)
    if (row?.paymentStatus) {
      result.set(push.documentId, {
        paymentStatus: row.paymentStatus,
        dueAmount: decimalToNumber(row.dueAmount),
        paidAmount: decimalToNumber(row.paidAmount),
        syncedAt: row.syncedAt,
      })
    } else {
      // #220: the push itself succeeded (accounting has the record) but the ledger sync hasn't
      // confirmed a payment status yet — either the ledger hasn't pulled this record down, or it
      // has and simply reports no status. Surfaced as its own "synced" value rather than left out
      // of the map entirely, so a pushed-but-unconfirmed invoice isn't invisible in the UI.
      result.set(push.documentId, {
        paymentStatus: "synced",
        dueAmount: row ? decimalToNumber(row.dueAmount) : null,
        paidAmount: row ? decimalToNumber(row.paidAmount) : null,
        syncedAt: row?.syncedAt ?? push.completedAt ?? new Date(),
      })
    }
  }
  return result
}
