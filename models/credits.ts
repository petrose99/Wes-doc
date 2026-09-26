// Deliberately NOT a "use server" module: server actions live upstream and do the auth (Owner-only
// checks for void/change live at the action layer, same convention as models/bills.ts).
import { prisma } from "@/lib/db"
import { recordDocumentAudit } from "@/lib/audit"
import { decimalToNumber } from "@/lib/money"
import { normalizeSupplierName } from "@/lib/suppliers/normalize"
import { resolveDocType } from "@/lib/doc-types"
import { LIVE_BATCH_STATUSES, type BatchStatus } from "@/lib/payments/batch-status"
import { capAllocationAmount, proposeAllocation, refuseIfOpenLine } from "@/lib/credits/allocation"

/** Wayfinder map #445, #463 (ADR 0017): Credit allocations link a credit note to the invoice it
 * reduces. Never a Payment record, never touching a Payment line — see `lib/credits/allocation.ts`
 * for the shared pure rules this model is a thin I/O layer over. */

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}
function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") { const n = Number(value); return Number.isFinite(n) ? n : null }
  return null
}

type CreditAllocationFailure =
  | "credit_note_not_found"
  | "invoice_not_found"
  | "supplier_mismatch"
  | "open_payment_line"
  | "nothing_to_allocate"
  | "allocation_not_found"
  | "reason_required"

async function hasOpenPaymentLine(workspaceId: string, invoiceId: string): Promise<boolean> {
  const items = await prisma.paymentRunItem.findMany({
    where: { workspaceId, documentId: invoiceId, active: true, run: { status: { in: [...LIVE_BATCH_STATUSES] } } },
    select: { id: true },
  })
  return items.length > 0
}

async function liveAllocationsTotal(workspaceId: string, field: "creditNoteId" | "invoiceId", id: string): Promise<number> {
  const rows = await prisma.creditAllocation.findMany({ where: { workspaceId, [field]: id, removedAt: null }, select: { amount: true } })
  return rows.reduce((sum, row) => sum + (decimalToNumber(row.amount) ?? 0), 0)
}

type LoadedDocument = { id: string; total: number | null; supplier: string | null; docType: string | null }

async function loadDocument(workspaceId: string, documentId: string): Promise<LoadedDocument | null> {
  const document = await prisma.document.findFirst({
    where: { id: documentId, workspaceId },
    select: { id: true, docType: true, reviewedData: true, template: { select: { code: true } } },
  })
  if (!document) return null
  const values = (document.reviewedData ?? {}) as Record<string, unknown>
  const docType = resolveDocType({ docType: document.docType, template: document.template })
  // Both invoice and credit_note checkFields map supplier to "vendor" (lib/doc-types.ts).
  return { id: document.id, total: asNumber(values["total"]), supplier: asString(values["vendor"]), docType }
}

/** Allocates a credit note against an invoice — caps to the smaller of what's requested, the
 * invoice's remaining due, and the credit note's remaining balance; refuses when the invoice has
 * an open Payment batch line. */
