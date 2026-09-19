// Deliberately NOT a "use server" module: server actions live upstream and do the auth.
import { prisma } from "@/lib/db"
import { recordDocumentAudit } from "@/lib/audit"
import { decimalToNumber } from "@/lib/money"
import { listBillPay, supplierHasBankAccount, type BillPayBillRow as BillPayRow, type BillPayClaimRow } from "@/models/bill-pay"
import { listWorkspaceBills } from "@/models/bills"
import { payerAccountLabel, type PayerAccountRow } from "@/models/payer-accounts"
import { splitBatchName, splitIntoBatches, suggestBatchName } from "@/lib/payments/batch-split"
import { batchView, LIVE_BATCH_STATUSES, type BatchStatus, type BatchView } from "@/lib/payments/batch-status"
import { ELIGIBILITY_COPY } from "@/lib/payments/eligibility"
import { buildRemittanceAdvices, type RemittanceAdvice } from "@/lib/payments/remittance"
import { formatZaEftCsv, validatePaymentInstructions, type PaymentInstruction } from "@/lib/payments/za-eft-csv"
import { openDiscountWindow, type PaymentTerms } from "@/lib/payments/terms"
import type { Prisma } from "@/prisma/client"

/** #229 (#251): the *Payment batch* — `payment_runs` extended. Create (member), approve /
 * reject / download / mark paid (owner). Every write is Server-confirmed and audited; a batch
 * never moves money. */

export type BatchLine = {
  itemId: string
  documentId: string | null
  supplier: string
  invoiceNumber: string | null
  invoiceDate: Date | null
  dueDate: Date | null
  amount: number
  billTotal: number | null
  currencyCode: string
  reference: string
}

export type PaymentBatchRow = {
  id: string
  name: string
  status: BatchStatus
  view: BatchView
  comment: string | null
  createdAt: Date
  submittedBy: { id: string; name: string } | null
  approvedBy: { id: string; name: string } | null
  approvedAt: Date | null
  rejectedBy: { id: string; name: string } | null
  rejectedAt: Date | null
  rejectedReason: string | null
  exportedBy: { id: string; name: string } | null
  exportedAt: Date | null
  paidBy: { id: string; name: string } | null
  paidAt: Date | null
  payFrom: PayerAccountRow | null
  payFromLabel: string
  currencyCode: string
  billCount: number
  total: number
  /** The earliest due date across the batch's bills (#229 Q11's Due column). */
  earliestDue: Date | null
  filename: string
  /** Problems the payment file would have today (a supplier's bank account missing) — the row
   * offers "Fix bank details" instead of a download that would fail. */
  fileProblems: number
  /** Days left on the soonest early-payment discount the batch's lines rely on, while pending —
   * an owner approving after it lapses would be approving a short payment. Null when none. */
  discountExpiresInDays: number | null
}

const USER = { select: { id: true, name: true } } as const
const BATCH_SELECT = {
  id: true, name: true, status: true, comment: true, createdAt: true, filename: true, itemCount: true, totalsJson: true, currencyCode: true,
  submittedBy: USER, approvedBy: USER, approvedAt: true, rejectedBy: USER, rejectedAt: true, rejectedReason: true,
  exportedBy: USER, exportedAt: true, paidBy: USER, paidAt: true, sentAt: true,
  payFromAccount: { select: { id: true, name: true, bankName: true, lastFour: true, currencyCode: true, isDefault: true, archivedAt: true } },
  // All items, active or not: a paid or rejected batch releases its `active` slot (so the invoice
  // can be batched again) but keeps its lines as the record of what it held.
  items: { select: { id: true, documentId: true, expenseClaimId: true, supplier: true, amount: true, currencyCode: true, reference: true, document: { select: { reviewedData: true } } } },
} as const

type BatchRecord = Prisma.PaymentRunGetPayload<{ select: typeof BATCH_SELECT }>

type SupplierFacts = Map<string, { hasBank: boolean; terms: PaymentTerms }>

async function supplierFactsFor(workspaceId: string, batches: BatchRecord[]): Promise<SupplierFacts> {
  const names = [...new Set(batches.flatMap((b) => b.items.map((i) => i.supplier)))]
  if (names.length === 0) return new Map()
  const suppliers = await prisma.supplier.findMany({
    where: { workspaceId, canonicalName: { in: names } },
    select: { canonicalName: true, iban: true, bankDetails: true, paymentTermsDays: true, earlyPaymentDiscountPercent: true, earlyPaymentDiscountDays: true },
  })
  return new Map(suppliers.map((s) => [s.canonicalName, {
    hasBank: supplierHasBankAccount(s),
    terms: { netDays: s.paymentTermsDays, discountPercent: decimalToNumber(s.earlyPaymentDiscountPercent), discountDays: s.earlyPaymentDiscountDays },
  }]))
}

