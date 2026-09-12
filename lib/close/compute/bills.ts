/** Loads the workspace's AP-inbound bills into the shared `WorkpaperBill` projection so every
 * close-item computer (aging, accruals, VAT workpaper, LS cross-border) reads a single shape.
 *
 * v1 source set follows #46: bills with `invoiceDate <= periodEnd` and payment not yet
 * recorded, regardless of gate state — a soft or hard gate does NOT filter the bill out; the
 * item's payload carries `gateStatus` so the UI can flag it. Archived documents drop out. */

import type { Prisma, PrismaClient } from "@/prisma/client"
import type { WorkpaperBill } from "@/lib/jurisdictions/_shared"
import { projectWorkpaperBill, type BillSnapshotInput } from "@/lib/jurisdictions/_shared/project-bill"
import { categoryNatureLookup } from "@/models/category-natures"

type PrismaLike = PrismaClient | Prisma.TransactionClient

export type CloseCandidateBill = {
  documentId: string
  bill: WorkpaperBill
  /** ISO string; from `reviewedData.dueDate ?? fieldSnapshot.dueDate ?? null`. Nullable — a
   * bill without a due date buckets into "current" (treated as not yet overdue). */
  dueDate: Date | null
  /** Pass-through of open-gate presence at read time, so the computer can label its row
   * without a second query. `hard-blocking` = ≥1 open hard gate on the doc; `soft` = ≥1
   * open non-hard gate but no hard-blocking; `clear` = no open gates. */
  gateStatus: "clear" | "soft" | "hard-blocking"
}

export type LoadCandidateBillsInput = {
  workspaceId: string
  periodEnd: Date
  workspaceCountry: string
  deferredVatScheme: boolean | null | undefined
}

export async function loadCandidateBills(
  input: LoadCandidateBillsInput,
  client: PrismaLike,
): Promise<CloseCandidateBill[]> {
  // Category-nature lookup for the projection (services vs goods on LS return workpaper).
  const natureRows = await client.categoryNature.findMany({
    where: { workspaceId: input.workspaceId },
    select: { id: true, category: true, nature: true },
  })
  const getCategoryNature = categoryNatureLookup(
    natureRows.flatMap((r) => (r.nature === "goods" || r.nature === "services"
      ? [{ id: r.id, category: r.category, nature: r.nature }]
      : [])),
  )

  const docs = await client.document.findMany({
    where: {
      workspaceId: input.workspaceId,
      // Only real inbound bills — archived or draft documents are out.
      archivedAt: null,
      docType: "invoice",
      paymentConfirmedAt: null,
    },
    select: {
      id: true,
      reviewedData: true,
      fieldSnapshot: true,
      gates: {
        where: { state: "blocked" },
        select: { severity: true },
      },
    },
  })

  const out: CloseCandidateBill[] = []
  for (const d of docs) {
    const reviewed = (d.reviewedData ?? null) as BillSnapshotInput | null
    const snapshot = (d.fieldSnapshot ?? null) as BillSnapshotInput | null

    const bill = projectWorkpaperBill(
      reviewed,
      snapshot,
      {
        country: input.workspaceCountry,
        getCategoryNature,
        deferredVatScheme: input.deferredVatScheme ?? null,
      },
      d.id,
    )
    if (!bill) continue

    // #46: "invoice-date ≤ period-end AND payment-not-yet-recorded". Newer bills carry over
    // to next period; the payment predicate is already enforced above (paymentConfirmedAt).
    if (bill.invoiceDate.getTime() > input.periodEnd.getTime()) continue

    const reviewedRec = reviewed as Record<string, unknown> | null
    const snapshotRec = snapshot as Record<string, unknown> | null
    const dueDateRaw = pickDate(reviewedRec?.dueDate) ?? pickDate(snapshotRec?.dueDate)
    let gateStatus: CloseCandidateBill["gateStatus"] = "clear"
    for (const g of d.gates) {
      if (g.severity === "hard") { gateStatus = "hard-blocking"; break }
      gateStatus = "soft"
    }

    out.push({
      documentId: d.id,
      bill,
      dueDate: dueDateRaw,
      gateStatus,
    })
  }

  return out
}

function pickDate(v: unknown): Date | null {
  if (v == null) return null
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v
  if (typeof v !== "string") return null
  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d
}
