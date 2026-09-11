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
      id: true, filename: true, status: true, reviewedAt: true, reviewedData: true,
      template: { select: { code: true } },
    },
    orderBy: { receivedAt: "desc" },
    take: limit,
  })
  if (!documents.length) return { bills: [], summary: emptySummary() }

  const documentIds = documents.map((d) => d.id)
  const [paymentStatuses, openCheckTasks, suppliers] = await Promise.all([
    getDocumentPaymentStatuses(input.workspaceId, documentIds),
    prisma.reviewTask.findMany({
      where: { workspaceId: input.workspaceId, documentId: { in: documentIds }, reason: "check_failed", status: { in: ["open", "in_review"] } },
      select: { documentId: true, detail: true },
    }),
    prisma.supplier.findMany({
      where: { workspaceId: input.workspaceId },
      select: { id: true, normalizedKey: true, paymentTermsDays: true },
    }),
  ])

  const supplierByKey = new Map(suppliers.map((s) => [s.normalizedKey, s]))
  const openChecksByDoc = new Map<string, string[]>()
  for (const task of openCheckTasks) {
    const code = task.detail ? task.detail.split(":")[0].trim() : "unknown"
    const list = openChecksByDoc.get(task.documentId) ?? []
    list.push(code)
    openChecksByDoc.set(task.documentId, list)
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
    })
  }

  const filtered = bills.filter((bill) => {
    if (input.onlyBlocked && !bill.blockedByCheck) return false
    if (input.onlyUnpaid && bill.paymentStatus && ["paid", "reconciled"].includes(bill.paymentStatus.toLowerCase())) return false
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

