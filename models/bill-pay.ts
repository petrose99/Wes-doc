// Deliberately NOT a "use server" module: server actions live upstream and do the auth.
import { prisma } from "@/lib/db"
import { decimalToNumber } from "@/lib/money"
import { listWorkspaceBills, type BillRow as Bill, type BillsSummary } from "@/models/bills"
import { listPayerAccounts, type PayerAccountRow } from "@/models/payer-accounts"
import { processingState } from "@/lib/documents/processing-state"
import { batchEligibility, isOnBillPay, type BatchEligibility } from "@/lib/payments/eligibility"
import { formatTerms, hasDiscountTerms, openDiscountWindow, type DiscountWindow, type PaymentTerms } from "@/lib/payments/terms"
import { remainingDue } from "@/lib/payments/paid-state"
import { agingBucket } from "@/lib/bills/due-date"

/** #229 Q7/Q10 (#251): the Bill Pay queue — one row per Approved, uncancelled, not-fully-paid
 * invoice, carrying its supplier's Payment terms, the open discount window, the operator's
 * *Amount to pay* / *Pay From* (a `BillPayPreference`), bank-detail presence and the batch
 * eligibility read off all of that. A projection over `listWorkspaceBills`, never a table. */

export type BillPayBillRow = {
  kind: "bill"
  bill: Bill
  terms: PaymentTerms
  termsLabel: string
  discount: DiscountWindow | null
  /** What the row still owes: total minus recorded/confirmed payments. */
  due: number | null
  /** The operator's own amount (a partial), or null → the discounted total, or the due. */
  amountToPayOverride: number | null
  amountToPay: number | null
  payFrom: PayerAccountRow | null
  /** True when the operator set Pay From on this row; false when it is the workspace default. */
  payFromChosen: boolean
  hasBankAccount: boolean
  eligibility: BatchEligibility
  /** Scheduled while a pending/approved batch holds the row; the batch's id lets the row link. */
  scheduledBatch: { id: string; name: string | null; status: string } | null
}

export type ClaimEligibilityReason = "needs_bank_details" | "left_workspace" | "needs_currency"
export type ClaimEligibility = { eligible: true } | { eligible: false; reason: ClaimEligibilityReason }

/** #295: a reimbursement claim on the same queue as bills — no terms, no discount, no aging (its
 * Due is the approval date, not a countdown). Eligible once approved with a frozen total, a
 * currency, and the Claimant's own WorkspaceMember bank details on file; otherwise it stays
 * visible with the reason (folded into the `needs_bank_details` facet, same chip, wider
 * membership — the reason on the row picks the detail-pane copy, built on #331). */
export type BillPayClaimRow = {
  kind: "claim"
  claim: { id: string; title: string | null; total: number | null; currencyCode: string | null; submittedAt: Date | null; resolvedAt: Date | null }
  submitter: { id: string; name: string | null; email: string } | null
  eligibility: ClaimEligibility
  paidState: "paid" | "scheduled" | "unpaid"
  scheduledBatch: { id: string; name: string | null; status: string } | null
}

export type BillPayRow = BillPayBillRow | BillPayClaimRow

export type BillPayFacet = "ready" | "scheduled" | "needs_bank_details" | "discount"

export type BillPayResult = {
  rows: BillPayRow[]
  summary: BillsSummary
  payerAccounts: PayerAccountRow[]
  defaultPayerAccount: PayerAccountRow | null
  /** Whether any supplier in the workspace offers an early-payment discount (#229 Q8: the
   * Early Payment Savings figure only exists once this is true). */
  anySupplierHasDiscount: boolean
}

