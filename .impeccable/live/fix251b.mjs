// #251 fix batch B: PaymentBatchRow gains fileProblems + discountExpiresInDays; queue shell honours alertdialog;
// eligibility gains no_payer_account; amount cell survives a thrown save; mark-paid receipt; ReasonDialog a11y.
import { readFileSync, writeFileSync } from 'node:fs'
const root = '/home/ubuntu/Dev/Wes-doc/'
const edit = (p, pairs) => { let s = readFileSync(root + p, 'utf8'); for (const [a, b] of pairs) { if (!s.includes(a)) throw new Error(p + ' missing: ' + a.slice(0, 70)); s = s.split(a).join(b) } writeFileSync(root + p, s) }

edit('models/payment-batches.ts', [
  [`  /** The earliest due date across the batch's bills (#229 Q11's Due column). */
  earliestDue: Date | null
  filename: string
}`, `  /** The earliest due date across the batch's bills (#229 Q11's Due column). */
  earliestDue: Date | null
  filename: string
  /** Problems the payment file would have today (a supplier's bank account missing) — the row
   * offers "Fix bank details" instead of a download that would fail. */
  fileProblems: number
  /** Days left on the soonest early-payment discount the batch's lines rely on, while pending —
   * an owner approving after it lapses would be approving a short payment. Null when none. */
  discountExpiresInDays: number | null
}`],
  [`function toRow(batch: BatchRecord, dueByDoc: Map<string, Date | null>): PaymentBatchRow {`, `type SupplierFacts = Map<string, { hasBank: boolean; terms: PaymentTerms }>

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

function toRow(batch: BatchRecord, dueByDoc: Map<string, Date | null>, facts: SupplierFacts, now = new Date()): PaymentBatchRow {`],
  [`  const legacyExportedAt = batch.exportedAt ?? batch.sentAt
  return {`, `  const legacyExportedAt = batch.exportedAt ?? batch.sentAt
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
  return {`],
  [`    filename: batch.filename ?? \`\${batch.name ?? batch.id}.csv\`,
  }
}`, `    filename: batch.filename ?? \`\${batch.name ?? batch.id}.csv\`,
    fileProblems,
    discountExpiresInDays,
  }
}`],
  [`  const dueByDoc = await dueDatesFor(input.workspaceId, batches)
  return batches.map((batch) => toRow(batch, dueByDoc))`, `  const [dueByDoc, facts] = await Promise.all([dueDatesFor(input.workspaceId, batches), supplierFactsFor(input.workspaceId, batches)])
  return batches.map((batch) => toRow(batch, dueByDoc, facts))`],
  [`  const [dueByDoc, workspace, audit] = await Promise.all([
    dueDatesFor(input.workspaceId, [batch]),`, `  const [dueByDoc, facts, workspace, audit] = await Promise.all([
    dueDatesFor(input.workspaceId, [batch]),
    supplierFactsFor(input.workspaceId, [batch]),`],
  [`  const row = toRow(batch, dueByDoc)`, `  const row = toRow(batch, dueByDoc, facts)`],
  [`import { formatZaEftCsv, validatePaymentInstructions, type PaymentInstruction } from "@/lib/payments/za-eft-csv"`, `import { formatZaEftCsv, validatePaymentInstructions, type PaymentInstruction } from "@/lib/payments/za-eft-csv"
import { openDiscountWindow, type PaymentTerms } from "@/lib/payments/terms"`],
])

// H3 P2: the queue's key guard must include alertdialog (ConfirmDialog's role).
edit('components/queue/queue-screen.tsx', [
  [`      if (target?.closest("input, textarea, select, [contenteditable=true], [role=dialog], [role=listbox], [role=menu]")) return`, `      if (target?.closest("input, textarea, select, [contenteditable=true], [role=dialog], [role=alertdialog], [role=listbox], [role=menu]")) return
      // A modal is open somewhere on the page: its own Escape wins, the queue stays put (#251).
      if (document.querySelector("[role=dialog][aria-modal=true], [role=alertdialog][aria-modal=true]")) return`],
])

