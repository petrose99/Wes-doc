// #251 polish (evaluate residuals): receipt snapshot, useId in the amount cell, phone-size Bill Pay footer/bulk
// buttons, Approve confirm description broken into lines, transactional Set Pay From, "default" explained.
import { readFileSync, writeFileSync } from 'node:fs'
const root = '/home/ubuntu/Dev/Wes-doc/'
const edit = (p, pairs) => { let s = readFileSync(root + p, 'utf8'); for (const [a, b] of pairs) { if (!s.includes(a)) throw new Error(p + ' missing: ' + a.slice(0, 70)); s = s.split(a).join(b) } writeFileSync(root + p, s) }

edit('components/payments/bill-pay-queue.tsx', [
  // receipt snapshot: rows resolved at submit time, not after the refresh removed them
  [`  const [paidReceipt, setPaidReceipt] = useState<{ recorded: Array<{ documentId: string; amount: number }>; leftOut: Array<{ documentId: string; reason: string }> } | null>(null)`, `  const [paidReceipt, setPaidReceipt] = useState<{ recorded: Array<{ documentId: string; amount: number }>; leftOut: Array<{ documentId: string; reason: string }>; rows: Map<string, BillPayRow> } | null>(null)`],
  [`        if (result.success && result.data) { setPaidReceipt(result.data); router.refresh() }`, `        if (result.success && result.data) { setPaidReceipt({ ...result.data, rows: new Map(selectedRows(markingPaid ?? []).map((row) => [row.bill.documentId, row])) }); router.refresh() }`],
  [`          {paidReceipt.recorded.map((line) => { const row = rowsById.get(line.documentId); return`, `          {paidReceipt.recorded.map((line) => { const row = paidReceipt.rows.get(line.documentId); return`],
  [`            {paidReceipt.leftOut.map((line) => { const row = rowsById.get(line.documentId); return`, `            {paidReceipt.leftOut.map((line) => { const row = paidReceipt.rows.get(line.documentId); return`],
  // "default" explained
  [`{!row.payFromChosen && <span className="ml-1 text-xs text-slate-500">default</span>}`, `{!row.payFromChosen && <span className="ml-1 text-xs text-slate-500" title="The workspace's default payer account — change it with Set Pay From">default<span className="sr-only"> (the workspace's default payer account; change it with Set Pay From)</span></span>}`],
  // phone-size buttons on the bulk bar and pane footer (36px below lg, 32px at lg like the batches footer)
  [`          <Button type="button" size="sm" disabled={eligible === 0} onClick={() => setBatching(selectedIds)}>`, `          <Button type="button" className="lg:h-8 lg:text-xs" disabled={eligible === 0} onClick={() => setBatching(selectedIds)}>`],
  [`          {isOwner && <Button type="button" size="sm" variant="outline" disabled={payable === 0} onClick={() => setMarkingPaid(selectedIds)}>`, `          {isOwner && <Button type="button" className="lg:h-8 lg:text-xs" variant="outline" disabled={payable === 0} onClick={() => setMarkingPaid(selectedIds)}>`],
  [`          <Button type="button" size="sm" variant="outline" disabled={payerAccounts.length === 0} onClick={() => setSettingPayFrom(selectedIds)}>`, `          <Button type="button" className="lg:h-8 lg:text-xs" variant="outline" disabled={payerAccounts.length === 0} onClick={() => setSettingPayFrom(selectedIds)}>`],
  [`<Button asChild size="sm" variant="outline"><Link className="py-1.5" href={\`\${settingsHref}#supplier-`, `<Button asChild className="lg:h-8 lg:text-xs" variant="outline"><Link className="py-1.5" href={\`\${settingsHref}#supplier-`],
  [`<Button asChild size="sm" variant="outline"><Link className="py-1.5" href={withOrigin(\`\${batchesHref}/\${row.scheduledBatch.id}\`, origin)}>`, `<Button asChild className="lg:h-8 lg:text-xs" variant="outline"><Link className="py-1.5" href={withOrigin(\`\${batchesHref}/\${row.scheduledBatch.id}\`, origin)}>`],
  [`        {isOwner && row.bill.paidState.source === "recorded" && <Button type="button" size="sm" variant="outline" onClick={() => setRemovingRecords(row)}>Remove payment records…</Button>}
        {isOwner && row.bill.paidState.state !== "scheduled" && <Button type="button" size="sm" variant="outline" onClick={() => setMarkingPaid([row.bill.documentId])}>Mark as paid…</Button>}`, `        {isOwner && row.bill.paidState.source === "recorded" && <Button type="button" className="lg:h-8 lg:text-xs" variant="outline" onClick={() => setRemovingRecords(row)}>Remove payment records…</Button>}
        {isOwner && row.bill.paidState.state !== "scheduled" && <Button type="button" className="lg:h-8 lg:text-xs" variant="outline" onClick={() => setMarkingPaid([row.bill.documentId])}>Mark as paid…</Button>}`],
  [`        {payerAccounts.length > 0 && row.bill.paidState.state !== "scheduled" && <Button type="button" size="sm" variant="outline" onClick={() => setSettingPayFrom([row.bill.documentId])}>`, `        {payerAccounts.length > 0 && row.bill.paidState.state !== "scheduled" && <Button type="button" className="lg:h-8 lg:text-xs" variant="outline" onClick={() => setSettingPayFrom([row.bill.documentId])}>`],
  [`        {row.eligibility.eligible && <Button type="button" size="sm" onClick={() => setBatching([row.bill.documentId])}>`, `        {row.eligibility.eligible && <Button type="button" className="lg:h-8 lg:text-xs" onClick={() => setBatching([row.bill.documentId])}>`],
])

