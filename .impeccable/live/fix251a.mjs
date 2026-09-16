// #251 fix batch (critique A + evaluate): batch queue overrides, un-mark path, tablist a11y, stat copy.
import { readFileSync, writeFileSync } from 'node:fs'
const root = '/home/ubuntu/Dev/Wes-doc/'
const edit = (p, pairs) => { let s = readFileSync(root + p, 'utf8'); for (const [a, b] of pairs) { if (!s.includes(a)) throw new Error(p + ' missing: ' + a.slice(0, 70)); s = s.split(a).join(b) } writeFileSync(root + p, s) }

edit('components/payments/batch-queue.tsx', [
  [`import { useState } from "react"`, `import { useCallback, useEffect, useState } from "react"`],
  [`import { BATCH_VIEW_LABEL } from "@/lib/payments/batch-status"`, `import { BATCH_VIEW_LABEL, type BatchView } from "@/lib/payments/batch-status"`],
  [`import { approvePaymentBatchAction, getPaymentBatchDetailAction, markPaymentBatchPaidAction, rejectPaymentBatchAction } from`, `import { approvePaymentBatchAction, getPaymentBatchDetailAction, markPaymentBatchPaidAction, rejectPaymentBatchAction, unmarkPaymentBatchPaidAction } from`],
  [`export function PaymentBatchQueue({ workspaceId, basePath, rows, fallbackCurrency, isOwner, stat, initialSelectedId }: {
  workspaceId: string`, `export function PaymentBatchQueue({ workspaceId, basePath, rows: serverRows, fallbackCurrency, isOwner, currentUserId, stat, initialSelectedId }: {
  workspaceId: string
  currentUserId: string`],
  [`  const [markingPaid, setMarkingPaid] = useState<PaymentBatchRow | null>(null)
  const [busy, setBusy] = useState(false)`, `  const [markingPaid, setMarkingPaid] = useState<PaymentBatchRow | null>(null)
  const [unmarking, setUnmarking] = useState<PaymentBatchRow | null>(null)
  const [busy, setBusy] = useState(false)
  // A decision the server has confirmed shows on the row, the pane subtitle and the footer at
  // once, before \`router.refresh()\` re-renders the page — never an Approve offered twice. Cleared
  // when fresh rows arrive.
  const [decided, setDecided] = useState<Map<string, BatchView>>(new Map())
  useEffect(() => { setDecided(new Map()) }, [serverRows])
  const rows = decided.size === 0 ? serverRows : serverRows.map((batch) => decided.has(batch.id) ? { ...batch, view: decided.get(batch.id)! } : batch)
  // Stable identity: the pane refetches whenever \`loadDetail\` changes.
  const loadDetail = useCallback((batchId: string) => getPaymentBatchDetailAction(workspaceId, batchId), [workspaceId])`],
  [`      loadDetail={(batchId) => getPaymentBatchDetailAction(workspaceId, batchId)}`, `      loadDetail={loadDetail}`],
  [`      toast.success(\`\${approving.name} approved — the payment file is ready to download\`)
      setApproving(null)
      router.refresh()`, `      toast.success(\`\${approving.name} approved\`)
      setDecided((prev) => new Map(prev).set(approving.id, "approved"))
      setApproving(null)
      router.refresh()`],
  [`          if (!isOwner) return <p className="mr-auto text-xs text-slate-600">Waiting for an owner to approve.</p>
          return <>
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setRejecting(batch)}><XCircle className="h-3.5 w-3.5" aria-hidden />Reject…</Button>
            <Button type="button" size="sm" disabled={busy} onClick={() => setApproving(batch)}><CheckCircle2 className="h-3.5 w-3.5" aria-hidden />Approve</Button>
          </>`, `          if (!isOwner) return <p className="mr-auto text-xs text-slate-600">Waiting for an owner to decide it — submitted {formatPaymentDate(batch.createdAt)}.</p>
          return <>
            <Button type="button" className="lg:h-8 lg:text-xs" variant="outline" disabled={busy} onClick={() => setRejecting(batch)}><XCircle className="h-3.5 w-3.5" aria-hidden />Reject</Button>
            <Button type="button" className="lg:h-8 lg:text-xs" disabled={busy} onClick={() => setApproving(batch)}><CheckCircle2 className="h-3.5 w-3.5" aria-hidden />Approve</Button>
          </>`],
  [`            <Button asChild size="sm" variant="outline"><a className="py-1.5" href={\`/api/workspaces/\${workspaceId}/payment-runs/\${batch.id}/download\`} onClick={() => window.setTimeout(() => router.refresh(), 1500)}><Download className="h-3.5 w-3.5" aria-hidden />{batch.exportedAt ? "Download again" : "Download payment file"}</a></Button>
            {isOwner && <Button type="button" size="sm" disabled={busy} onClick={() => setMarkingPaid(batch)}><CheckCircle2 className="h-3.5 w-3.5" aria-hidden />Mark batch as paid…</Button>}`, `            {!isOwner && <p className="mr-auto text-xs text-slate-600">An owner marks it paid once the bank has taken the file.</p>}
            {batch.fileProblems > 0
              ? <Button asChild className="lg:h-8 lg:text-xs" variant="outline"><Link className="py-1.5" href={\`/workspaces/\${workspaceId}/settings/payments\`}><Landmark className="h-3.5 w-3.5" aria-hidden />Fix bank details to download</Link></Button>
              : <Button asChild className="lg:h-8 lg:text-xs" variant="outline"><a className="py-1.5" href={\`/api/workspaces/\${workspaceId}/payment-runs/\${batch.id}/download\`} download onClick={() => { const onFocus = () => { window.removeEventListener("focus", onFocus); router.refresh() }; window.addEventListener("focus", onFocus); window.setTimeout(() => router.refresh(), 2500) }}><Download className="h-3.5 w-3.5" aria-hidden />{batch.exportedAt ? "Download again" : "Download payment file"}</a></Button>}
            {isOwner && <Button type="button" className="lg:h-8 lg:text-xs" disabled={busy} onClick={() => setMarkingPaid(batch)}><CheckCircle2 className="h-3.5 w-3.5" aria-hidden />Mark batch as paid…</Button>}`],
  [`        if (batch.view === "paid") return <p className="mr-auto text-xs text-slate-600">Paid {formatPaymentDate(batch.paidAt)}{batch.paidBy ? \` by \${batch.paidBy.name}\` : ""}.</p>`, `        if (batch.view === "paid") return <>
          <p className="mr-auto text-xs text-slate-600">Paid {formatPaymentDate(batch.paidAt)}{batch.paidBy ? \` by \${batch.paidBy.name}\` : ""}.</p>
          {isOwner && <Button type="button" className="lg:h-8 lg:text-xs" variant="outline" disabled={busy} onClick={() => setUnmarking(batch)}>Remove payment records…</Button>}
        </>`],
  [`      description={\`\${approving?.billCount ?? 0} bill\${approving?.billCount === 1 ? "" : "s"}, \${approving ? money(approving.total, approving.currencyCode) : ""} from \${approving?.payFromLabel ?? "—"}. Approving makes the payment file available; no money moves until it is uploaded to the bank.\`}
      confirmLabel={busy ? "Approving…" : "Approve batch"}
      onConfirm={() => void approve()} onCancel={() => { if (!busy) setApproving(null) }}>
      {approving?.submittedBy && approving.submittedBy.name && <p className="text-xs text-slate-600">Submitted by {approving.submittedBy.name} · {formatPaymentDateTime(approving.createdAt)}</p>}
    </ConfirmDialog>`, `      description={\`\${approving?.billCount ?? 0} bill\${approving?.billCount === 1 ? "" : "s"}, \${approving ? money(approving.total, approving.currencyCode) : ""} from \${approving?.payFromLabel ?? "—"}. Submitted by \${approving?.submittedBy?.name ?? "—"} · \${approving ? formatPaymentDateTime(approving.createdAt) : ""}.\${approving?.submittedBy?.id === currentUserId ? " You submitted this batch — approving it yourself is allowed and recorded as such." : ""}\${approving?.discountExpiresInDays !== null && approving?.discountExpiresInDays !== undefined ? \` A discount in this batch expires \${approving.discountExpiresInDays === 0 ? "today" : \`in \${approving.discountExpiresInDays} day\${approving.discountExpiresInDays === 1 ? "" : "s"}\`}; the file pays the discounted amount.\` : ""} Approving makes the payment file available; no money moves until it is uploaded to the bank.\`}
      confirmLabel={busy ? "Approving…" : "Approve batch"}
      onConfirm={() => void approve()} onCancel={() => { if (!busy) setApproving(null) }} />

    <ReasonDialog open={unmarking !== null} onClose={() => setUnmarking(null)}
      action={async (formData) => {
        if (!unmarking) return { success: false, error: "No batch selected" }
        const result = await unmarkPaymentBatchPaidAction(workspaceId, unmarking.id, formData)
        if (result.success) { toast.success(\`\${unmarking.name} is Approved again — its payment records are removed\`); setDecided((prev) => new Map(prev).set(unmarking.id, "approved")); router.refresh() }
        return result
      }}
      title={\`Remove the payment records of \${unmarking?.name ?? "this batch"}\`}
      description="Every invoice in the batch reads Scheduled again and the batch returns to Approved. The payment file stays a fact. The reason is kept on the audit trail."
      submitLabel="Remove payment records"
      placeholder="Why was this batch marked paid in error?" />`],
  [`      recap={markingPaid && <p className="border-y border-slate-200 py-2 text-sm text-slate-700">{markingPaid.billCount} bill{markingPaid.billCount === 1 ? "" : "s"} · <span className="font-semibold tabular-nums text-slate-900">{money(markingPaid.total, markingPaid.currencyCode)}</span> · Pay From {markingPaid.payFromLabel}{!markingPaid.exportedAt && <span className="mt-1 block text-xs text-amber-800">The payment file hasn&apos;t been downloaded yet.</span>}</p>}`, `      recap={markingPaid && <div className="space-y-2">
        <p className="border-y border-slate-200 py-2 text-sm text-slate-700">{markingPaid.billCount} bill{markingPaid.billCount === 1 ? "" : "s"} · <span className="font-semibold tabular-nums text-slate-900">{money(markingPaid.total, markingPaid.currencyCode)}</span> · Pay From {markingPaid.payFromLabel}</p>
        {!markingPaid.exportedAt && <p role="alert" className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">The payment file hasn&apos;t been downloaded yet — nobody has taken this batch to the bank from here. Mark it paid only if the payment was made another way.</p>}
        <p className="text-xs text-slate-600">Reversal is “Remove payment records…” on the batch, with a reason.</p>
      </div>}`],
  [`        if (result.success) { toast.success(\`\${markingPaid.name} marked paid\`); router.refresh() }`, `        if (result.success) { toast.success(\`\${markingPaid.name} marked paid\`); setDecided((prev) => new Map(prev).set(markingPaid.id, "paid")); router.refresh() }`],
  [`        if (result.success) { toast.success(\`\${rejecting.name} rejected — its invoices are back on Bill Pay\`); router.refresh() }`, `        if (result.success) { toast.success(\`\${rejecting.name} rejected — its invoices are back on Bill Pay\`); setDecided((prev) => new Map(prev).set(rejecting.id, "rejected")); router.refresh() }`],
  [`import { CheckCircle2, Download, Loader2, XCircle } from "lucide-react"`, `import Link from "next/link"
import { CheckCircle2, Download, Landmark, Loader2, XCircle } from "lucide-react"`],
  // discount expiry on the row (H5 P1)
  [`          {countdown && countdown.urgency === "expiring" && <span className="rounded-full bg-purple-50 px-2 py-0.5 text-xs font-semibold text-purple-700">{countdown.label.replace("Expires", "Due")}</span>}`, `          {countdown && countdown.urgency === "expiring" && <span className="rounded-full bg-purple-50 px-2 py-0.5 text-xs font-semibold text-purple-700">{countdown.label.replace("Expires", "Due")}</span>}
          {batch.view === "pending_approval" && batch.discountExpiresInDays !== null && <DiscountCountdownBadge daysLeft={batch.discountExpiresInDays} />}`],
  [`import { MarkPaidDialog } from "@/components/payments/mark-paid-dialog"`, `import { MarkPaidDialog } from "@/components/payments/mark-paid-dialog"
import { DiscountCountdownBadge } from "@/components/documents/countdown-badge"`],
])

