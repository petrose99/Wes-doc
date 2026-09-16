// #251 fix batch C (evaluate P2/P3s): mark-paid receipt, split-name preview, disabled-button hints, one payer-account
// notice, chosen-vs-default Pay From, aria-current on aging chips, Set Pay From in the pane, from= on hops,
// transactional batch creation, batch-worded missing pane.
import { readFileSync, writeFileSync } from 'node:fs'
const root = '/home/ubuntu/Dev/Wes-doc/'
const edit = (p, pairs) => { let s = readFileSync(root + p, 'utf8'); for (const [a, b] of pairs) { if (!s.includes(a)) throw new Error(p + ' missing: ' + a.slice(0, 70)); s = s.split(a).join(b) } writeFileSync(root + p, s) }

edit('models/bill-pay.ts', [
  [`  payFrom: PayerAccountRow | null
  hasBankAccount: boolean`, `  payFrom: PayerAccountRow | null
  /** True when the operator set Pay From on this row; false when it is the workspace default. */
  payFromChosen: boolean
  hasBankAccount: boolean`],
  [`    const payFrom = (preference?.payFromAccountId ? accountById.get(preference.payFromAccountId) : null) ?? defaultPayerAccount`, `    const chosen = preference?.payFromAccountId ? accountById.get(preference.payFromAccountId) ?? null : null
    const payFrom = chosen ?? defaultPayerAccount`],
  [`      bill, terms, termsLabel: formatTerms(terms), discount, due, amountToPayOverride, amountToPay, payFrom, hasBankAccount,`, `      bill, terms, termsLabel: formatTerms(terms), discount, due, amountToPayOverride, amountToPay, payFrom, payFromChosen: chosen !== null, hasBankAccount,`],
])