export async function listBillPay(input: { workspaceId: string; asOf?: Date; facet?: BillPayFacet }): Promise<BillPayResult> {
  const asOf = input.asOf ?? new Date()
  const [{ bills }, payerAccounts, suppliers] = await Promise.all([
    listWorkspaceBills({ workspaceId: input.workspaceId, asOf, limit: 1000 }),
    listPayerAccounts(input.workspaceId),
    prisma.supplier.findMany({
      where: { workspaceId: input.workspaceId },
      select: { id: true, paymentTermsDays: true, earlyPaymentDiscountPercent: true, earlyPaymentDiscountDays: true, iban: true, bankDetails: true },
    }),
  ])
  const supplierById = new Map(suppliers.map((s) => [s.id, s]))
  const anySupplierHasDiscount = suppliers.some((s) => hasDiscountTerms(supplierTerms(s)))
  const defaultPayerAccount = payerAccounts.find((a) => a.isDefault) ?? payerAccounts[0] ?? null
  const accountById = new Map(payerAccounts.map((a) => [a.id, a]))

  const onQueue = bills.filter((bill) => isOnBillPay({
    processingState: processingState({ approvalStatus: bill.approvalStatus, blockedByCheck: bill.blockedByCheck, escalated: bill.escalated, touchless: bill.touchless, status: bill.status }),
    paidState: bill.paidState.state,
  }))
  const ids = onQueue.map((bill) => bill.documentId)
  const [preferences, batchItems] = ids.length === 0 ? [[], []] : await Promise.all([
    prisma.billPayPreference.findMany({ where: { workspaceId: input.workspaceId, documentId: { in: ids } }, select: { documentId: true, amountToPay: true, payFromAccountId: true } }),
    prisma.paymentRunItem.findMany({
      where: { workspaceId: input.workspaceId, documentId: { in: ids }, active: true, run: { status: { in: ["pending_approval", "approved", "draft", "sent"] } } },
      select: { documentId: true, run: { select: { id: true, name: true, status: true } } },
    }),
  ])
  const preferenceByDoc = new Map(preferences.map((p) => [p.documentId, p]))
  const batchByDoc = new Map(batchItems.filter((i) => i.documentId).map((i) => [i.documentId!, i.run]))

  const billRows: BillPayBillRow[] = onQueue.map((bill) => {
    const supplier = bill.supplierId ? supplierById.get(bill.supplierId) : undefined
    const terms = supplierTerms(supplier)
    const due = remainingDue(bill.total, bill.paidState.paidAmount)
    const discount = bill.paidState.state === "partially_paid" ? null : openDiscountWindow({ total: due, invoiceDate: bill.documentDate, terms, asOf })
    const preference = preferenceByDoc.get(bill.documentId)
    const amountToPayOverride = decimalToNumber(preference?.amountToPay)
    const amountToPay = amountToPayOverride ?? discount?.discountedTotal ?? due
    const chosen = preference?.payFromAccountId ? accountById.get(preference.payFromAccountId) ?? null : null
    const payFrom = chosen ?? defaultPayerAccount
    const hasBankAccount = supplierHasBankAccount(supplier)
    return {
      kind: "bill", bill, terms, termsLabel: formatTerms(terms), discount, due, amountToPayOverride, amountToPay, payFrom, payFromChosen: chosen !== null, hasBankAccount,
      eligibility: batchEligibility({ hasBankAccount, paidState: bill.paidState.state, amountToPay, hasSupplier: !!bill.supplierId, hasPayerAccount: payFrom !== null }),
      scheduledBatch: batchByDoc.get(bill.documentId) ?? null,
    }
  })

  const claimRows = await listClaimRows(input.workspaceId)

  const rows: BillPayRow[] = [...billRows, ...claimRows]
  const facet = input.facet
  const filtered = rows.filter((row) => {
    if (facet === "ready") return row.eligibility.eligible
    if (facet === "scheduled") return row.kind === "bill" ? row.bill.paidState.state === "scheduled" : row.paidState === "scheduled"
    if (facet === "needs_bank_details") {
      if (row.kind === "bill") return !row.eligibility.eligible && row.eligibility.reason === "needs_bank_details"
      return !row.eligibility.eligible // #295: left_workspace/needs_currency fold into the same chip
    }
    if (facet === "discount") return row.kind === "bill" && row.discount !== null
    return true
  })

  return { rows: filtered, summary: summarizeAging(billRows, asOf), payerAccounts, defaultPayerAccount, anySupplierHasDiscount }
}

/** #295: approved claims, eligible once they have a frozen total, a currency, and the Claimant's
 * own bank details on file — mirrors the bill-row shape but with no terms/discount/aging. */