function toRow(batch: BatchRecord, dueByDoc: Map<string, Date | null>, facts: SupplierFacts, now = new Date()): PaymentBatchRow {
  const total = batch.items.reduce((sum, item) => sum + Math.round((decimalToNumber(item.amount) ?? 0) * 100), 0) / 100
  const dues = batch.items.map((item) => (item.documentId ? dueByDoc.get(item.documentId) ?? null : null)).filter((d): d is Date => d !== null)
  const currencyCode = batch.currencyCode ?? batch.items[0]?.currencyCode ?? "ZAR"
  const legacyExportedAt = batch.exportedAt ?? batch.sentAt
  let fileProblems = 0
  let discountExpiresInDays: number | null = null
  for (const item of batch.items) {
    const fact = facts.get(item.supplier)
    if (!fact?.hasBank) fileProblems += 1
    if (!fact) continue
    const values = (item.document?.reviewedData ?? {}) as Record<string, unknown>
    const total = asNumber(values["total"]) ?? asNumber(values["amount"])
    const amount = decimalToNumber(item.amount) ?? 0
    // A line paying less than its bill total on a supplier with discount terms is relying on the window.
    if (total !== null && Math.round(amount * 100) < Math.round(total * 100)) {
      const window = openDiscountWindow({ total, invoiceDate: asDate(values["issue_date"]) ?? asDate(values["date"]), terms: fact.terms, asOf: now })
      const days = window ? window.daysLeft : -1
      if (discountExpiresInDays === null || days < discountExpiresInDays) discountExpiresInDays = days
    }
  }
  return {
    id: batch.id,
    name: batch.name ?? batch.filename?.replace(/\.csv$/, "") ?? batch.id.slice(0, 8),
    status: batch.status as BatchStatus,
    view: batchView(batch.status),
    comment: batch.comment,
    createdAt: batch.createdAt,
    submittedBy: batch.submittedBy,
    approvedBy: batch.approvedBy, approvedAt: batch.approvedAt,
    rejectedBy: batch.rejectedBy, rejectedAt: batch.rejectedAt, rejectedReason: batch.rejectedReason,
    exportedBy: batch.exportedBy, exportedAt: legacyExportedAt,
    paidBy: batch.paidBy, paidAt: batch.paidAt,
    payFrom: batch.payFromAccount,
    payFromLabel: payerAccountLabel(batch.payFromAccount),
    currencyCode,
    billCount: batch.items.length,
    total,
    earliestDue: dues.length ? new Date(Math.min(...dues.map((d) => d.getTime()))) : null,
    filename: batch.filename ?? `${batch.name ?? batch.id}.csv`,
    fileProblems,
    discountExpiresInDays,
  }
}

async function dueDatesFor(workspaceId: string, batches: BatchRecord[]): Promise<Map<string, Date | null>> {
  const ids = [...new Set(batches.flatMap((b) => b.items.map((i) => i.documentId)).filter((id): id is string => !!id))]
  if (ids.length === 0) return new Map()
  // The due date is derived (extracted or inferred from terms), so read it off the bills projection.
  const { bills } = await listWorkspaceBills({ workspaceId, limit: 1000 })
  const map = new Map<string, Date | null>()
  for (const bill of bills) if (ids.includes(bill.documentId)) map.set(bill.documentId, bill.dueDate)
  return map
}

export async function listPaymentBatches(input: { workspaceId: string; view?: BatchView }): Promise<PaymentBatchRow[]> {
  const batches = await prisma.paymentRun.findMany({
    where: { workspaceId: input.workspaceId, ...(input.view ? { status: { in: statusesForView(input.view) } } : {}) },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: BATCH_SELECT,
  })
  const [dueByDoc, facts] = await Promise.all([dueDatesFor(input.workspaceId, batches), supplierFactsFor(input.workspaceId, batches)])
  return batches.map((batch) => toRow(batch, dueByDoc, facts))
}

function statusesForView(view: BatchView): string[] {
  if (view === "approved") return ["approved", "draft", "sent"]
  return [view]
}

export async function countBatchesPendingApproval(workspaceId: string): Promise<number> {
  return prisma.paymentRun.count({ where: { workspaceId, status: "pending_approval" } })
}