export async function createCreditAllocation(input: {
  workspaceId: string
  creditNoteId: string
  invoiceId: string
  amount: number
  actorId: string
}): Promise<{ ok: true; id: string } | { ok: false; reason: CreditAllocationFailure }> {
  const [creditNote, invoice] = await Promise.all([
    loadDocument(input.workspaceId, input.creditNoteId),
    loadDocument(input.workspaceId, input.invoiceId),
  ])
  if (!creditNote) return { ok: false, reason: "credit_note_not_found" }
  if (!invoice) return { ok: false, reason: "invoice_not_found" }
  if (normalizeSupplierName(creditNote.supplier) !== normalizeSupplierName(invoice.supplier)) {
    return { ok: false, reason: "supplier_mismatch" }
  }
  const openLine = await refuseIfOpenLine({ hasOpenPaymentLine: await hasOpenPaymentLine(input.workspaceId, input.invoiceId) })
  if (!openLine.ok) return openLine

  const [creditAllocated, invoiceRecords, invoiceAllocated] = await Promise.all([
    liveAllocationsTotal(input.workspaceId, "creditNoteId", input.creditNoteId),
    prisma.invoicePayment.findMany({ where: { workspaceId: input.workspaceId, documentId: input.invoiceId, removedAt: null }, select: { amount: true } }),
    liveAllocationsTotal(input.workspaceId, "invoiceId", input.invoiceId),
  ])
  const creditRemaining = (creditNote.total ?? 0) - creditAllocated
  const recordedAmount = invoiceRecords.reduce((sum, record) => sum + (decimalToNumber(record.amount) ?? 0), 0)
  const invoiceDue = Math.max(0, (invoice.total ?? 0) - recordedAmount - invoiceAllocated)
  const amount = capAllocationAmount({ requestedAmount: input.amount, invoiceDue, creditRemaining })
  if (amount <= 0) return { ok: false, reason: "nothing_to_allocate" }

  const created = await prisma.$transaction(async (tx) => {
    const allocation = await tx.creditAllocation.create({
      data: { workspaceId: input.workspaceId, creditNoteId: input.creditNoteId, invoiceId: input.invoiceId, amount, createdById: input.actorId },
    })
    const detail = { allocationId: allocation.id, creditNoteId: input.creditNoteId, invoiceId: input.invoiceId, amount }
    await recordDocumentAudit({ workspaceId: input.workspaceId, actorId: input.actorId, documentId: input.creditNoteId, type: "credit_allocation_created", detail }, tx)
    await recordDocumentAudit({ workspaceId: input.workspaceId, actorId: input.actorId, documentId: input.invoiceId, type: "credit_allocation_created", detail }, tx)
    return allocation
  })
  return { ok: true, id: created.id }
}

/** Owner-only at the call site (Standards #5): removes a live allocation, refusing when the
 * invoice it feeds has an open Payment batch line. */
export async function voidCreditAllocation(input: {
  workspaceId: string
  allocationId: string
  actorId: string
  reason: string
}): Promise<{ ok: true } | { ok: false; reason: CreditAllocationFailure }> {
  const reason = input.reason.trim()
  if (!reason) return { ok: false, reason: "reason_required" }
  const allocation = await prisma.creditAllocation.findFirst({
    where: { id: input.allocationId, workspaceId: input.workspaceId, removedAt: null },
    select: { id: true, creditNoteId: true, invoiceId: true, amount: true },
  })
  if (!allocation) return { ok: false, reason: "allocation_not_found" }
  const openLine = await refuseIfOpenLine({ hasOpenPaymentLine: await hasOpenPaymentLine(input.workspaceId, allocation.invoiceId) })
  if (!openLine.ok) return openLine

  await prisma.$transaction(async (tx) => {
    await tx.creditAllocation.update({ where: { id: allocation.id }, data: { removedAt: new Date(), removedById: input.actorId, removedReason: reason } })
    const detail = { allocationId: allocation.id, amount: decimalToNumber(allocation.amount), reason }
    await recordDocumentAudit({ workspaceId: input.workspaceId, actorId: input.actorId, documentId: allocation.creditNoteId, type: "credit_allocation_voided", detail }, tx)
    await recordDocumentAudit({ workspaceId: input.workspaceId, actorId: input.actorId, documentId: allocation.invoiceId, type: "credit_allocation_voided", detail }, tx)
  })
  return { ok: true }
}

/** Post-approval amount edit — same Owner+reason+audit shape as voidCreditAllocation, only
 * reachable once the credit note is approved (the action layer checks that against the document's
 * reviewedAt/approval status before calling this, the same gate describeMoveIneligibility reads). */
