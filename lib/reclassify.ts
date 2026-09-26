import { prisma } from "@/lib/db"
import { getActiveWorkflowStageState } from "@/models/review-tasks"
import { getDocumentPaymentStatuses } from "@/models/ledger-payments"
import { derivePaidState } from "@/lib/payments/paid-state"
import { getLiveAllocationsByInvoice } from "@/models/credits"
import { LIVE_BATCH_STATUSES, type BatchStatus } from "@/lib/payments/batch-status"
import { summarizePoConsumption } from "@/models/po-matching"
import { decimalToNumber } from "@/lib/money"

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string") { const n = Number(v); return Number.isFinite(n) ? n : null }
  return null
}

/** #297 (Wayfinder map #226): the three preconditions that block moving a document to another
 * queue, one function so `reclassifyDocumentAction`'s server guard and the pane's
 * `moveDisabledReason` (assembled wherever `RegisteredDocument` is built) share the exact same
 * caption — never duplicated prose (B3), never re-derived client-side (lesson docubite#257 B1). */
export async function describeMoveIneligibility(
  workspaceId: string,
  documentId: string,
  docType: string,
): Promise<string | null> {
  const document = await prisma.document.findFirst({
    where: { id: documentId, workspaceId },
    select: { id: true, filename: true, reviewedData: true },
  })
  if (!document) return null

  const stageState = await getActiveWorkflowStageState(workspaceId, documentId)
  if (stageState) return `Can't move ${document.filename} while an approval is pending.`

  const [paymentStatuses, records, batchItems, allocationsByInvoice] = await Promise.all([
    getDocumentPaymentStatuses(workspaceId, [documentId]),
    prisma.invoicePayment.findMany({ where: { workspaceId, documentId, removedAt: null }, select: { amount: true } }),
    prisma.paymentRunItem.findMany({
      where: { workspaceId, documentId, active: true, run: { status: { in: [...LIVE_BATCH_STATUSES] } } },
      select: { run: { select: { status: true } } },
    }),
    getLiveAllocationsByInvoice(workspaceId, [documentId]),
  ])
  const paymentRow = paymentStatuses.get(documentId)
  if (paymentRow?.paymentStatus?.toLowerCase() === "posted") return `Can't move ${document.filename} — it's already Posted.`
  const values = (document.reviewedData ?? {}) as Record<string, unknown>
  const total = asNumber(values["total"]) ?? asNumber(values["amount"])
  const paidState = derivePaidState({
    ledgerStatus: paymentRow?.paymentStatus ?? null,
    ledgerPaidAmount: paymentRow?.paidAmount ?? null,
    total,
    records: records.map((r) => ({ amount: decimalToNumber(r.amount) ?? 0 })),
    allocations: allocationsByInvoice.get(documentId) ?? [],
    batchStatus: (batchItems[0]?.run.status as BatchStatus) ?? null,
  })
  if (paidState.state === "paid") return `Can't move ${document.filename} — it's already Paid.`
  if (paidState.state === "credited") return `Can't move ${document.filename} — it's already Credited.`

  if (docType === "purchase_order") {
    const consumption = await summarizePoConsumption(workspaceId, [documentId])
    if ((consumption.get(documentId)?.invoices.length ?? 0) > 0) return "Unmatch its invoices first."
  }

  return null
}