export type PaymentBatchDetail = {
  batch: PaymentBatchRow
  lines: BatchLine[]
  /** Lines grouped by supplier, each with its subtotal — the pane's body (#229 Q11). */
  suppliers: Array<{ supplier: string; total: number; lines: BatchLine[] }>
  advices: RemittanceAdvice[]
  audit: Array<{ id: string; type: string; at: Date; actor: string | null; detail: Record<string, unknown> | null }>
  /** Problems the file would have today (a supplier whose bank account was removed since) —
   * shown in the pane, all at once, before Download is offered. */
  fileProblems: string[]
}

export async function getPaymentBatch(input: { workspaceId: string; batchId: string }): Promise<PaymentBatchDetail | null> {
  const batch = await prisma.paymentRun.findFirst({ where: { id: input.batchId, workspaceId: input.workspaceId }, select: BATCH_SELECT })
  if (!batch) return null
  const [dueByDoc, facts, workspace, audit] = await Promise.all([
    dueDatesFor(input.workspaceId, [batch]),
    supplierFactsFor(input.workspaceId, [batch]),
    prisma.workspace.findFirst({ where: { id: input.workspaceId }, select: { name: true } }),
    prisma.documentAuditEvent.findMany({
      where: { workspaceId: input.workspaceId, type: { startsWith: "payment_batch." }, detail: { path: ["batchId"], equals: batch.id } },
      orderBy: { createdAt: "asc" },
      select: { id: true, type: true, createdAt: true, detail: true, actor: { select: { name: true } } },
    }),
  ])
  const row = toRow(batch, dueByDoc, facts)
  const lines: BatchLine[] = batch.items.map((item) => {
    const values = (item.document?.reviewedData ?? {}) as Record<string, unknown>
    return {
      itemId: item.id, documentId: item.documentId, supplier: item.supplier,
      invoiceNumber: asString(values["invoice_number"]),
      invoiceDate: asDate(values["issue_date"]) ?? asDate(values["date"]),
      dueDate: item.documentId ? dueByDoc.get(item.documentId) ?? null : null,
      amount: decimalToNumber(item.amount) ?? 0,
      billTotal: asNumber(values["total"]) ?? asNumber(values["amount"]),
      currencyCode: item.currencyCode, reference: item.reference,
    }
  })
  const bySupplier = new Map<string, BatchLine[]>()
  for (const line of lines) bySupplier.set(line.supplier, [...(bySupplier.get(line.supplier) ?? []), line])
  const suppliers = [...bySupplier.entries()].map(([supplier, group]) => ({ supplier, total: group.reduce((s, l) => s + Math.round(l.amount * 100), 0) / 100, lines: group })).sort((a, b) => a.supplier.localeCompare(b.supplier))
  const { instructions, problems } = await instructionsFor(input.workspaceId, batch)
  const advices = buildRemittanceAdvices(instructions, { name: workspace?.name ?? "Your workspace", runDate: row.approvedAt ?? row.createdAt })
  return {
    batch: row, lines, suppliers, advices,
    audit: audit.map((e) => ({ id: e.id, type: e.type, at: e.createdAt, actor: e.actor?.name ?? null, detail: (e.detail as Record<string, unknown> | null) ?? null })),
    fileProblems: problems,
  }
}

async function instructionsFor(workspaceId: string, batch: BatchRecord): Promise<{ instructions: PaymentInstruction[]; problems: string[] }> {
  const suppliers = await prisma.supplier.findMany({
    where: { workspaceId, canonicalName: { in: [...new Set(batch.items.map((i) => i.supplier))] } },
    select: { canonicalName: true, iban: true, bankDetails: true },
  })
  const bankByName = new Map(suppliers.map((s) => {
    const details = (s.bankDetails ?? {}) as Record<string, unknown>
    const account = typeof details.account === "string" ? details.account : typeof details.iban === "string" ? details.iban : s.iban
    const branchCode = typeof details.branchCode === "string" ? details.branchCode : typeof details.branch === "string" ? details.branch : null
    return [s.canonicalName, { account: typeof account === "string" ? account : null, branchCode }]
  }))
  const instructions: PaymentInstruction[] = batch.items.map((item) => {
    const bank = bankByName.get(item.supplier)
    return { documentId: item.documentId ?? "", supplier: item.supplier, bankAccountNumber: bank?.account ?? null, branchCode: bank?.branchCode ?? null, amount: decimalToNumber(item.amount) ?? 0, currencyCode: item.currencyCode, reference: item.reference }
  })
  return { instructions, problems: validatePaymentInstructions(instructions) }
}

/** The file for Download — regenerated from the stored rows; the download route stamps the
 * export fact. Refuses while the batch is not Approved (the file is a consequence of approval). */
