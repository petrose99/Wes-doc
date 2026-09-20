"use client"

import { useId, useState } from "react"
import Link from "next/link"
import { AlertTriangle, Copy } from "lucide-react"
import { toast } from "sonner"
import { formatPaymentDate, formatPaymentDateTime, formatPaymentMoney } from "@/components/payments/format"
import { BATCH_VIEW_LABEL } from "@/lib/payments/batch-status"
import { describeBatchCounts } from "@/lib/payments/batch-counts"
import { useOriginHere } from "@/components/documents/po-compare"
import { withOrigin } from "@/lib/navigation/origin"
import type { PaymentBatchDetail as Detail } from "@/models/payment-batches"

/** #229 Q11 (#251): the Payment Batches Detail pane body — a summary strip (the batch's facts
 * in one line each: who submitted, who decided, whether the file was downloaded, when it was
 * paid), the supplier-grouped lines, the remittance advices the incumbent built and threw away,
 * and an Audit tab. The sticky footer (Reject · Approve, Download · Mark paid) is the queue's
 * `paneActions`, so this component only shows; it never decides. */
const PILL: Record<Detail["batch"]["view"], string> = {
  pending_approval: "bg-blue-100 text-blue-800",
  approved: "bg-emerald-100 text-emerald-800",
  paid: "bg-slate-200 text-slate-800",
  rejected: "bg-amber-100 text-amber-900",
}