async function listClaimRows(workspaceId: string): Promise<BillPayClaimRow[]> {
  const claims = await prisma.expenseClaim.findMany({
    where: { workspaceId, status: "approved" },
    select: { id: true, title: true, total: true, currencyCode: true, submitterId: true, submittedAt: true, resolvedAt: true, submitter: { select: { id: true, name: true, email: true } } },
  })
  if (claims.length === 0) return []
  const submitterIds = [...new Set(claims.map((c) => c.submitterId).filter((id): id is string => !!id))]
  const claimIds = claims.map((c) => c.id)
  const [members, payments, batchItems] = await Promise.all([
    submitterIds.length === 0 ? [] : prisma.workspaceMember.findMany({ where: { workspaceId, userId: { in: submitterIds } }, select: { userId: true, bankName: true, bankAccountNumber: true, bankBranchCode: true } }),
    prisma.expenseClaimPayment.findMany({ where: { workspaceId, claimId: { in: claimIds }, removedAt: null }, select: { claimId: true, amount: true } }),
    prisma.paymentRunItem.findMany({
      where: { workspaceId, expenseClaimId: { in: claimIds }, active: true, run: { status: { in: ["pending_approval", "approved", "draft", "sent"] } } },
      select: { expenseClaimId: true, run: { select: { id: true, name: true, status: true } } },
    }),
  ])
  const memberByUser = new Map(members.map((m) => [m.userId, m]))
  const paidByClaim = new Map<string, number>()
  for (const p of payments) paidByClaim.set(p.claimId, (paidByClaim.get(p.claimId) ?? 0) + (decimalToNumber(p.amount) ?? 0))
  const batchByClaim = new Map(batchItems.filter((i) => i.expenseClaimId).map((i) => [i.expenseClaimId!, i.run]))

  return claims.map((claim) => {
    const total = decimalToNumber(claim.total)
    const member = claim.submitterId ? memberByUser.get(claim.submitterId) : undefined
    const eligibility = claimEligibility({ total, currencyCode: claim.currencyCode, submitterId: claim.submitterId, member })
    const scheduledBatch = batchByClaim.get(claim.id) ?? null
    const paidAmount = paidByClaim.get(claim.id) ?? 0
    const paidState: BillPayClaimRow["paidState"] = total !== null && Math.round(paidAmount * 100) >= Math.round(total * 100) ? "paid" : scheduledBatch !== null ? "scheduled" : "unpaid"
    return {
      kind: "claim",
      claim: { id: claim.id, title: claim.title, total, currencyCode: claim.currencyCode, submittedAt: claim.submittedAt, resolvedAt: claim.resolvedAt },
      submitter: claim.submitter,
      eligibility, paidState, scheduledBatch,
    }
  })
}

function claimEligibility(input: { total: number | null; currencyCode: string | null; submitterId: string | null; member: { bankName: string | null; bankAccountNumber: string | null; bankBranchCode: string | null } | undefined }): ClaimEligibility {
  if (!input.submitterId || !input.member) return { eligible: false, reason: "left_workspace" }
  if (input.currencyCode === null) return { eligible: false, reason: "needs_currency" }
  if (input.total === null) return { eligible: false, reason: "needs_currency" }
  if (!input.member.bankName || !input.member.bankAccountNumber || !input.member.bankBranchCode) return { eligible: false, reason: "needs_bank_details" }
  return { eligible: true }
}

function supplierTerms(supplier: { paymentTermsDays: number | null; earlyPaymentDiscountPercent: unknown; earlyPaymentDiscountDays: number | null } | undefined): PaymentTerms {
  if (!supplier) return { netDays: null, discountPercent: null, discountDays: null }
  return { netDays: supplier.paymentTermsDays, discountPercent: decimalToNumber(supplier.earlyPaymentDiscountPercent as never), discountDays: supplier.earlyPaymentDiscountDays }
}

export function supplierHasBankAccount(supplier: { iban: string | null; bankDetails: unknown } | undefined): boolean {
  if (!supplier) return false
  const details = (supplier.bankDetails ?? {}) as Record<string, unknown>
  const account = typeof details.account === "string" ? details.account : typeof details.iban === "string" ? details.iban : supplier.iban
  return typeof account === "string" && account.trim().length > 0
}

/** The queue's one metric: what is still owed, by age, over the whole queue (not the facet) —
 * the bar reads the same whichever chip is on. */
function summarizeAging(rows: BillPayBillRow[], asOf: Date): BillsSummary {
  const acc: BillsSummary = { current: { count: 0, total: 0 }, "1-30": { count: 0, total: 0 }, "31-60": { count: 0, total: 0 }, "61-90": { count: 0, total: 0 }, "90+": { count: 0, total: 0 }, unknown: { count: 0, total: 0 } }
  for (const row of rows) {
    const key = agingBucket(row.bill.dueDate, asOf) ?? "unknown"
    acc[key].count += 1
    if (row.due !== null) acc[key].total += row.due
  }
  return acc
}