export async function paymentBatchFile(input: { workspaceId: string; batchId: string }): Promise<{ filename: string; csv: string; problems: string[]; status: BatchStatus } | null> {
  const batch = await prisma.paymentRun.findFirst({ where: { id: input.batchId, workspaceId: input.workspaceId }, select: BATCH_SELECT })
  if (!batch) return null
  const { instructions, problems } = await instructionsFor(input.workspaceId, batch)
  return { filename: batch.filename ?? `${batch.name ?? batch.id}.csv`, csv: formatZaEftCsv(instructions), problems, status: batch.status as BatchStatus }
}

// ---------------------------------------------------------------------------------------------

export type CreateBatchesResult = {
  batches: Array<{ id: string; name: string; billCount: number; total: number; currencyCode: string; payFromLabel: string }>
  /** Rows that were selected but not batched, each with the reason — the receipt (#251's
   * inherited fix: `skipped` used to live only in the audit). */
  leftOut: Array<{ documentId: string; supplier: string | null; invoiceNumber: string | null; reason: string }>
}

/** #229 Q1/Q4: creates one Pending-approval batch per (payer account, currency) from the
 * selected Bill Pay rows, copying each row's Amount to pay. Every refusal is data, never a throw
 * to the outage screen: an empty selection or nothing eligible comes back as `leftOut`. */
export async function createPaymentBatches(input: {
  workspaceId: string
  actorId: string
  documentIds: string[]
  name: string | null
  comment: string | null
  now?: Date
}): Promise<CreateBatchesResult> {
  const now = input.now ?? new Date()
  const { rows: allRows } = await listBillPay({ workspaceId: input.workspaceId, asOf: now })
  const rows = allRows.filter((row): row is BillPayRow => row.kind === "bill")
  const selected = new Set(input.documentIds)
  const chosen = rows.filter((row) => selected.has(row.bill.documentId))
  const leftOut: CreateBatchesResult["leftOut"] = []
  for (const id of input.documentIds) if (!chosen.some((r) => r.bill.documentId === id)) leftOut.push({ documentId: id, supplier: null, invoiceNumber: null, reason: "No longer on Bill Pay" })

  const eligible: BillPayRow[] = []
  for (const row of chosen) {
    if (!row.eligibility.eligible) { leftOut.push({ documentId: row.bill.documentId, supplier: row.bill.supplier, invoiceNumber: row.bill.invoiceNumber, reason: ELIGIBILITY_COPY[row.eligibility.reason] }); continue }
    eligible.push(row)
  }
  if (eligible.length === 0) return { batches: [], leftOut }

  const groups = splitIntoBatches(eligible.map((row) => ({ documentId: row.bill.documentId, payFromAccountId: row.payFrom?.id ?? null, currencyCode: (row.bill.currencyCode ?? "ZAR").toUpperCase(), row })))
  const taken = (await prisma.paymentRun.findMany({ where: { workspaceId: input.workspaceId, createdAt: { gte: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000) } }, select: { name: true } })).map((b) => b.name).filter((n): n is string => !!n)
  const baseName = input.name?.trim() || suggestBatchName(now, taken)

  // One transaction: the dialog says "Nothing was created — try again" on failure, so that must be true.
  const created = await prisma.$transaction(async (tx) => {
  const created: CreateBatchesResult["batches"] = []
  for (const [index, group] of groups.entries()) {
    const name = splitBatchName(baseName, groups.length, group.currencyCode, index)
    const payFrom = group.lines[0].row.payFrom
    const total = group.lines.reduce((sum, line) => sum + Math.round((line.row.amountToPay ?? 0) * 100), 0) / 100
    const batch = await tx.paymentRun.create({
      data: {
        workspaceId: input.workspaceId, createdById: input.actorId, submittedById: input.actorId,
        status: "pending_approval", name, comment: input.comment?.trim() || null,
        filename: `${name}.csv`, itemCount: group.lines.length, currencyCode: group.currencyCode,
        payFromAccountId: group.payFromAccountId,
        totalsJson: { [group.currencyCode]: total } as Prisma.InputJsonValue,
        items: {
          create: group.lines.map(({ row }) => ({
            workspaceId: input.workspaceId, documentId: row.bill.documentId, supplier: row.bill.supplier ?? "Unknown supplier",
            amount: row.amountToPay ?? 0, currencyCode: group.currencyCode, reference: row.bill.invoiceNumber ?? row.bill.documentId.slice(0, 8),
          })),
        },
      },
      select: { id: true },
    })
    await recordDocumentAudit({ workspaceId: input.workspaceId, actorId: input.actorId, type: "payment_batch.submitted", detail: { batchId: batch.id, name, billCount: group.lines.length, total, currencyCode: group.currencyCode, payFromAccountId: group.payFromAccountId, leftOut: leftOut.map((l) => ({ documentId: l.documentId, reason: l.reason })) } }, tx)
    for (const { row } of group.lines) {
      await recordDocumentAudit({ workspaceId: input.workspaceId, actorId: input.actorId, documentId: row.bill.documentId, type: "invoice.batched", detail: { batchId: batch.id, name, amount: row.amountToPay } }, tx)
    }
    created.push({ id: batch.id, name, billCount: group.lines.length, total, currencyCode: group.currencyCode, payFromLabel: payerAccountLabel(payFrom) })
  }
  return created
  })
  return { batches: created, leftOut }
}

