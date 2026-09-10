// Deliberately NOT a "use server" module: server actions live upstream and do the auth.
import { prisma } from "@/lib/db"
import { recordSystemAudit } from "@/lib/audit"
import { listWorkspaceBills } from "@/models/bills"
import { formatZaEftCsv, paymentRunFilename, totalsByCurrency, type PaymentInstruction } from "@/lib/payments/za-eft-csv"
import { buildRemittanceAdvices, type RemittanceAdvice } from "@/lib/payments/remittance"
import type { Prisma } from "@/prisma/client"

export type PreparePaymentRunResult = {
  run: { id: string; filename: string; itemCount: number; totalsByCurrency: Record<string, number> }
  csv: string
  advices: RemittanceAdvice[]
}

/** WP-AP2: prepares a payment run from the given bills for this workspace. Filters out bills
 * that are already in an active (non-cancelled) run so the same invoice isn't paid twice, and
 * returns the generated CSV + per-supplier remittance advices. Never itself moves money — the
 * user takes the CSV to their bank's own portal.
 *
 * Bills without a supplier bank account are dropped from the run rather than blocking it — the
 * caller renders the "N bills need a bank account" hint separately. */
export async function preparePaymentRun(input: {
  workspaceId: string
  actorId: string
  documentIds: string[]
  now?: Date
}): Promise<PreparePaymentRunResult> {
  const now = input.now ?? new Date()
  if (input.documentIds.length === 0) throw new Error("no_documents_selected")

  const { bills } = await listWorkspaceBills({ workspaceId: input.workspaceId, limit: 1000 })
  const selectedIds = new Set(input.documentIds)
  const selected = bills.filter((b) => selectedIds.has(b.documentId))

  const alreadyInRun = await prisma.paymentRunItem.findMany({
    where: { workspaceId: input.workspaceId, documentId: { in: input.documentIds }, active: true },
    select: { documentId: true },
  })
  const alreadyIds = new Set(alreadyInRun.map((r) => r.documentId).filter(Boolean) as string[])

  const suppliers = await prisma.supplier.findMany({
    where: { workspaceId: input.workspaceId, id: { in: selected.map((b) => b.supplierId).filter((id): id is string => id !== null) } },
    select: { id: true, iban: true, bankDetails: true },
  })
  const bankBySupplier = new Map(suppliers.map((s) => {
    const details = (s.bankDetails ?? {}) as Record<string, unknown>
    const account = typeof details.account === "string" ? details.account : (typeof details.iban === "string" ? details.iban : (typeof s.iban === "string" ? s.iban : null))
    const branchCode = typeof details.branchCode === "string" ? details.branchCode : (typeof details.branch === "string" ? details.branch : null)
    return [s.id, { account, branchCode }]
  }))

  const instructions: PaymentInstruction[] = []
  const skipped: Array<{ documentId: string; reason: string }> = []
  for (const bill of selected) {
    if (alreadyIds.has(bill.documentId)) { skipped.push({ documentId: bill.documentId, reason: "already_in_active_run" }); continue }
    if (bill.total === null || bill.total <= 0) { skipped.push({ documentId: bill.documentId, reason: "missing_amount" }); continue }
    if (!bill.supplier) { skipped.push({ documentId: bill.documentId, reason: "missing_supplier" }); continue }
    const bank = bill.supplierId ? bankBySupplier.get(bill.supplierId) : null
    if (!bank?.account) { skipped.push({ documentId: bill.documentId, reason: "missing_bank_account" }); continue }
    instructions.push({
      documentId: bill.documentId,
      supplier: bill.supplier,
      bankAccountNumber: bank.account,
      branchCode: bank.branchCode ?? null,
      amount: bill.total,
      currencyCode: (bill.currencyCode ?? "ZAR").toUpperCase(),
      reference: bill.invoiceNumber ?? bill.documentId.slice(0, 8),
    })
  }

  if (instructions.length === 0) throw new Error("no_payable_bills_after_filtering")

  const csv = formatZaEftCsv(instructions)
  const filename = paymentRunFilename(now)
  const totals = totalsByCurrency(instructions)

  const workspace = await prisma.workspace.findFirst({ where: { id: input.workspaceId }, select: { name: true } })
  const advices = buildRemittanceAdvices(instructions, { name: workspace?.name ?? "Your workspace", runDate: now })

  const run = await prisma.paymentRun.create({
    data: {
      workspaceId: input.workspaceId,
      createdById: input.actorId,
      status: "draft",
      filename,
      itemCount: instructions.length,
      totalsJson: totals as unknown as Prisma.InputJsonValue,
      items: {
        create: instructions.map((ins) => ({
          workspaceId: input.workspaceId,
          documentId: ins.documentId,
          supplier: ins.supplier,
          amount: ins.amount,
          currencyCode: ins.currencyCode,
          reference: ins.reference,
        })),
      },
    },
    select: { id: true, filename: true, itemCount: true },
  })

  await recordSystemAudit({
    workspaceId: input.workspaceId,
    type: "payment_run_prepared",
    detail: { runId: run.id, itemCount: run.itemCount, skipped, totalsByCurrency: totals },
  })

  return {
    run: { id: run.id, filename: run.filename ?? filename, itemCount: run.itemCount, totalsByCurrency: totals },
    csv,
    advices,
  }
}

/** Marks a draft run as sent to the bank. Called from the "I've uploaded it" server action, so
 * the aging view knows not to keep flagging the bills as unpaid until the ledger sync catches
 * up. Ledger reconciliation itself is unchanged — bank-match matches the payment lines back to
 * these documents through their invoice references, exactly like it does today for manually-paid
 * bills. */
export async function markPaymentRunSent(input: { workspaceId: string; runId: string; actorId: string }) {
  const run = await prisma.paymentRun.findFirst({ where: { id: input.runId, workspaceId: input.workspaceId }, select: { id: true, status: true } })
  if (!run) throw new Error("payment_run_not_found")
  if (run.status !== "draft") throw new Error("payment_run_not_draft")
  const updated = await prisma.paymentRun.update({
    where: { id: run.id },
    data: { status: "sent", sentAt: new Date() },
    select: { id: true, status: true, sentAt: true },
  })
  await recordSystemAudit({
    workspaceId: input.workspaceId,
    type: "payment_run_sent",
    detail: { runId: run.id, actorId: input.actorId },
  })
  return updated
}

export async function listPaymentRuns(workspaceId: string, opts: { limit?: number } = {}) {
  return prisma.paymentRun.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    take: opts.limit ?? 50,
    select: { id: true, filename: true, status: true, itemCount: true, totalsJson: true, sentAt: true, createdAt: true },
  })
}
