// Deliberately NOT a "use server" module: server actions live upstream and do the auth. This
// trusts the workspaceId it is handed.
import { prisma } from "@/lib/db"
import { agingBucket, inferDueDate, type AgingBucket } from "@/lib/bills/due-date"
import { getDocumentPaymentStatuses } from "@/models/ledger-payments"
import { normalizeSupplierName } from "@/lib/suppliers/normalize"

/** WP-AP2: AP aging / bills cockpit. One row per Document whose template maps to "invoice" — the
 * shape an AP controller expects on day one: supplier, total, due-date (extracted OR inferred
 * from supplier payment terms), aging bucket, payment status from the ledger sync, and a flag
 * for "blocked by an open check". Everything is derived from data that already lives elsewhere;
 * this is a projection, not a new persisted table. */

export type BillRow = {
  documentId: string
  filename: string
  supplier: string | null
  supplierId: string | null
  total: number | null
  currencyCode: string | null
  invoiceNumber: string | null
  documentDate: Date | null
  extractedDueDate: Date | null
  dueDate: Date | null
  agingBucket: AgingBucket | null
  paymentStatus: string | null
  paidAmount: number | null
  /** When the ledger last confirmed this payment status — the closest thing to a "paid on" date
   * a synced push gives us (there's no separate payment-event table). Null until synced. */
  paidAt: Date | null
  status: string
  reviewedAt: Date | null
  blockedByCheck: boolean
  openCheckCodes: string[]
  /** Invoice Approval, per #211's filter-chip taxonomy. Derived from the document's most recent
   * ReviewTask: "approved" once resolved with no rejection, "rejected" once rejected, "in_progress"
   * while a task is being worked, "not_started" while one sits open/unclaimed, and "approved" by
   * default once the document itself is reviewed with no task at all (nothing left to approve).
   * #220: "cancelled" takes priority over all of the above once `cancelledAt` is set — a cancelled
   * invoice's ReviewTask history stops mattering to this taxonomy. */
  approvalStatus: "not_started" | "in_progress" | "approved" | "rejected" | "cancelled"
  /** #220: when this invoice was terminally cancelled (manual, reason-required, no un-cancel
   * affordance). Null for every non-cancelled invoice. */
  cancelledAt: Date | null
  cancelledReason: string | null
  /** When the document's most recent ReviewTask was opened, but only while it's still open/
   * in_review — null once it resolves (approved/rejected) or if there was never a ReviewTask.
   * #208's Review SLA countdown badge times its clock from this. */
  reviewTaskOpenedAt: Date | null
  /** Per-field extraction confidence (0-1), keyed the same as `reviewedData` ("vendor"/"merchant",
   * "total"/"amount", "invoice_number", "due_date"). Read from `document.confidence.fieldConfidence`
   * — #199/#219's row anatomy underlines every extracted-field cell from it; absent for a field
   * means no confidence was recorded (e.g. manually entered), not zero confidence. */
  fieldConfidence: Record<string, number>
  /** #200: whether this invoice's push went out with no human review — a `push.touchless_enqueued`
   * document-audit event exists for it. Drives the Touchless pill; there is no "pending" state (a
   * document either has the event or it doesn't, nothing to poll for). */
  touchless: boolean
}

export type BillsSummary = Record<AgingBucket | "unknown", { count: number; total: number }>

/** What the Paid tab's header shows — deliberately not the aging summary. A bill that's already
 * paid has no "days outstanding" to report; the story there is how much moved and how recently,
 * not what's still owed. `total`/`last30d` both prefer `paidAmount` (what the ledger says actually
 * settled) and fall back to the extracted `total` for a paid bill the ledger hasn't given an exact
 * amount for. */
export type PaidSummary = {
  total: { count: number; amount: number }
  last30d: { count: number; amount: number }
}

const PAID_STATUSES = new Set(["paid", "reconciled"])

export function summarizePaidBills(bills: BillRow[], asOf = new Date()): PaidSummary {
  const cutoff = new Date(asOf.getTime() - 30 * 24 * 60 * 60 * 1000)
  const summary: PaidSummary = { total: { count: 0, amount: 0 }, last30d: { count: 0, amount: 0 } }
  for (const bill of bills) {
    if (!bill.paymentStatus || !PAID_STATUSES.has(bill.paymentStatus.toLowerCase())) continue
    const amount = bill.paidAmount ?? bill.total ?? 0
    summary.total.count += 1
    summary.total.amount += amount
    if (bill.paidAt && bill.paidAt >= cutoff) {
      summary.last30d.count += 1
      summary.last30d.amount += amount
    }
  }
  return summary
}

