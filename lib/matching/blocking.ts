/** Ditto-style blocking for matching candidate generation — Phase 4.
 *
 * The old resolve.ts scanned the 200 most recent documents in the workspace and read every
 * candidate's `rawExtraction` JSON. Blocking replaces that fixed cap with a targeted union over
 * `DocumentFieldValue`:
 *
 *   1) amount block — every document whose extracted `total` (or `amount`) falls within the same
 *      2% tolerance the engine uses to score matches. `valueNumber` is BTree-indexed on the new
 *      composite `(workspaceId, fieldKey, valueNumber)` index.
 *   2) date block — every document whose date falls inside the engine's date window (±30 days
 *      default). Indexed on `(workspaceId, fieldKey, valueDate)`.
 *   3) PO block — exact match on `po_number` / `purchase_order_number`. Indexed on
 *      `(workspaceId, fieldKey, valueText)`.
 *
 * A document that clears ANY of those three blocks reaches the scorer. When the source has
 * neither amount nor date extracted the blocks would degrade to a full-table scan, so we fall
 * back to the previous recent-200 behavior.
 */
import { prisma } from "@/lib/db"
import { toCents, fromCents } from "@/lib/money"
import { Prisma } from "@/prisma/client"

const AMOUNT_TOLERANCE_PERCENT = 0.02
const DATE_WINDOW_DAYS = 30
const CANDIDATE_HARD_CAP = 2000

const AMOUNT_FIELDS = ["total", "amount"]
const DATE_FIELDS = ["date", "invoice_date", "issue_date", "transaction_date"]
const PO_FIELDS = ["po_number", "purchase_order_number"]

export type BlockingInput = {
  workspaceId: string
  documentId: string
  amount: number | null
  date: string | null
  poNumber: string | null
}

/** Return the candidate documentIds that share at least one block with the source. Excludes the
 * source id. Excludes bank_statement / supplier_statement (matching operates on invoices,
 * receipts, POs and expense receipts — the shape is the same fallback as models/bank-matches.ts). */
export async function candidateDocumentIds(input: BlockingInput): Promise<string[]> {
  const { workspaceId, documentId, amount, date, poNumber } = input
  const ids = new Set<string>()

  const runQuery = async (where: {
    workspaceId: string
    fieldKey: { in: string[] }
    valueNumber?: { gte: number; lte: number }
    valueDate?: { gte: Date; lte: Date }
    valueText?: { in: string[] }
  }) => {
    const rows = await prisma.documentFieldValue.findMany({
      where,
      select: { documentId: true },
      take: CANDIDATE_HARD_CAP,
    })
    for (const row of rows) if (row.documentId !== documentId) ids.add(row.documentId)
  }

  if (amount != null && Number.isFinite(amount)) {
    const cents = toCents(amount)
    // Widen by 2% either side. Work in cents to defuse the 0.1+0.2 float trap.
    const lo = fromCents(Math.round(cents * (1 - AMOUNT_TOLERANCE_PERCENT)))
    const hi = fromCents(Math.round(cents * (1 + AMOUNT_TOLERANCE_PERCENT)))
    await runQuery({
      workspaceId,
      fieldKey: { in: AMOUNT_FIELDS },
      valueNumber: { gte: lo, lte: hi },
    })
  }

  if (date) {
    const d = new Date(date)
    if (!Number.isNaN(d.getTime())) {
      const lo = new Date(d)
      lo.setDate(lo.getDate() - DATE_WINDOW_DAYS)
      const hi = new Date(d)
      hi.setDate(hi.getDate() + DATE_WINDOW_DAYS)
      await runQuery({
        workspaceId,
        fieldKey: { in: DATE_FIELDS },
        valueDate: { gte: lo, lte: hi },
      })
    }
  }

  if (poNumber) {
    await runQuery({
      workspaceId,
      fieldKey: { in: PO_FIELDS },
      valueText: { in: [poNumber] },
    })
  }

  // Fallback: neither amount nor date narrowed anything down (a source that hasn't been fully
  // extracted yet, or a fresh PO with no numbers). Preserve the old recent-200 behavior so
  // recall does not collapse to zero.
  if (!ids.size) {
    const rows = await prisma.document.findMany({
      where: {
        workspaceId,
        id: { not: documentId },
        NOT: { rawExtraction: { equals: Prisma.JsonNull } },
      },
      select: { id: true },
      orderBy: { receivedAt: "desc" },
      take: 200,
    })
    for (const row of rows) ids.add(row.id)
  }

  return [...ids]
}