/** #229 Q10: the operator's inline Amount to pay and Pay From, upserted per row. `amountToPay`
 * null clears the override (back to the discounted total / due). */
export async function saveBillPayPreference(input: { workspaceId: string; actorId: string; documentId: string; amountToPay?: number | null; payFromAccountId?: string | null }): Promise<void> {
  const document = await prisma.document.findFirst({ where: { id: input.documentId, workspaceId: input.workspaceId }, select: { id: true } })
  if (!document) throw new Error("document_not_found")
  if (input.payFromAccountId) {
    const account = await prisma.payerAccount.findFirst({ where: { id: input.payFromAccountId, workspaceId: input.workspaceId, archivedAt: null }, select: { id: true } })
    if (!account) throw new Error("payer_account_not_found")
  }
  const data = {
    ...(input.amountToPay !== undefined ? { amountToPay: input.amountToPay } : {}),
    ...(input.payFromAccountId !== undefined ? { payFromAccountId: input.payFromAccountId } : {}),
    updatedById: input.actorId,
  }
  await prisma.billPayPreference.upsert({
    where: { documentId: input.documentId },
    create: { documentId: input.documentId, workspaceId: input.workspaceId, ...data },
    update: data,
  })
}

/** Set Pay From on several rows at once — one transaction, so "nothing changed" is true on failure. */
export async function setPayFromOnRows(input: { workspaceId: string; actorId: string; documentIds: string[]; payFromAccountId: string }): Promise<void> {
  const account = await prisma.payerAccount.findFirst({ where: { id: input.payFromAccountId, workspaceId: input.workspaceId, archivedAt: null }, select: { id: true } })
  if (!account) throw new Error("payer_account_not_found")
  const documents = await prisma.document.findMany({ where: { id: { in: input.documentIds }, workspaceId: input.workspaceId }, select: { id: true } })
  await prisma.$transaction(documents.map((document) => prisma.billPayPreference.upsert({
    where: { documentId: document.id },
    create: { documentId: document.id, workspaceId: input.workspaceId, payFromAccountId: account.id, updatedById: input.actorId },
    update: { payFromAccountId: account.id, updatedById: input.actorId },
  })))
}

/** #229 Q8: Early Payment Savings — the discount captured by approved and paid batches
 * (bill total minus the amount batched, on suppliers that offer a discount) plus what is still
 * open on Bill Pay today. Rendered only once a supplier has discount terms; never an empty KPI. */
export async function earlyPaymentSavings(workspaceId: string, asOf = new Date()): Promise<{ captured: number; capturedCount: number; available: number; availableCount: number; anySupplierHasDiscount: boolean }> {
  const { rows, anySupplierHasDiscount } = await listBillPay({ workspaceId, asOf })
  let available = 0, availableCount = 0
  for (const row of rows) if (row.kind === "bill" && row.discount) { available += row.discount.discountAmount; availableCount += 1 }
  const items = await prisma.paymentRunItem.findMany({
    where: { workspaceId, run: { status: { in: ["approved", "paid"] } }, documentId: { not: null } },
    select: { amount: true, supplier: true, document: { select: { reviewedData: true } } },
  })
  const discountSuppliers = new Set((await prisma.supplier.findMany({ where: { workspaceId, earlyPaymentDiscountPercent: { gt: 0 } }, select: { canonicalName: true } })).map((s) => s.canonicalName))
  let captured = 0, capturedCount = 0
  for (const item of items) {
    if (!discountSuppliers.has(item.supplier)) continue
    const values = (item.document?.reviewedData ?? {}) as Record<string, unknown>
    const total = typeof values["total"] === "number" ? values["total"] : typeof values["total"] === "string" ? parseFloat(values["total"]) : null
    const amount = decimalToNumber(item.amount) ?? 0
    if (total !== null && Number.isFinite(total) && Math.round(total * 100) > Math.round(amount * 100)) { captured += total - amount; capturedCount += 1 }
  }
  return { captured: Math.round(captured * 100) / 100, capturedCount, available: Math.round(available * 100) / 100, availableCount, anySupplierHasDiscount }
}