edit('models/payment-batches.ts', [
  // transactional creation: every batch of the split lands or none does
  [`  const created: CreateBatchesResult["batches"] = []
  for (const [index, group] of groups.entries()) {
    const name = groups.length === 1 ? baseName : \`\${baseName}-\${group.currencyCode}\${group.payFromAccountId ? \`-\${index + 1}\` : ""}\`
    const payFrom = group.lines[0].row.payFrom
    const total = group.lines.reduce((sum, line) => sum + Math.round((line.row.amountToPay ?? 0) * 100), 0) / 100
    const batch = await prisma.paymentRun.create({`, `  // One transaction: the dialog says "Nothing was created — try again" on failure, so that must be true.
  const created = await prisma.$transaction(async (tx) => {
  const created: CreateBatchesResult["batches"] = []
  for (const [index, group] of groups.entries()) {
    const name = splitBatchName(baseName, groups.length, group.currencyCode, index)
    const payFrom = group.lines[0].row.payFrom
    const total = group.lines.reduce((sum, line) => sum + Math.round((line.row.amountToPay ?? 0) * 100), 0) / 100
    const batch = await tx.paymentRun.create({`],
  [`    await recordDocumentAudit({ workspaceId: input.workspaceId, actorId: input.actorId, type: "payment_batch.submitted", detail: { batchId: batch.id, name, billCount: group.lines.length, total, currencyCode: group.currencyCode, payFromAccountId: group.payFromAccountId, leftOut: leftOut.map((l) => ({ documentId: l.documentId, reason: l.reason })) } })
    for (const { row } of group.lines) {
      await recordDocumentAudit({ workspaceId: input.workspaceId, actorId: input.actorId, documentId: row.bill.documentId, type: "invoice.batched", detail: { batchId: batch.id, name, amount: row.amountToPay } })
    }
    created.push({ id: batch.id, name, billCount: group.lines.length, total, currencyCode: group.currencyCode, payFromLabel: payerAccountLabel(payFrom) })
  }
  return { batches: created, leftOut }`, `    await recordDocumentAudit({ workspaceId: input.workspaceId, actorId: input.actorId, type: "payment_batch.submitted", detail: { batchId: batch.id, name, billCount: group.lines.length, total, currencyCode: group.currencyCode, payFromAccountId: group.payFromAccountId, leftOut: leftOut.map((l) => ({ documentId: l.documentId, reason: l.reason })) } }, tx)
    for (const { row } of group.lines) {
      await recordDocumentAudit({ workspaceId: input.workspaceId, actorId: input.actorId, documentId: row.bill.documentId, type: "invoice.batched", detail: { batchId: batch.id, name, amount: row.amountToPay } }, tx)
    }
    created.push({ id: batch.id, name, billCount: group.lines.length, total, currencyCode: group.currencyCode, payFromLabel: payerAccountLabel(payFrom) })
  }
  return created
  })
  return { batches: created, leftOut }`],
  [`async function loadForDecision(`, `/** The name each batch of a split gets — shared with the dialog so the preview matches. */
export function splitBatchName(baseName: string, groupCount: number, currencyCode: string, index: number): string {
  return groupCount === 1 ? baseName : \`\${baseName}-\${currencyCode}-\${index + 1}\`
}

async function loadForDecision(`],
  // manual records in one transaction too
  [`  const recorded: MarkPaidResult["recorded"] = []
  const leftOut: MarkPaidResult["leftOut"] = []
  for (const documentId of input.documentIds) {
    const row = byId.get(documentId)
    if (!row) { leftOut.push({ documentId, reason: "No longer on Bill Pay" }); continue }
    if (row.bill.paidState.state === "scheduled") { leftOut.push({ documentId, reason: "Already in a batch" }); continue }
    if (row.amountToPay === null || row.amountToPay <= 0) { leftOut.push({ documentId, reason: "No amount to pay" }); continue }
    await prisma.invoicePayment.create({
      data: { workspaceId: input.workspaceId, documentId, amount: row.amountToPay, currencyCode: (row.bill.currencyCode ?? "ZAR").toUpperCase(), paidOn: input.paidOn, method: "manual", reference: input.reference?.trim() || null, recordedById: input.actorId },
    })
    await recordDocumentAudit({ workspaceId: input.workspaceId, actorId: input.actorId, documentId, type: "invoice.payment_recorded", detail: { amount: row.amountToPay, method: "manual", paidOn: input.paidOn.toISOString().slice(0, 10) } })
    recorded.push({ documentId, amount: row.amountToPay })
  }
  return { recorded, leftOut }`, `  const recorded: MarkPaidResult["recorded"] = []
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
  return { recorded, leftOut }`],
  [`export type MarkPaidResult = { recorded: Array<{ documentId: string; amount: number }>; leftOut: Array<{ documentId: string; reason: string }> }`, `export type MarkPaidResult = { recorded: Array<{ documentId: string; amount: number }>; leftOut: Array<{ documentId: string; reason: string }> }`],
])

edit('app/(app)/workspaces/[workspaceId]/(queue)/payments/actions.tsx', [
  [`  const detail = await getPaymentBatch({ workspaceId, batchId })
  if (!detail) return null`, `  const detail = await getPaymentBatch({ workspaceId, batchId })
  if (!detail) return <p className="p-6 text-sm text-slate-700">This batch no longer exists. Close the pane and refresh the queue.</p>`],
])

edit('components/payments/create-batch-dialog.tsx', [
  [`import type { CreateBatchesResult } from "@/models/payment-batches"`, `import { splitBatchName, type CreateBatchesResult } from "@/models/payment-batches"`],
  [`          One batch pays from one account in one currency, so this selection becomes <span className="font-medium text-slate-900">{groups.length} batches</span>: {groups.map((group) => \`\${group.lines.length} bill\${group.lines.length === 1 ? "" : "s"} · \${group.currencyCode} · \${payerAccountLabel(group.lines[0].row.payFrom)}\`).join("; ")}.`, `          One batch pays from one account in one currency, so this selection becomes <span className="font-medium text-slate-900">{groups.length} batches</span>: {groups.map((group, index) => \`\${splitBatchName(name.trim() || suggestedName, groups.length, group.currencyCode, index)} (\${group.lines.length} bill\${group.lines.length === 1 ? "" : "s"} · \${group.currencyCode} · \${payerAccountLabel(group.lines[0].row.payFrom)})\`).join("; ")}.`],
])