async function loadForDecision(workspaceId: string, batchId: string) {
  const batch = await prisma.paymentRun.findFirst({ where: { id: batchId, workspaceId }, select: { id: true, status: true, name: true, submittedById: true, items: { where: { active: true }, select: { documentId: true, expenseClaimId: true, amount: true, currencyCode: true } } } })
  if (!batch) throw new Error("payment_batch_not_found")
  return batch
}

export async function approvePaymentBatch(input: { workspaceId: string; actorId: string; batchId: string }): Promise<void> {
  const batch = await loadForDecision(input.workspaceId, input.batchId)
  if (batch.status !== "pending_approval") throw new Error("payment_batch_not_pending")
  const now = new Date()
  await prisma.paymentRun.update({ where: { id: batch.id }, data: { status: "approved", approvedById: input.actorId, approvedAt: now } })
  await recordDocumentAudit({ workspaceId: input.workspaceId, actorId: input.actorId, type: "payment_batch.approved", detail: { batchId: batch.id, selfApproved: batch.submittedById === input.actorId } })
}

export async function rejectPaymentBatch(input: { workspaceId: string; actorId: string; batchId: string; reason: string }): Promise<void> {
  const reason = input.reason.trim()
  if (!reason) throw new Error("reason_required")
  const batch = await loadForDecision(input.workspaceId, input.batchId)
  if (batch.status !== "pending_approval") throw new Error("payment_batch_not_pending")
  const now = new Date()
  await prisma.$transaction([
    prisma.paymentRun.update({ where: { id: batch.id }, data: { status: "rejected", rejectedById: input.actorId, rejectedAt: now, rejectedReason: reason } }),
    // Releases the invoices back to Bill Pay: the unique (workspace, document, active) slot frees.
    prisma.paymentRunItem.updateMany({ where: { runId: batch.id }, data: { active: false } }),
  ])
  await recordDocumentAudit({ workspaceId: input.workspaceId, actorId: input.actorId, type: "payment_batch.rejected", detail: { batchId: batch.id, reason } })
}

/** The download route calls this after streaming the file: a fact on the batch, never a state. */
export async function recordPaymentBatchExport(input: { workspaceId: string; actorId: string; batchId: string }): Promise<void> {
  await prisma.paymentRun.update({ where: { id: input.batchId }, data: { exportedAt: new Date(), exportedById: input.actorId } })
  await recordDocumentAudit({ workspaceId: input.workspaceId, actorId: input.actorId, type: "payment_batch.exported", detail: { batchId: input.batchId } })
}

/** #229 Q6: Mark batch as paid writes one Payment record per line (method `batch`) and stamps
 * the batch Paid. The bills' paid state is derived from those records (ADR 0001). */
export async function markPaymentBatchPaid(input: { workspaceId: string; actorId: string; batchId: string; paidOn: Date; reference: string | null }): Promise<void> {
  const batch = await loadForDecision(input.workspaceId, input.batchId)
  if (!["approved", "draft", "sent"].includes(batch.status)) throw new Error("payment_batch_not_approved")
  const now = new Date()
  const billItems = batch.items.filter((i) => i.documentId)
  const claimItems = batch.items.filter((i) => i.expenseClaimId)
  await prisma.$transaction([
    prisma.paymentRun.update({ where: { id: batch.id }, data: { status: "paid", paidById: input.actorId, paidAt: now } }),
    prisma.invoicePayment.createMany({
      data: billItems.map((item) => ({
        workspaceId: input.workspaceId, documentId: item.documentId!, amount: item.amount, currencyCode: item.currencyCode,
        paidOn: input.paidOn, method: "batch", batchId: batch.id, reference: input.reference?.trim() || null, recordedById: input.actorId,
      })),
    }),
    prisma.expenseClaimPayment.createMany({
      data: claimItems.map((item) => ({
        workspaceId: input.workspaceId, claimId: item.expenseClaimId!, amount: item.amount, currencyCode: item.currencyCode,
        paidOn: input.paidOn, method: "batch", batchId: batch.id, reference: input.reference?.trim() || null, recordedById: input.actorId,
      })),
    }),
    prisma.paymentRunItem.updateMany({ where: { runId: batch.id }, data: { active: false } }),
  ])
  await recordDocumentAudit({ workspaceId: input.workspaceId, actorId: input.actorId, type: "payment_batch.paid", detail: { batchId: batch.id, paidOn: input.paidOn.toISOString().slice(0, 10), reference: input.reference } })
  for (const item of billItems) await recordDocumentAudit({ workspaceId: input.workspaceId, actorId: input.actorId, documentId: item.documentId!, type: "invoice.payment_recorded", detail: { batchId: batch.id, amount: decimalToNumber(item.amount), method: "batch" } })
  for (const item of claimItems) await recordDocumentAudit({ workspaceId: input.workspaceId, actorId: input.actorId, type: "expense_claim.payment_recorded", detail: { batchId: batch.id, claimId: item.expenseClaimId, amount: decimalToNumber(item.amount), method: "batch" } })
}