/** Loads bills for a workspace. Bounded (up to `limit`, default 500) — a cockpit view is not the
 * place to render every historical invoice a workspace has ever seen. */
export async function listWorkspaceBills(input: {
  workspaceId: string
  asOf?: Date
  limit?: number
  onlyBlocked?: boolean
  onlyUnpaid?: boolean
  /** #211's Status filter-chip group. "unreviewed"/"reviewed" map onto doc.status; there is no
   * model field for the taxonomy's Posted/Exported/Transferred values (no push/ledger status of
   * that shape exists), so "paid" stands in as the only real "closed" state. #220 adds "synced":
   * pushed successfully but not yet confirmed paid by the ledger — see BillRow.paymentStatus. */
  statusFilter?: "unreviewed" | "reviewed" | "synced" | "paid"
  /** #211's Invoice Approval filter-chip group. See BillRow.approvalStatus. */
  approvalFilter?: BillRow["approvalStatus"]
  /** #201's "Touchless" system saved view: rows that went out with no human review. */
  onlyTouchless?: boolean
}): Promise<{ bills: BillRow[]; summary: BillsSummary }> {
  const asOf = input.asOf ?? new Date()
  const limit = input.limit ?? 500

  // Invoice-shape documents only. Ordered newest first — a controller working through the aging
  // list wants the freshest bills at the top before scrolling into stale ones.
  const documents = await prisma.document.findMany({
    where: {
      workspaceId: input.workspaceId,
      status: { notIn: ["received", "queued", "processing", "failed"] },
      template: { code: "invoice" },
    },
    select: {
      id: true, filename: true, status: true, reviewedAt: true, reviewedData: true, confidence: true,
      cancelledAt: true, cancelledReason: true,
      template: { select: { code: true } },
    },
    orderBy: { receivedAt: "desc" },
    take: limit,
  })
  if (!documents.length) return { bills: [], summary: emptySummary() }

  const documentIds = documents.map((d) => d.id)
  const [paymentStatuses, openCheckTasks, suppliers, latestReviewTasks, touchlessEvents] = await Promise.all([
    getDocumentPaymentStatuses(input.workspaceId, documentIds),
    prisma.reviewTask.findMany({
      where: { workspaceId: input.workspaceId, documentId: { in: documentIds }, reason: "check_failed", status: { in: ["open", "in_review"] } },
      select: { documentId: true, detail: true },
    }),
    prisma.supplier.findMany({
      where: { workspaceId: input.workspaceId },
      select: { id: true, normalizedKey: true, paymentTermsDays: true },
    }),
    prisma.reviewTask.findMany({
      where: { workspaceId: input.workspaceId, documentId: { in: documentIds } },
      select: { documentId: true, status: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.documentAuditEvent.findMany({
      where: { workspaceId: input.workspaceId, documentId: { in: documentIds }, type: "push.touchless_enqueued" },
      select: { documentId: true },
    }),
  ])
  const touchlessDocIds = new Set(touchlessEvents.map((e) => e.documentId))

  const supplierByKey = new Map(suppliers.map((s) => [s.normalizedKey, s]))
  const openChecksByDoc = new Map<string, string[]>()
  for (const task of openCheckTasks) {
    const code = task.detail ? task.detail.split(":")[0].trim() : "unknown"
    const list = openChecksByDoc.get(task.documentId) ?? []
    list.push(code)
    openChecksByDoc.set(task.documentId, list)
  }
  // First hit per document wins — the query is already newest-first, so this is each document's
  // most recent ReviewTask of any reason.
  const latestReviewTaskByDoc = new Map<string, { status: "open" | "in_review" | "approved" | "rejected"; createdAt: Date }>()
  for (const task of latestReviewTasks) {
    if (!latestReviewTaskByDoc.has(task.documentId)) latestReviewTaskByDoc.set(task.documentId, { status: task.status as "open" | "in_review" | "approved" | "rejected", createdAt: task.createdAt })
  }

  const bills: BillRow[] = []
  for (const doc of documents) {
    const values = (doc.reviewedData ?? {}) as Record<string, unknown>
    const supplierName = asString(values["vendor"]) ?? asString(values["merchant"])
    const total = asNumber(values["total"]) ?? asNumber(values["amount"])
    const currencyCode = asString(values["currency_code"])
    const invoiceNumber = asString(values["invoice_number"])
    const documentDate = asDate(values["issue_date"]) ?? asDate(values["date"])
    const extractedDueDate = asDate(values["due_date"])
    const supplier = supplierName ? supplierByKey.get(normalizeSupplierName(supplierName)) ?? null : null
    const dueDate = inferDueDate({
      extractedDueDate,
      documentDate,
      supplierPaymentTermsDays: supplier?.paymentTermsDays ?? null,
    })
    const bucket = agingBucket(dueDate, asOf)
    const openChecks = openChecksByDoc.get(doc.id) ?? []
    const paymentRow = paymentStatuses.get(doc.id)
    const latestTask = latestReviewTaskByDoc.get(doc.id)
    const latestTaskStatus = latestTask?.status
    const approvalStatus: BillRow["approvalStatus"] =
      doc.cancelledAt ? "cancelled" :
      latestTaskStatus === "rejected" ? "rejected" :
      latestTaskStatus === "in_review" ? "in_progress" :
      latestTaskStatus === "open" ? "not_started" :
      "approved"
    const reviewTaskOpenedAt = latestTaskStatus === "open" || latestTaskStatus === "in_review" ? latestTask!.createdAt : null
    bills.push({
      documentId: doc.id,
      filename: doc.filename,
      supplier: supplierName,
      supplierId: supplier?.id ?? null,
      total,
      currencyCode,
      invoiceNumber,
      documentDate,
      extractedDueDate,
      dueDate,
      agingBucket: bucket,
      paymentStatus: paymentRow?.paymentStatus ?? null,
      paidAmount: paymentRow?.paidAmount ?? null,
      paidAt: paymentRow?.syncedAt ?? null,
      status: doc.status,
      reviewedAt: doc.reviewedAt,
      blockedByCheck: openChecks.length > 0,
      openCheckCodes: openChecks,
      approvalStatus,
      cancelledAt: doc.cancelledAt,
      cancelledReason: doc.cancelledReason,
      reviewTaskOpenedAt,
      fieldConfidence: (doc.confidence as Record<string, unknown> | null)?.fieldConfidence as Record<string, number> ?? {},
      touchless: touchlessDocIds.has(doc.id),
    })
  }

  const filtered = bills.filter((bill) => {
    if (input.onlyBlocked && !bill.blockedByCheck) return false
    if (input.onlyUnpaid && bill.paymentStatus && ["paid", "reconciled"].includes(bill.paymentStatus.toLowerCase())) return false
    if (input.statusFilter === "unreviewed" && bill.status === "reviewed") return false
    if (input.statusFilter === "reviewed" && bill.status !== "reviewed") return false
    if (input.statusFilter === "synced" && bill.paymentStatus?.toLowerCase() !== "synced") return false
    if (input.statusFilter === "paid" && !(bill.paymentStatus && ["paid", "reconciled"].includes(bill.paymentStatus.toLowerCase()))) return false
    if (input.approvalFilter && bill.approvalStatus !== input.approvalFilter) return false
    if (input.onlyTouchless && !bill.touchless) return false
    return true
  })

  const summary = summarize(filtered)
  return { bills: filtered, summary }
}

function summarize(bills: BillRow[]): BillsSummary {
  const acc = emptySummary()
  for (const bill of bills) {
    const key = bill.agingBucket ?? "unknown"
    acc[key].count += 1
    if (bill.total !== null) acc[key].total += bill.total
  }
  return acc
}

function emptySummary(): BillsSummary {
  return {
    current: { count: 0, total: 0 },
    "1-30": { count: 0, total: 0 },
    "31-60": { count: 0, total: 0 },
    "61-90": { count: 0, total: 0 },
    "90+": { count: 0, total: 0 },
    unknown: { count: 0, total: 0 },
  }
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null
}
function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/[^0-9.\-]/g, ""))
    return Number.isFinite(n) ? n : null
  }
  return null
}
function asDate(v: unknown): Date | null {
  if (typeof v !== "string") return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