// H5 P2: no payer account is a real ineligibility.
edit('lib/payments/eligibility.ts', [
  [`export type BatchEligibilityReason = "needs_bank_details" | "scheduled" | "no_amount" | "no_supplier"`, `export type BatchEligibilityReason = "needs_bank_details" | "scheduled" | "no_amount" | "no_supplier" | "no_payer_account"`],
  [`export function batchEligibility(input: { hasBankAccount: boolean; paidState: PaidState; amountToPay: number | null; hasSupplier: boolean }): BatchEligibility {
  if (!input.hasSupplier) return { eligible: false, reason: "no_supplier" }`, `export function batchEligibility(input: { hasBankAccount: boolean; paidState: PaidState; amountToPay: number | null; hasSupplier: boolean; hasPayerAccount: boolean }): BatchEligibility {
  if (!input.hasSupplier) return { eligible: false, reason: "no_supplier" }
  if (!input.hasPayerAccount) return { eligible: false, reason: "no_payer_account" }`],
  [`  no_supplier: "Supplier not on file",
}`, `  no_supplier: "Supplier not on file",
  no_payer_account: "No payer account yet",
}`],
])
edit('models/bill-pay.ts', [
  [`      eligibility: batchEligibility({ hasBankAccount, paidState: bill.paidState.state, amountToPay, hasSupplier: !!bill.supplierId }),`, `      eligibility: batchEligibility({ hasBankAccount, paidState: bill.paidState.state, amountToPay, hasSupplier: !!bill.supplierId, hasPayerAccount: payFrom !== null }),`],
])
edit('lib/payments/payments.test.ts', [
  [`    expect(batchEligibility({ hasBankAccount: false, paidState: "unpaid", amountToPay: 10, hasSupplier: true })).toEqual({ eligible: false, reason: "needs_bank_details" })
    expect(batchEligibility({ hasBankAccount: true, paidState: "scheduled", amountToPay: 10, hasSupplier: true })).toEqual({ eligible: false, reason: "scheduled" })
    expect(batchEligibility({ hasBankAccount: true, paidState: "unpaid", amountToPay: 10, hasSupplier: true })).toEqual({ eligible: true })`, `    expect(batchEligibility({ hasBankAccount: false, paidState: "unpaid", amountToPay: 10, hasSupplier: true, hasPayerAccount: true })).toEqual({ eligible: false, reason: "needs_bank_details" })
    expect(batchEligibility({ hasBankAccount: true, paidState: "scheduled", amountToPay: 10, hasSupplier: true, hasPayerAccount: true })).toEqual({ eligible: false, reason: "scheduled" })
    expect(batchEligibility({ hasBankAccount: true, paidState: "unpaid", amountToPay: 10, hasSupplier: true, hasPayerAccount: false })).toEqual({ eligible: false, reason: "no_payer_account" })
    expect(batchEligibility({ hasBankAccount: true, paidState: "unpaid", amountToPay: 10, hasSupplier: true, hasPayerAccount: true })).toEqual({ eligible: true })`],
])

// H9 P2: the amount cell survives a thrown save.
edit('components/payments/amount-to-pay.tsx', [
  [`    setSaving(true)
    const cents = Math.round(value * 100)
    // Back to the computed amount when the operator types the discounted total or the due itself.
    const next = cents === Math.round((discountedTotal ?? due) * 100) ? null : cents / 100
    const result = await onSave(next)
    setSaving(false)
    if (!result.success) { setError(result.error ?? "Couldn't save the amount."); return }`, `    setSaving(true)
    const cents = Math.round(value * 100)
    // Back to the computed amount when the operator types the discounted total or the due itself.
    const next = cents === Math.round((discountedTotal ?? due) * 100) ? null : cents / 100
    let result: { success: boolean; error?: string }
    try { result = await onSave(next) } catch { result = { success: false, error: "Couldn't reach the server. Nothing changed — try again." } }
    setSaving(false)
    if (!result.success) { setError(result.error ?? "Couldn't save the amount."); return }`],
])

// H9 P2 / P3: ReasonDialog's textarea gets a name and its error a role.
edit('components/list-screen/reason-dialog-button.tsx', [
  [`    <Dialog open={open} title={title} description={description} onClose={() => { if (!pending) close() }}>`, `    <Dialog open={open} title={title} description={description} onClose={() => { if (!pending) close() }}>
      {/* #251: the field is named (placeholder alone is not a name) and the refusal is announced. */}`],
])
console.log('ok')