export type MarkPaidResult = { recorded: Array<{ documentId: string; amount: number }>; leftOut: Array<{ documentId: string; reason: string }> }

/** #229 Q10: the bulk-bar Mark as paid — a manual Payment record per selected Bill Pay row for
 * its current Amount to pay. Scheduled rows are left out (the batch will record them). */
export async function markInvoicesPaid(input: { workspaceId: string; actorId: string; documentIds: string[]; paidOn: Date; reference: string | null }): Promise<MarkPaidResult> {
  const { rows: allRows } = await listBillPay({ workspaceId: input.workspaceId })
  const rows = allRows.filter((row): row is BillPayRow => row.kind === "bill")
  const byId = new Map(rows.map((row) => [row.bill.documentId, row]))
  const recorded: MarkPaidResult["recorded"] = []
  const leftOut: MarkPaidResult["leftOut"] = []
  const toRecord: BillPayRow[] = []
  for (const documentId of input.documentIds) {
    const row = byId.get(documentId)
    if (!row) { leftOut.push({ documentId, reason: "No longer on Bill Pay" }); continue }
    if (row.bill.paidState.state === "scheduled") { leftOut.push({ documentId, reason: "Already in a batch" }); continue }
    if (row.amountToPay === null || row.amountToPay <= 0) { leftOut.push({ documentId, reason: "No amount to pay" }); continue }
    toRecord.push(row)
  }
  await prisma.$transaction(async (tx) => {
    for (const row of toRecord) {
      const documentId = row.bill.documentId
      await tx.invoicePayment.create({
        data: { workspaceId: input.workspaceId, documentId, amount: row.amountToPay!, currencyCode: (row.bill.currencyCode ?? "ZAR").toUpperCase(), paidOn: input.paidOn, method: "manual", reference: input.reference?.trim() || null, recordedById: input.actorId },
      })
      await recordDocumentAudit({ workspaceId: input.workspaceId, actorId: input.actorId, documentId, type: "invoice.payment_recorded", detail: { amount: row.amountToPay, method: "manual", paidOn: input.paidOn.toISOString().slice(0, 10) } }, tx)
      recorded.push({ documentId, amount: row.amountToPay! })
    }
  })
  return { recorded, leftOut }
}

export type MarkClaimsPaidResult = { recorded: Array<{ claimId: string; amount: number }>; leftOut: Array<{ claimId: string; reason: string }> }

/** Claim counterpart of markInvoicesPaid above — same manual-record shape, writing
 * ExpenseClaimPayment instead of InvoicePayment. The claim's total (not a partial) is the amount;
 * claims don't carry an Amount-to-pay override. */
export async function markClaimsPaid(input: { workspaceId: string; actorId: string; claimIds: string[]; paidOn: Date; reference: string | null }): Promise<MarkClaimsPaidResult> {
  const { rows: allRows } = await listBillPay({ workspaceId: input.workspaceId })
  const rows = allRows.filter((row): row is BillPayClaimRow => row.kind === "claim")
  const byId = new Map(rows.map((row) => [row.claim.id, row]))
  const recorded: MarkClaimsPaidResult["recorded"] = []
  const leftOut: MarkClaimsPaidResult["leftOut"] = []
  const toRecord: BillPayClaimRow[] = []
  for (const claimId of input.claimIds) {
    const row = byId.get(claimId)
    if (!row) { leftOut.push({ claimId, reason: "No longer on Bill Pay" }); continue }
    if (!row.eligibility.eligible) { leftOut.push({ claimId, reason: "Missing bank details" }); continue }
    if (row.paidState !== "unpaid") { leftOut.push({ claimId, reason: row.paidState === "scheduled" ? "Already in a batch" : "Already paid" }); continue }
    if (row.claim.total === null || row.claim.total <= 0) { leftOut.push({ claimId, reason: "No amount to pay" }); continue }
    toRecord.push(row)
  }
  await prisma.$transaction(async (tx) => {
    for (const row of toRecord) {
      const claimId = row.claim.id
      await tx.expenseClaimPayment.create({
        data: { workspaceId: input.workspaceId, claimId, amount: row.claim.total!, currencyCode: (row.claim.currencyCode ?? "ZAR").toUpperCase(), paidOn: input.paidOn, method: "manual", reference: input.reference?.trim() || null, recordedById: input.actorId },
      })
      await recordDocumentAudit({ workspaceId: input.workspaceId, actorId: input.actorId, type: "expense_claim.payment_recorded", detail: { claimId, amount: row.claim.total, method: "manual", paidOn: input.paidOn.toISOString().slice(0, 10) } }, tx)
      recorded.push({ claimId, amount: row.claim.total! })
    }
  })
  return { recorded, leftOut }
}