edit('app/(app)/workspaces/[workspaceId]/(queue)/payments/batches/page.tsx', [
  [`    isOwner={membership.role === "owner"}
    stat={stat}`, `    isOwner={membership.role === "owner"}
    currentUserId={user.id}
    stat={stat}`],
  [`  const stat = savings.anySupplierHasDiscount
    ? <QueueStat label="Early payment savings" value={formatPaymentMoney(savings.captured, currency, currency)}
      detail={\`\${savings.capturedCount} discount\${savings.capturedCount === 1 ? "" : "s"} taken in approved or paid batches · \${formatPaymentMoney(savings.available, currency, currency)} still open on \${savings.availableCount} Bill Pay row\${savings.availableCount === 1 ? "" : "s"}\`} />
    : undefined`, `  // #229 Q8: never an empty KPI. Captured savings lead; before any is captured the open discount
  // on Bill Pay is the figure; with neither, the stat says so rather than showing a zero.
  const detail = \`\${savings.capturedCount} discount\${savings.capturedCount === 1 ? "" : "s"} taken in approved or paid batches · \${formatPaymentMoney(savings.available, currency, currency)} still open on \${savings.availableCount} Bill Pay row\${savings.availableCount === 1 ? "" : "s"}\`
  const stat = !savings.anySupplierHasDiscount ? undefined
    : savings.captured > 0 ? <QueueStat label="Early payment savings" value={formatPaymentMoney(savings.captured, currency, currency)} detail={detail} />
    : savings.available > 0 ? <QueueStat label="Discount open on Bill Pay" value={formatPaymentMoney(savings.available, currency, currency)} detail={detail} />
    : <QueueStat label="Early payment savings" value="" detail={detail} unavailable="No discount taken yet, and none open on Bill Pay today." />`],
])