edit('components/payments/aging-band.tsx', [
  [`<Link href={href(BUCKET[bucket].param)} aria-pressed={on} aria-label=`, `<Link href={href(BUCKET[bucket].param)} aria-current={on ? "true" : undefined} aria-label=`],
])

edit('components/payments/bill-pay-queue.tsx', [
  [`import { withOrigin } from "@/lib/navigation/origin"`, `import { withOrigin } from "@/lib/navigation/origin"
import { useOriginHere } from "@/components/documents/po-compare"`],
  [`  const settingsHref = \`/workspaces/\${workspaceId}/settings/payments\``, `  const origin = useOriginHere()
  const settingsHref = withOrigin(\`/workspaces/\${workspaceId}/settings/payments\`, origin)
  const [paidReceipt, setPaidReceipt] = useState<{ recorded: Array<{ documentId: string; amount: number }>; leftOut: Array<{ documentId: string; reason: string }> } | null>(null)
  // Stable identity: the pane refetches whenever \`loadDetail\` changes.
  const loadDetail = useCallback((documentId: string) => getQueueDetailAction(workspaceId, documentId), [workspaceId])`],
  [`import { useMemo, useState } from "react"`, `import { useCallback, useMemo, useState } from "react"`],
  [`      loadDetail={(documentId) => getQueueDetailAction(workspaceId, documentId)}`, `      loadDetail={loadDetail}`],
  [`      render: (row) => row.payFrom ? payerAccountLabel(row.payFrom) : <Link href={settingsHref} className="text-emerald-800 underline-offset-2 hover:underline">Add a payer account</Link>,`, `      render: (row) => row.payFrom ? <>{payerAccountLabel(row.payFrom)}{!row.payFromChosen && <span className="ml-1 text-xs text-slate-500">default</span>}</> : "—",`],
  [`      band={<AgingBand summary={summary} currencyCode={fallbackCurrency} />}`, `      band={<>
        <AgingBand summary={summary} currencyCode={fallbackCurrency} />
        {payerAccounts.length === 0 && rows.length > 0 && <p role="status" className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">No payer account yet, so nothing here can be batched. <Link href={settingsHref} className="font-medium underline underline-offset-2">Add one under Settings › Payments</Link>.</p>}
      </>}`],
  [`        const payable = chosen.filter((row) => row.bill.paidState.state !== "scheduled").length
        return <>`, `        const payable = chosen.filter((row) => row.bill.paidState.state !== "scheduled").length
        const hint = eligible === 0 ? (payerAccounts.length === 0 ? "Add a payer account first." : "Nothing selected can be batched — each row says why.") : null
        return <>`],
  [`          <Button type="button" size="sm" disabled={eligible === 0} onClick={() => setBatching(selectedIds)} title={eligible === 0 ? "Nothing in this selection can be batched yet" : undefined}>`, `          <Button type="button" size="sm" disabled={eligible === 0} onClick={() => setBatching(selectedIds)}>`],
  [`          <Button type="button" size="sm" variant="outline" disabled={payerAccounts.length === 0} onClick={() => setSettingPayFrom(selectedIds)} title={payerAccounts.length === 0 ? "Add a payer account under Settings › Payments first" : undefined}>
            <Wallet className="h-3.5 w-3.5" aria-hidden />Set Pay From
          </Button>`, `          <Button type="button" size="sm" variant="outline" disabled={payerAccounts.length === 0} onClick={() => setSettingPayFrom(selectedIds)}>
            <Wallet className="h-3.5 w-3.5" aria-hidden />Set Pay From
          </Button>
          {hint && <span className="text-xs text-slate-600">{hint}</span>}`],
  [`        {row.eligibility.eligible && <Button type="button" size="sm" onClick={() => setBatching([row.bill.documentId])}><Layers className="h-3.5 w-3.5" aria-hidden />Create batch</Button>}`, `        {payerAccounts.length > 0 && row.bill.paidState.state !== "scheduled" && <Button type="button" size="sm" variant="outline" onClick={() => setSettingPayFrom([row.bill.documentId])}><Wallet className="h-3.5 w-3.5" aria-hidden />Set Pay From…</Button>}
        {row.eligibility.eligible && <Button type="button" size="sm" onClick={() => setBatching([row.bill.documentId])}><Layers className="h-3.5 w-3.5" aria-hidden />Create batch</Button>}`],
  [`        if (result.success && result.data) {
          toast.success(\`\${result.data.recorded.length} payment\${result.data.recorded.length === 1 ? "" : "s"} recorded\${result.data.leftOut.length ? \`, \${result.data.leftOut.length} left out\` : ""}\`)
          router.refresh()
        }
        return result`, `        if (result.success && result.data) { setPaidReceipt(result.data); router.refresh() }
        return result`],
  [`    <SetPayFromDialog open={settingPayFrom !== null}`, `    <Dialog open={paidReceipt !== null} onClose={() => setPaidReceipt(null)} title={\`\${paidReceipt?.recorded.length ?? 0} payment\${paidReceipt?.recorded.length === 1 ? "" : "s"} recorded\`}
      description="Each invoice now reads “Paid (recorded)” on Invoices until the ledger confirms. Reversal is “Remove payment records…” on the invoice, with a reason.">
      <div className="max-h-[60vh] space-y-3 overflow-y-auto px-5 py-4 text-sm">
        {paidReceipt && paidReceipt.recorded.length > 0 && <ul className="divide-y divide-slate-100 border-y border-slate-200">
          {paidReceipt.recorded.map((line) => { const row = rowsById.get(line.documentId); return <li key={line.documentId} className="flex items-center justify-between gap-2 py-2"><span className="text-slate-800">{row?.bill.supplier ?? "Invoice"}{row?.bill.invoiceNumber ? \` · \${row.bill.invoiceNumber}\` : ""}</span><span className="tabular-nums text-slate-900">{money(line.amount, row?.bill.currencyCode ?? null)}</span></li> })}
        </ul>}
        {paidReceipt && paidReceipt.leftOut.length > 0 && <section>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-700">Left out ({paidReceipt.leftOut.length})</h3>
          <ul className="divide-y divide-slate-100 border-y border-slate-200">
            {paidReceipt.leftOut.map((line) => { const row = rowsById.get(line.documentId); return <li key={line.documentId} className="flex items-center justify-between gap-2 py-2"><span className="text-slate-800">{row?.bill.supplier ?? "Invoice"}{row?.bill.invoiceNumber ? \` · \${row.bill.invoiceNumber}\` : ""}</span><span className="text-slate-600">{line.reason}</span></li> })}
          </ul>
        </section>}
      </div>
      <div className="flex justify-end border-t px-5 py-3"><Button type="button" size="sm" onClick={() => setPaidReceipt(null)}>Done</Button></div>
    </Dialog>

    <SetPayFromDialog open={settingPayFrom !== null}`],
  [`        {!row.eligibility.eligible && row.eligibility.reason === "needs_bank_details" && <Button asChild size="sm" variant="outline"><Link className="py-1.5" href={\`\${settingsHref}#supplier-\${row.bill.supplierId ?? ""}\`}>`, `        {!row.eligibility.eligible && row.eligibility.reason === "needs_bank_details" && <Button asChild size="sm" variant="outline"><Link className="py-1.5" href={withOrigin(\`/workspaces/\${workspaceId}/settings/payments#supplier-\${row.bill.supplierId ?? ""}\`, origin)}>`],
])
console.log('ok')