export async function removePaymentRecord(input: { workspaceId: string; actorId: string; paymentId: string; reason: string }): Promise<void> {
  const reason = input.reason.trim()
  if (!reason) throw new Error("reason_required")
  const record = await prisma.invoicePayment.findFirst({ where: { id: input.paymentId, workspaceId: input.workspaceId, removedAt: null }, select: { id: true, documentId: true, amount: true } })
  if (!record) throw new Error("payment_record_not_found")
  await prisma.invoicePayment.update({ where: { id: record.id }, data: { removedAt: new Date(), removedById: input.actorId, removedReason: reason } })
  await recordDocumentAudit({ workspaceId: input.workspaceId, actorId: input.actorId, documentId: record.documentId, type: "invoice.payment_record_removed", detail: { paymentId: record.id, amount: decimalToNumber(record.amount), reason } })
}

/** Every live manual record on one invoice comes off with one reason (an owner recording a
 * payment by hand in error). Records a batch wrote are removed through the batch instead. */
export async function removePaymentRecordsForDocument(input: { workspaceId: string; actorId: string; documentId: string; reason: string }): Promise<{ removed: number; batchHeld: number }> {
  const reason = input.reason.trim()
  if (!reason) throw new Error("reason_required")
  const records = await prisma.invoicePayment.findMany({ where: { workspaceId: input.workspaceId, documentId: input.documentId, removedAt: null }, select: { id: true, amount: true, method: true } })
  const manual = records.filter((r) => r.method === "manual")
  if (manual.length === 0 && records.length === 0) throw new Error("payment_record_not_found")
  const now = new Date()
  await prisma.invoicePayment.updateMany({ where: { id: { in: manual.map((r) => r.id) } }, data: { removedAt: now, removedById: input.actorId, removedReason: reason } })
  for (const record of manual) await recordDocumentAudit({ workspaceId: input.workspaceId, actorId: input.actorId, documentId: input.documentId, type: "invoice.payment_record_removed", detail: { paymentId: record.id, amount: decimalToNumber(record.amount), reason } })
  return { removed: manual.length, batchHeld: records.length - manual.length }
}

export async function removeClaimPaymentRecord(input: { workspaceId: string; actorId: string; paymentId: string; reason: string }): Promise<void> {
  const reason = input.reason.trim()
  if (!reason) throw new Error("reason_required")
  const record = await prisma.expenseClaimPayment.findFirst({ where: { id: input.paymentId, workspaceId: input.workspaceId, removedAt: null }, select: { id: true, claimId: true, amount: true } })
  if (!record) throw new Error("payment_record_not_found")
  await prisma.expenseClaimPayment.update({ where: { id: record.id }, data: { removedAt: new Date(), removedById: input.actorId, removedReason: reason } })
  await recordDocumentAudit({ workspaceId: input.workspaceId, actorId: input.actorId, type: "expense_claim.payment_record_removed", detail: { claimId: record.claimId, paymentId: record.id, amount: decimalToNumber(record.amount), reason } })
}

/** Claim counterpart of removePaymentRecordsForDocument above. */
export async function removePaymentRecordsForClaim(input: { workspaceId: string; actorId: string; claimId: string; reason: string }): Promise<{ removed: number; batchHeld: number }> {
  const reason = input.reason.trim()
  if (!reason) throw new Error("reason_required")
  const records = await prisma.expenseClaimPayment.findMany({ where: { workspaceId: input.workspaceId, claimId: input.claimId, removedAt: null }, select: { id: true, amount: true, method: true } })
  const manual = records.filter((r) => r.method === "manual")
  if (manual.length === 0 && records.length === 0) throw new Error("payment_record_not_found")
  const now = new Date()
  await prisma.expenseClaimPayment.updateMany({ where: { id: { in: manual.map((r) => r.id) } }, data: { removedAt: now, removedById: input.actorId, removedReason: reason } })
  for (const record of manual) await recordDocumentAudit({ workspaceId: input.workspaceId, actorId: input.actorId, type: "expense_claim.payment_record_removed", detail: { claimId: input.claimId, paymentId: record.id, amount: decimalToNumber(record.amount), reason } })
  return { removed: manual.length, batchHeld: records.length - manual.length }
}