export function PaymentBatchDetail({ workspaceId, detail, currentUserId, isOwner }: { workspaceId: string; detail: Detail; currentUserId: string; isOwner: boolean }) {
  const { batch, suppliers, reimbursements, advices, audit, fileProblems } = detail
  const [tab, setTab] = useState<"lines" | "remittance" | "audit">("lines")
  const tabId = useId()
  const TABS = ["lines", "remittance", "audit"] as const
  const money = (value: number, currency?: string | null) => formatPaymentMoney(value, currency ?? batch.currencyCode, batch.currencyCode)
  const selfSubmitted = batch.submittedBy?.id === currentUserId
  const invoicesHref = `/workspaces/${workspaceId}/invoices`
  const origin = useOriginHere()

  return <div className="flex h-full min-h-0 flex-col">
    <div className="space-y-2 border-b border-slate-200 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${PILL[batch.view]}`}>{BATCH_VIEW_LABEL[batch.view]}</span>
        <span className="font-semibold tabular-nums text-slate-900">{money(batch.total)}</span>
        <span className="text-slate-600">{describeBatchCounts(batch.billCount, batch.claimCount)} · {batch.currencyCode} · Pay From {batch.payFromLabel}</span>
      </div>
      <dl className="grid gap-x-4 gap-y-1 text-xs text-slate-700 sm:grid-cols-2">
        <Fact label="Submitted">{batch.submittedBy?.name ?? "—"} · {formatPaymentDateTime(batch.createdAt)}{selfSubmitted && batch.view === "pending_approval" && isOwner && <span className="ml-1 inline-block rounded bg-amber-50 px-1.5 py-0.5 text-amber-800">You submitted this batch</span>}</Fact>
        {batch.view === "rejected" && <Fact label="Rejected">{batch.rejectedBy?.name ?? "—"} · {formatPaymentDateTime(batch.rejectedAt)}</Fact>}
        {(batch.view === "approved" || batch.view === "paid") && <Fact label="Approved">{batch.approvedBy?.name ?? "—"} · {formatPaymentDateTime(batch.approvedAt)}{batch.approvedBy && batch.approvedBy.id === batch.submittedBy?.id && <span className="ml-1 text-slate-500">(self-approved)</span>}</Fact>}
        {(batch.view === "approved" || batch.view === "paid") && <Fact label="Payment file">{batch.exportedAt ? `Downloaded by ${batch.exportedBy?.name ?? "—"} · ${formatPaymentDateTime(batch.exportedAt)}` : "Not downloaded yet"}</Fact>}
        {batch.view === "paid" && <Fact label="Marked paid">{batch.paidBy?.name ?? "—"} · {formatPaymentDateTime(batch.paidAt)}</Fact>}
        {batch.earliestDue && <Fact label="Earliest due">{formatPaymentDate(batch.earliestDue)}</Fact>}
      </dl>
      {batch.view === "approved" && <p className="max-w-[48ch] text-xs text-slate-600">The payment file is a bulk-payment CSV ({batch.filename}) for your bank&apos;s portal. Upload it there, then mark the batch paid.</p>}
      {batch.view === "approved" && isOwner && batch.approvedBy?.id === batch.submittedBy?.id && <p className="max-w-[48ch] text-xs text-slate-600">You submitted this batch. Approving it yourself is recorded on the audit trail; you can still reject it until it is marked paid.</p>}
      {batch.view === "rejected" && batch.rejectedReason && <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900"><span className="font-medium">Reason:</span> {batch.rejectedReason}. The invoices are back on Bill Pay.</p>}
      {batch.comment && <p className="text-xs text-slate-700"><span className="font-medium text-slate-800">Comment:</span> {batch.comment}</p>}
      {fileProblems.length > 0 && batch.view !== "paid" && batch.view !== "rejected" && <div role="alert" className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-800">
        <p className="flex items-center gap-1.5 font-medium"><AlertTriangle className="h-3.5 w-3.5" aria-hidden />The payment file can&apos;t be written as it stands ({fileProblems.length} problem{fileProblems.length === 1 ? "" : "s"}):</p>
        <ul className="mt-1 list-disc pl-5">{fileProblems.map((problem) => <li key={problem}>{problem}</li>)}</ul>
        <p className="mt-1">Fix the supplier&apos;s bank details under <Link href={withOrigin(`/workspaces/${workspaceId}/admin/suppliers`, origin)} className="underline">Admin › Suppliers</Link>, then download again.</p>
      </div>}
    </div>

    <div role="tablist" aria-label="Batch detail" className="flex gap-1 border-b border-slate-200 px-4"
      onKeyDown={(event) => {
        // ←/→ move between tabs (WAI-ARIA tabs pattern); Home/End jump.
        const index = TABS.indexOf(tab)
        const next = event.key === "ArrowRight" ? TABS[(index + 1) % TABS.length] : event.key === "ArrowLeft" ? TABS[(index + TABS.length - 1) % TABS.length] : event.key === "Home" ? TABS[0] : event.key === "End" ? TABS[TABS.length - 1] : null
        if (!next) return
        event.preventDefault(); setTab(next)
        ;(event.currentTarget.querySelector(`[id="${tabId}-tab-${next}"]`) as HTMLElement | null)?.focus()
      }}>
      {([["lines", "Lines"], ["remittance", `Remittance (${advices.length})`], ["audit", `Audit (${audit.length})`]] as const).map(([key, label]) => <button key={key} type="button" role="tab" id={`${tabId}-tab-${key}`} aria-selected={tab === key} aria-controls={`${tabId}-panel`} tabIndex={tab === key ? 0 : -1} onClick={() => setTab(key)}
        className={`-mb-px border-b-2 px-2 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${tab === key ? "border-emerald-700 text-emerald-800" : "border-transparent text-slate-600 hover:text-slate-900"}`}>{label}</button>)}
    </div>

    <div role="tabpanel" id={`${tabId}-panel`} aria-labelledby={`${tabId}-tab-${tab}`} tabIndex={0} className="min-h-0 flex-1 overflow-y-auto px-4 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600">
      {tab === "lines" && (suppliers.length === 0 && !reimbursements ? <p className="text-slate-600">This batch holds no lines.</p> : <div className="space-y-4">
        {suppliers.map((group) => <section key={group.supplier} aria-label={group.supplier}>
          <h3 className="mb-1 flex items-baseline justify-between gap-2 text-sm font-semibold text-slate-900"><span>{group.supplier}</span><span className="tabular-nums">{money(group.total, group.lines[0]?.currencyCode)}</span></h3>
          <table className="w-full text-sm">
            <thead className="text-left text-xs font-medium uppercase tracking-wide text-slate-600"><tr><th scope="col" className="py-1 pr-2">Invoice</th><th scope="col" className="py-1 pr-2">Due</th><th scope="col" className="py-1 pr-2 text-right">Bill total</th><th scope="col" className="py-1 text-right">Amount</th></tr></thead>
            <tbody>
              {group.lines.map((line) => <tr key={line.itemId} className="border-t border-slate-100">
                <td className="py-1.5 pr-2 text-slate-800">{line.documentId ? <Link href={withOrigin(`${invoicesHref}/${line.documentId}`, origin)} className="text-emerald-800 underline-offset-2 hover:underline">{line.invoiceNumber ?? line.reference}</Link> : <span>{line.reference} <span className="text-xs text-slate-500">(invoice deleted)</span></span>}</td>
                <td className="py-1.5 pr-2 tabular-nums text-slate-700">{formatPaymentDate(line.dueDate)}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums text-slate-700">{line.billTotal !== null ? money(line.billTotal, line.currencyCode) : "—"}</td>
                <td className="py-1.5 text-right tabular-nums text-slate-900">{money(line.amount, line.currencyCode)}{line.billTotal !== null && Math.round(line.billTotal * 100) > Math.round(line.amount * 100) && <span className="ml-1 text-xs text-emerald-700">−{money(line.billTotal - line.amount, line.currencyCode)}</span>}</td>
              </tr>)}
            </tbody>
          </table>
        </section>)}
        {reimbursements && <section aria-label="Reimbursements">
          <h3 className="mb-1 flex items-baseline justify-between gap-2 text-sm font-semibold text-slate-900"><span>Reimbursements</span><span className="tabular-nums">{money(reimbursements.total, reimbursements.lines[0]?.currencyCode)}</span></h3>
          <table className="w-full text-sm">
            <thead className="text-left text-xs font-medium uppercase tracking-wide text-slate-600"><tr><th scope="col" className="py-1 pr-2">Claimant</th><th scope="col" className="py-1 pr-2">Approved</th><th scope="col" className="py-1 text-right">Amount</th></tr></thead>
            <tbody>
              {reimbursements.lines.map((line) => <tr key={line.itemId} className="border-t border-slate-100">
                <td className="py-1.5 pr-2 text-slate-800">{line.claimId ? <Link href={withOrigin(`/workspaces/${workspaceId}/approvals/expense-claims?claim=${line.claimId}`, origin)} className="text-emerald-800 underline-offset-2 hover:underline">{line.supplier}</Link> : <span>{line.supplier}</span>}<div className="text-xs text-slate-500">{line.reference}</div></td>
                <td className="py-1.5 pr-2 tabular-nums text-slate-700">{formatPaymentDate(line.approvedAt)}</td>
                <td className="py-1.5 text-right tabular-nums text-slate-900">{money(line.amount, line.currencyCode)}</td>
              </tr>)}
            </tbody>
          </table>
        </section>}
      </div>)}

      {tab === "remittance" && <div className="space-y-3">
        <p className="text-xs text-slate-600">One advice per supplier and currency, ready to paste into an email once the bank has taken the file.</p>
        {advices.map((advice) => <section key={`${advice.supplier}:${advice.currencyCode}`} className="rounded-md ring-1 ring-slate-200">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
            <span className="text-sm font-medium text-slate-900">{advice.supplier} <span className="font-normal text-slate-600">· {money(advice.totalAmount, advice.currencyCode)}</span></span>
            <button type="button" onClick={() => { void navigator.clipboard.writeText(advice.text).then(() => toast.success("Remittance advice copied")) }}
              className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600">
              <Copy className="h-3.5 w-3.5" aria-hidden />Copy
            </button>
          </div>
          <pre className="overflow-x-auto whitespace-pre-wrap px-3 py-2 font-mono text-xs leading-5 text-slate-800">{advice.text}</pre>
        </section>)}
      </div>}

      {tab === "audit" && (audit.length === 0 ? <p className="text-slate-600">No events recorded yet.</p> : <ol className="space-y-2">
        {audit.map((event) => <li key={event.id} className="flex gap-3 text-sm">
          <span className="w-36 shrink-0 tabular-nums text-xs text-slate-500">{formatPaymentDateTime(event.at)}</span>
          <span className="text-slate-800"><span className="font-medium">{auditLabel(event.type)}</span>{event.actor ? ` · ${event.actor}` : ""}{auditDetail(event.detail)}</span>
        </li>)}
      </ol>)}
    </div>
  </div>
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex gap-1.5"><dt className="shrink-0 font-medium text-slate-800">{label}</dt><dd className="min-w-0">{children}</dd></div>
}

function auditLabel(type: string): string {
  switch (type) {
    case "payment_batch.submitted": return "Submitted for approval"
    case "payment_batch.approved": return "Approved"
    case "payment_batch.rejected": return "Rejected"
    case "payment_batch.exported": return "Payment file downloaded"
    case "payment_batch.paid": return "Marked paid"
    case "payment_batch.unpaid": return "Payment records removed"
    default: return type.replace("payment_batch.", "").replaceAll("_", " ")
  }
}

function auditDetail(detail: Record<string, unknown> | null): string {
  if (!detail) return ""
  const parts: string[] = []
  if (typeof detail.reason === "string") parts.push(`“${detail.reason}”`)
  if (detail.selfApproved === true) parts.push("self-approved")
  if (detail.fromStatus === "approved") parts.push("from Approved")
  if (typeof detail.paidOn === "string") parts.push(`paid on ${detail.paidOn}`)
  if (Array.isArray(detail.leftOut) && detail.leftOut.length) parts.push(`${detail.leftOut.length} left out`)
  return parts.length ? ` — ${parts.join(", ")}` : ""
}