export async function changeCreditAllocation(input: {
  workspaceId: string
  allocationId: string
  amount: number
  actorId: string
  reason: string
}): Promise<{ ok: true } | { ok: false; reason: CreditAllocationFailure }> {
  const reason = input.reason.trim()
  if (!reason) return { ok: false, reason: "reason_required" }
  const allocation = await prisma.creditAllocation.findFirst({
    where: { id: input.allocationId, workspaceId: input.workspaceId, removedAt: null },
    select: { id: true, creditNoteId: true, invoiceId: true, amount: true },
  })
  if (!allocation) return { ok: false, reason: "allocation_not_found" }
  const openLine = await refuseIfOpenLine({ hasOpenPaymentLine: await hasOpenPaymentLine(input.workspaceId, allocation.invoiceId) })
  if (!openLine.ok) return openLine
  if (input.amount <= 0) return { ok: false, reason: "nothing_to_allocate" }

  await prisma.$transaction(async (tx) => {
    await tx.creditAllocation.update({ where: { id: allocation.id }, data: { amount: input.amount } })
    const detail = { allocationId: allocation.id, from: decimalToNumber(allocation.amount), to: input.amount, reason }
    await recordDocumentAudit({ workspaceId: input.workspaceId, actorId: input.actorId, documentId: allocation.creditNoteId, type: "credit_allocation_changed", detail }, tx)
    await recordDocumentAudit({ workspaceId: input.workspaceId, actorId: input.actorId, documentId: allocation.invoiceId, type: "credit_allocation_changed", detail }, tx)
  })
  return { ok: true }
}

/** Owner-only at the call site: refuses if any allocated invoice has an open Payment batch line;
 * else voids every live allocation on this credit note first (each audited), then cancels the
 * credit note itself (the existing cancelledAt/cancelledReason columns — no new column, same as
 * #220's invoice cancel). */
export async function voidCreditNote(input: {
  workspaceId: string
  documentId: string
  actorId: string
  reason: string
}): Promise<{ ok: true } | { ok: false; reason: CreditAllocationFailure }> {
  const reason = input.reason.trim()
  if (!reason) return { ok: false, reason: "reason_required" }
  const allocations = await prisma.creditAllocation.findMany({
    where: { workspaceId: input.workspaceId, creditNoteId: input.documentId, removedAt: null },
    select: { id: true, invoiceId: true, amount: true },
  })
  for (const allocation of allocations) {
    if (await hasOpenPaymentLine(input.workspaceId, allocation.invoiceId)) return { ok: false, reason: "open_payment_line" }
  }

  await prisma.$transaction(async (tx) => {
    const now = new Date()
    for (const allocation of allocations) {
      await tx.creditAllocation.update({ where: { id: allocation.id }, data: { removedAt: now, removedById: input.actorId, removedReason: reason } })
      const detail = { allocationId: allocation.id, amount: decimalToNumber(allocation.amount), reason }
      await recordDocumentAudit({ workspaceId: input.workspaceId, actorId: input.actorId, documentId: input.documentId, type: "credit_allocation_voided", detail }, tx)
      await recordDocumentAudit({ workspaceId: input.workspaceId, actorId: input.actorId, documentId: allocation.invoiceId, type: "credit_allocation_voided", detail }, tx)
    }
    await tx.document.update({ where: { id: input.documentId }, data: { cancelledAt: now, cancelledReason: reason } })
    await recordDocumentAudit({ workspaceId: input.workspaceId, actorId: input.actorId, documentId: input.documentId, type: "credit_note_voided", detail: { reason } }, tx)
  })
  return { ok: true }
}

/** Per normalized supplier key, the sum of (credit note total) − (its live allocations) across
 * every live (not cancelled) credit note for that supplier. Feeds the Bill Pay Payee subtitle
 * (Step 3). */