/** Un-marks a Paid batch: its payment records come off with one reason and the batch returns to
 * Approved (the file is still a fact). The invoices read Unpaid / Scheduled again. */
export async function unmarkPaymentBatchPaid(input: { workspaceId: string; actorId: string; batchId: string; reason: string }): Promise<void> {
  const reason = input.reason.trim()
  if (!reason) throw new Error("reason_required")
  const batch = await prisma.paymentRun.findFirst({ where: { id: input.batchId, workspaceId: input.workspaceId }, select: { id: true, status: true, items: { select: { id: true, documentId: true, expenseClaimId: true } } } })
  if (!batch) throw new Error("payment_batch_not_found")
  if (batch.status !== "paid") throw new Error("payment_batch_not_paid")
  const now = new Date()
  await prisma.$transaction([
    prisma.invoicePayment.updateMany({ where: { workspaceId: input.workspaceId, batchId: batch.id, removedAt: null }, data: { removedAt: now, removedById: input.actorId, removedReason: reason } }),
    prisma.expenseClaimPayment.updateMany({ where: { workspaceId: input.workspaceId, batchId: batch.id, removedAt: null }, data: { removedAt: now, removedById: input.actorId, removedReason: reason } }),
    prisma.paymentRun.update({ where: { id: batch.id }, data: { status: "approved", paidAt: null, paidById: null } }),
    prisma.paymentRunItem.updateMany({ where: { runId: batch.id }, data: { active: true } }),
  ])
  await recordDocumentAudit({ workspaceId: input.workspaceId, actorId: input.actorId, type: "payment_batch.unpaid", detail: { batchId: batch.id, reason } })
  for (const item of batch.items) {
    if (item.documentId) await recordDocumentAudit({ workspaceId: input.workspaceId, actorId: input.actorId, documentId: item.documentId, type: "invoice.payment_record_removed", detail: { batchId: batch.id, reason } })
    if (item.expenseClaimId) await recordDocumentAudit({ workspaceId: input.workspaceId, actorId: input.actorId, type: "expense_claim.payment_record_removed", detail: { batchId: batch.id, claimId: item.expenseClaimId, reason } })
  }
}

export async function listPaymentRecords(workspaceId: string, documentId: string) {
  const records = await prisma.invoicePayment.findMany({
    where: { workspaceId, documentId, removedAt: null },
    orderBy: { paidOn: "desc" },
    select: { id: true, amount: true, currencyCode: true, paidOn: true, method: true, reference: true, batchId: true, batch: { select: { name: true } }, recordedBy: { select: { name: true } } },
  })
  return records.map((r) => ({ id: r.id, amount: decimalToNumber(r.amount) ?? 0, currencyCode: r.currencyCode, paidOn: r.paidOn, method: r.method as "batch" | "manual", reference: r.reference, batchId: r.batchId, batchName: r.batch?.name ?? null, recordedBy: r.recordedBy?.name ?? null }))
}

export async function listClaimPaymentRecords(workspaceId: string, claimId: string) {
  const records = await prisma.expenseClaimPayment.findMany({
    where: { workspaceId, claimId, removedAt: null },
    orderBy: { paidOn: "desc" },
    select: { id: true, amount: true, currencyCode: true, paidOn: true, method: true, reference: true, batchId: true, batch: { select: { name: true } }, recordedBy: { select: { name: true } } },
  })
  return records.map((r) => ({ id: r.id, amount: decimalToNumber(r.amount) ?? 0, currencyCode: r.currencyCode, paidOn: r.paidOn, method: r.method as "batch" | "manual", reference: r.reference, batchId: r.batchId, batchName: r.batch?.name ?? null, recordedBy: r.recordedBy?.name ?? null }))
}

export { LIVE_BATCH_STATUSES, supplierHasBankAccount }

function asString(v: unknown): string | null { return typeof v === "string" && v.trim() ? v.trim() : null }
function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string") { const n = parseFloat(v.replace(/[^0-9.\-]/g, "")); return Number.isFinite(n) ? n : null }
  return null
}
function asDate(v: unknown): Date | null { if (typeof v !== "string") return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d }