edit('components/payments/amount-to-pay.tsx', [
  [`import { useEffect, useRef, useState } from "react"`, `import { useEffect, useId, useRef, useState } from "react"`],
  [`  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (editing) inputRef.current?.select() }, [editing])`, `  const inputRef = useRef<HTMLInputElement>(null)
  const id = useId()
  useEffect(() => { if (editing) inputRef.current?.select() }, [editing])`],
  [`        <label className="sr-only" htmlFor="amount-to-pay-input">Amount to pay</label>
        <input id="amount-to-pay-input" ref={inputRef} type="text" inputMode="decimal" value={draft} disabled={saving}
          aria-invalid={error ? true : undefined} aria-describedby={error ? "amount-to-pay-error" : undefined}`, `        <label className="sr-only" htmlFor={\`\${id}-input\`}>Amount to pay</label>
        <input id={\`\${id}-input\`} ref={inputRef} type="text" inputMode="decimal" value={draft} disabled={saving}
          aria-invalid={error ? true : undefined} aria-describedby={error ? \`\${id}-error\` : undefined}`],
  [`      {error && <span id="amount-to-pay-error" role="alert"`, `      {error && <span id={\`\${id}-error\`} role="alert"`],
])

edit('components/payments/batch-queue.tsx', [
  // the Approve confirm: facts as lines, not one paragraph
  [`      description={\`\${approving?.billCount ?? 0} bill\${approving?.billCount === 1 ? "" : "s"}, \${approving ? money(approving.total, approving.currencyCode) : ""} from \${approving?.payFromLabel ?? "—"}. Submitted by \${approving?.submittedBy?.name ?? "—"} · \${approving ? formatPaymentDateTime(approving.createdAt) : ""}.\${approving?.submittedBy?.id === currentUserId ? " You submitted this batch — approving it yourself is allowed and recorded as such." : ""}\${approving?.discountExpiresInDays !== null && approving?.discountExpiresInDays !== undefined ? \` A discount in this batch expires \${approving.discountExpiresInDays === 0 ? "today" : \`in \${approving.discountExpiresInDays} day\${approving.discountExpiresInDays === 1 ? "" : "s"}\`}; the file pays the discounted amount.\` : ""} Approving makes the payment file available; no money moves until it is uploaded to the bank.\`}
      confirmLabel={busy ? "Approving…" : "Approve batch"}
      onConfirm={() => void approve()} onCancel={() => { if (!busy) setApproving(null) }} />`, `      description="Approving makes the payment file available. No money moves until it is uploaded to the bank."
      confirmLabel={busy ? "Approving…" : "Approve batch"}
      onConfirm={() => void approve()} onCancel={() => { if (!busy) setApproving(null) }}>
      {approving && <dl className="space-y-1 text-sm text-slate-700">
        <div className="flex gap-2"><dt className="w-24 shrink-0 font-medium text-slate-800">Batch</dt><dd>{approving.billCount} bill{approving.billCount === 1 ? "" : "s"} · <span className="font-semibold tabular-nums text-slate-900">{money(approving.total, approving.currencyCode)}</span> · Pay From {approving.payFromLabel}</dd></div>
        <div className="flex gap-2"><dt className="w-24 shrink-0 font-medium text-slate-800">Submitted</dt><dd>{approving.submittedBy?.name ?? "—"} · {formatPaymentDateTime(approving.createdAt)}</dd></div>
        {approving.submittedBy?.id === currentUserId && <div className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">You submitted this batch — approving it yourself is allowed and recorded as such.</div>}
        {approving.discountExpiresInDays !== null && <div className="rounded bg-purple-50 px-2 py-1 text-xs text-purple-800">A discount in this batch expires {approving.discountExpiresInDays === 0 ? "today" : \`in \${approving.discountExpiresInDays} day\${approving.discountExpiresInDays === 1 ? "" : "s"}\`}; the file pays the discounted amount.</div>}
      </dl>}
    </ConfirmDialog>`],
])

edit('app/(app)/workspaces/[workspaceId]/(queue)/payments/actions.tsx', [
  [`  try {
    for (const documentId of documentIds) await saveBillPayPreference({ workspaceId, actorId: user.id, documentId, payFromAccountId })
  } catch (error) { return { success: false, error: message(error, "Couldn't set Pay From") } }`, `  try {
    await setPayFromOnRows({ workspaceId, actorId: user.id, documentIds, payFromAccountId })
  } catch (error) { return { success: false, error: message(error, "Couldn't set Pay From") } }`],
  [`import { saveBillPayPreference } from "@/models/bill-pay"`, `import { saveBillPayPreference, setPayFromOnRows } from "@/models/bill-pay"`],
])

edit('models/bill-pay.ts', [
  [`/** #229 Q8: Early Payment Savings`, `/** Set Pay From on several rows at once — one transaction, so "nothing changed" is true on failure. */
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

/** #229 Q8: Early Payment Savings`],
])
console.log('ok')