edit('components/payments/batch-detail.tsx', [
  [`import { useState } from "react"`, `import { useId, useState } from "react"`],
  [`  const [tab, setTab] = useState<"lines" | "remittance" | "audit">("lines")`, `  const [tab, setTab] = useState<"lines" | "remittance" | "audit">("lines")
  const tabId = useId()
  const TABS = ["lines", "remittance", "audit"] as const`],
  [`    <div role="tablist" aria-label="Batch detail" className="flex gap-1 border-b border-slate-200 px-4">
      {([["lines", "Lines"], ["remittance", \`Remittance (\${advices.length})\`], ["audit", \`Audit (\${audit.length})\`]] as const).map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}`, `    <div role="tablist" aria-label="Batch detail" className="flex gap-1 border-b border-slate-200 px-4"
      onKeyDown={(event) => {
        // ←/→ move between tabs (WAI-ARIA tabs pattern); Home/End jump.
        const index = TABS.indexOf(tab)
        const next = event.key === "ArrowRight" ? TABS[(index + 1) % TABS.length] : event.key === "ArrowLeft" ? TABS[(index + TABS.length - 1) % TABS.length] : event.key === "Home" ? TABS[0] : event.key === "End" ? TABS[TABS.length - 1] : null
        if (!next) return
        event.preventDefault(); setTab(next)
        ;(event.currentTarget.querySelector(\`[id="\${tabId}-tab-\${next}"]\`) as HTMLElement | null)?.focus()
      }}>
      {([["lines", "Lines"], ["remittance", \`Remittance (\${advices.length})\`], ["audit", \`Audit (\${audit.length})\`]] as const).map(([key, label]) => <button key={key} type="button" role="tab" id={\`\${tabId}-tab-\${key}\`} aria-selected={tab === key} aria-controls={\`\${tabId}-panel\`} tabIndex={tab === key ? 0 : -1} onClick={() => setTab(key)}`],
  [`    <div role="tabpanel" className="min-h-0 flex-1 overflow-y-auto px-4 py-3 text-sm">`, `    <div role="tabpanel" id={\`\${tabId}-panel\`} aria-labelledby={\`\${tabId}-tab-\${tab}\`} tabIndex={0} className="min-h-0 flex-1 overflow-y-auto px-4 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600">`],
  [`              className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600">`, `              className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600">`],
  [`    case "payment_batch.paid": return "Marked paid"`, `    case "payment_batch.paid": return "Marked paid"
    case "payment_batch.unpaid": return "Payment records removed"`],
  // the payment file explainer (H10) + from= on the line links (H3)
  [`        {(batch.view === "approved" || batch.view === "paid") && <Fact label="Payment file">{batch.exportedAt ? \`Downloaded by \${batch.exportedBy?.name ?? "—"} · \${formatPaymentDateTime(batch.exportedAt)}\` : "Not downloaded yet"}</Fact>}`, `        {(batch.view === "approved" || batch.view === "paid") && <Fact label="Payment file">{batch.exportedAt ? \`Downloaded by \${batch.exportedBy?.name ?? "—"} · \${formatPaymentDateTime(batch.exportedAt)}\` : "Not downloaded yet"} <span className="text-slate-500">· a bulk-payment CSV ({batch.filename}) for your bank&apos;s portal; upload it there, then mark the batch paid</span></Fact>}`],
  [`<Link href={\`\${invoicesHref}/\${line.documentId}\`} className="text-emerald-800 underline-offset-2 hover:underline">`, `<Link href={withOrigin(\`\${invoicesHref}/\${line.documentId}\`, origin)} className="text-emerald-800 underline-offset-2 hover:underline">`],
  [`import { BATCH_VIEW_LABEL } from "@/lib/payments/batch-status"`, `import { BATCH_VIEW_LABEL } from "@/lib/payments/batch-status"
import { useOriginHere } from "@/components/documents/po-compare"
import { withOrigin } from "@/lib/navigation/origin"`],
  [`  const invoicesHref = \`/workspaces/\${workspaceId}/invoices\``, `  const invoicesHref = \`/workspaces/\${workspaceId}/invoices\`
  const origin = useOriginHere()`],
])
console.log('ok')