export async function getSupplierCreditAvailable(workspaceId: string, supplierKeys: string[]): Promise<Map<string, number>> {
  const wanted = new Set(supplierKeys.map((key) => normalizeSupplierName(key)).filter((key): key is string => Boolean(key)))
  const result = new Map<string, number>()
  if (wanted.size === 0) return result

  const creditNotes = await prisma.document.findMany({
    where: { workspaceId, docType: "credit_note", cancelledAt: null },
    select: { id: true, reviewedData: true },
  })
  const relevant = creditNotes
    .map((doc) => {
      const values = (doc.reviewedData ?? {}) as Record<string, unknown>
      const supplierKey = normalizeSupplierName(asString(values["vendor"]))
      return { id: doc.id, supplierKey, total: asNumber(values["total"]) ?? 0 }
    })
    .filter((doc) => doc.supplierKey && wanted.has(doc.supplierKey))
  if (relevant.length === 0) return result

  const allocated = await prisma.creditAllocation.findMany({
    where: { workspaceId, creditNoteId: { in: relevant.map((doc) => doc.id) }, removedAt: null },
    select: { creditNoteId: true, amount: true },
  })
  const allocatedByCreditNote = new Map<string, number>()
  for (const row of allocated) {
    allocatedByCreditNote.set(row.creditNoteId, (allocatedByCreditNote.get(row.creditNoteId) ?? 0) + (decimalToNumber(row.amount) ?? 0))
  }
  for (const doc of relevant) {
    const remaining = Math.max(0, doc.total - (allocatedByCreditNote.get(doc.id) ?? 0))
    result.set(doc.supplierKey!, (result.get(doc.supplierKey!) ?? 0) + remaining)
  }
  return result
}

/** Q9: called from `models/review-tasks.ts` the moment a credit note's review task resolves to
 * "approved" — proposes against the workspace's open invoices for the same supplier and, on an
 * exact match, allocates automatically (actor = the approver). A no-op for anything that isn't a
 * credit note, or that proposes no match. Never throws past the caller: an approval must succeed
 * even if the auto-propose step fails.
 *
 * ponytail: scans every open invoice in the workspace to build candidates (fine at today's
 * per-workspace invoice counts); if this becomes a hot path at scale, index by normalized supplier
 * key the way getSupplierCreditAvailable does instead of loading every invoice. */
export async function proposeAllocationOnApproval(input: { workspaceId: string; documentId: string; actorId: string }): Promise<void> {
  try {
    const creditNote = await loadDocument(input.workspaceId, input.documentId)
    if (!creditNote || creditNote.docType !== "credit_note") return
    const document = await prisma.document.findFirst({ where: { id: input.documentId, workspaceId: input.workspaceId }, select: { reviewedData: true } })
    const citedInvoiceNumber = asString((document?.reviewedData as Record<string, unknown> | null)?.["credited_invoice_number"])
    if (!citedInvoiceNumber) return
    const creditAllocated = await liveAllocationsTotal(input.workspaceId, "creditNoteId", input.documentId)
    const creditRemaining = (creditNote.total ?? 0) - creditAllocated
    if (creditRemaining <= 0) return

    const openInvoices = await prisma.document.findMany({
      where: { workspaceId: input.workspaceId, docType: "invoice", cancelledAt: null },
      select: { id: true, reviewedData: true },
    })
    const candidates = await Promise.all(openInvoices.map(async (doc) => {
      const values = (doc.reviewedData ?? {}) as Record<string, unknown>
      const [records, allocated] = await Promise.all([
        prisma.invoicePayment.findMany({ where: { workspaceId: input.workspaceId, documentId: doc.id, removedAt: null }, select: { amount: true } }),
        liveAllocationsTotal(input.workspaceId, "invoiceId", doc.id),
      ])
      const recordedAmount = records.reduce((sum, record) => sum + (decimalToNumber(record.amount) ?? 0), 0)
      const due = Math.max(0, (asNumber(values["total"]) ?? 0) - recordedAmount - allocated)
      return { documentId: doc.id, invoiceNumber: asString(values["invoice_number"]), supplier: asString(values["vendor"]), due }
    }))

    const proposal = proposeAllocation({ creditNote: { citedInvoiceNumber, supplier: creditNote.supplier, remaining: creditRemaining }, candidates })
    if (!proposal) return
    await createCreditAllocation({ workspaceId: input.workspaceId, creditNoteId: input.documentId, invoiceId: proposal.documentId, amount: proposal.amount, actorId: input.actorId })
  } catch (error) {
    console.error("[credits] propose-on-approval failed:", error instanceof Error ? error.message : error)
  }
}
