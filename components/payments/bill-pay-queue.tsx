"use client"

import { useCallback, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ExternalLink, Landmark, Layers, CheckCircle2, Wallet } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { QueueScreen, type QueueColumn, type SortOption } from "@/components/queue/queue-screen"
import { PaneMenuItem } from "@/components/queue/detail-pane"
import type { Facet } from "@/components/queue/facet-filters"
import { TitleCell } from "@/components/queue/row-cells"
import { DiscountCountdownBadge, DueDateCountdownBadge } from "@/components/documents/countdown-badge"
import { AgingBand } from "@/components/payments/aging-band"
import { AmountToPayCell } from "@/components/payments/amount-to-pay"
import { CreateBatchDialog } from "@/components/payments/create-batch-dialog"
import { MarkPaidDialog } from "@/components/payments/mark-paid-dialog"
import { ReasonDialog } from "@/components/list-screen/reason-dialog-button"
import { formatPaymentDate, formatPaymentMoney } from "@/components/payments/format"
import { ELIGIBILITY_COPY } from "@/lib/payments/eligibility"
import { payerAccountLabel } from "@/lib/payments/payer-account-label"
import { withOrigin } from "@/lib/navigation/origin"
import { useOriginHere } from "@/components/documents/po-compare"
import { getQueueDetailAction } from "@/app/(app)/workspaces/[workspaceId]/queue-actions"
import { createPaymentBatchesAction, markInvoicesPaidAction, removePaymentRecordsForDocumentAction, setAmountToPayAction, setPayFromAction } from "@/app/(app)/workspaces/[workspaceId]/(queue)/payments/actions"
import type { BillPayRow } from "@/models/bill-pay"
import type { BillsSummary } from "@/models/bills"
import type { PayerAccountRow } from "@/models/payer-accounts"

/** #229 Q7/Q10/Q12 (#251): the Bill Pay queue on the Queue screen — Approved, unpaid invoices
 * with their terms, discount window, amount to pay and Pay From. No processing-glyph column
 * (every row is Approved); the band above the header is *Open invoices by age*. */
export const BILL_PAY_FACETS: Facet[] = [
  {
    param: "status", label: "Status",
    options: [
      { value: "ready", label: "Ready to batch" }, { value: "scheduled", label: "Scheduled" }, { value: "needs_bank_details", label: "Needs bank details" },
    ],
  },
  { param: "discount", label: "Discount", kind: "toggle", options: [{ value: "1", label: "Discount available" }] },
  {
    param: "aging", label: "Aging", kind: "multi",
    options: [
      { value: "current", label: "Not yet due" }, { value: "1-30", label: "1–30 days overdue" }, { value: "31-60", label: "31–60 days overdue" },
      { value: "61-90", label: "61–90 days overdue" }, { value: "90+", label: "90+ days overdue" }, { value: "none", label: "No due date" },
    ],
  },
]

const SORTS: SortOption<BillPayRow>[] = [
  { key: "due", label: "Due date", compare: (a, b) => (a.bill.dueDate?.getTime() ?? Infinity) - (b.bill.dueDate?.getTime() ?? Infinity) },
  { key: "discount", label: "Discount expiring first", compare: (a, b) => (a.discount?.daysLeft ?? Infinity) - (b.discount?.daysLeft ?? Infinity) },
  { key: "amount", label: "Amount, high to low", compare: (a, b) => (b.amountToPay ?? -Infinity) - (a.amountToPay ?? -Infinity) },
  { key: "supplier", label: "Supplier A–Z", compare: (a, b) => (a.bill.supplier ?? "￿").localeCompare(b.bill.supplier ?? "￿") },
]

export function BillPayQueue({ workspaceId, basePath, rows, summary, payerAccounts, fallbackCurrency, suggestedBatchName, isOwner, initialSelectedId }: {
  workspaceId: string
  basePath: string
  rows: BillPayRow[]
  summary: BillsSummary
  payerAccounts: PayerAccountRow[]
  fallbackCurrency: string
  suggestedBatchName: string
  isOwner: boolean
  initialSelectedId?: string | null
}) {
  const router = useRouter()
  const [batching, setBatching] = useState<string[] | null>(null)
  const [markingPaid, setMarkingPaid] = useState<string[] | null>(null)
  const [settingPayFrom, setSettingPayFrom] = useState<string[] | null>(null)
  const [removingRecords, setRemovingRecords] = useState<BillPayRow | null>(null)
  const rowsById = useMemo(() => new Map(rows.map((row) => [row.bill.documentId, row])), [rows])
  const money = (value: number, currency: string | null) => formatPaymentMoney(value, currency, fallbackCurrency)
  const origin = useOriginHere()
  const settingsHref = withOrigin(`/workspaces/${workspaceId}/admin/configuration/payments`, origin)
  const [paidReceipt, setPaidReceipt] = useState<{ recorded: Array<{ documentId: string; amount: number }>; leftOut: Array<{ documentId: string; reason: string }>; rows: Map<string, BillPayRow> } | null>(null)
  // Stable identity: the pane refetches whenever `loadDetail` changes.
  const loadDetail = useCallback((documentId: string) => getQueueDetailAction(workspaceId, documentId), [workspaceId])
  const batchesHref = `/workspaces/${workspaceId}/payments/batches`

  const columns: QueueColumn<BillPayRow>[] = [
    {
      key: "supplier", label: "Supplier", narrow: true, className: "min-w-[12rem]",
      render: (row) => <TitleCell title={row.bill.supplier} missingLabel="Unknown supplier"
        subtitle={row.bill.paidState.state === "scheduled" ? `Scheduled · ${row.scheduledBatch?.name ?? "in a batch"}` : row.bill.paidState.state === "partially_paid" ? `Partially paid · ${money(row.bill.paidState.paidAmount, row.bill.currencyCode)} so far` : !row.eligibility.eligible ? ELIGIBILITY_COPY[row.eligibility.reason] : null} />,
    },
    { key: "number", label: "Invoice #", className: "whitespace-nowrap text-slate-700", render: (row) => row.bill.invoiceNumber ?? "—" },
    { key: "date", label: "Invoice date", className: "whitespace-nowrap tabular-nums text-slate-700", render: (row) => formatPaymentDate(row.bill.documentDate) },
    { key: "terms", label: "Terms", className: "whitespace-nowrap tabular-nums text-slate-700", render: (row) => row.termsLabel },
    {
      key: "due", label: "Due date", narrow: true, className: "whitespace-nowrap tabular-nums text-slate-700",
      render: (row) => <span className="inline-flex flex-wrap items-center gap-1.5">
        <span>{formatPaymentDate(row.bill.dueDate)}</span>
        <DueDateCountdownBadge dueDate={row.bill.dueDate} fallback="" />
        {row.discount && <DiscountCountdownBadge daysLeft={row.discount.daysLeft} />}
      </span>,
    },
    { key: "total", label: "Bill total", className: "whitespace-nowrap text-right tabular-nums text-slate-900", render: (row) => row.bill.total !== null ? money(row.bill.total, row.bill.currencyCode) : "—" },
    { key: "currency", label: "Currency", className: "whitespace-nowrap text-slate-700", render: (row) => (row.bill.currencyCode ?? fallbackCurrency).toUpperCase() },
    {
      key: "amount", label: "Amount to pay", narrow: true, className: "whitespace-nowrap text-right",
      render: (row) => <AmountToPayCell amountToPay={row.amountToPay} due={row.due} discountedTotal={row.discount?.discountedTotal ?? null} override={row.amountToPayOverride}
        currencyCode={row.bill.currencyCode} fallbackCurrency={fallbackCurrency} editable scheduled={row.bill.paidState.state === "scheduled"}
        onSave={async (amount) => { const result = await setAmountToPayAction(workspaceId, row.bill.documentId, amount, row.due ?? 0); if (result.success) router.refresh(); return result }} />,
    },
    {
      key: "payFrom", label: "Pay From", className: "whitespace-nowrap text-slate-700",
      render: (row) => row.payFrom ? <>{payerAccountLabel(row.payFrom)}{!row.payFromChosen && <span className="ml-1 text-xs text-slate-500" title="The workspace's default payer account — change it with Set Pay From">default<span className="sr-only"> (the workspace&apos;s default payer account; change it with Set Pay From)</span></span>}</> : "—",
    },
  ]

  const selectedRows = (ids: string[]) => ids.map((id) => rowsById.get(id)).filter((row): row is BillPayRow => !!row)

  return <>
    <QueueScreen<BillPayRow>
      title="Bill Pay"
      basePath={basePath}
      rows={rows}
      rowId={(row) => row.bill.documentId}
      rowName={(row) => ({ title: row.bill.supplier ?? "Unknown supplier", suffix: [row.bill.invoiceNumber, row.amountToPay !== null ? money(row.amountToPay, row.bill.currencyCode) : null, row.bill.dueDate ? `due ${formatPaymentDate(row.bill.dueDate)}` : null].filter(Boolean).join(" · ") })}
      columns={columns}
      selectable
      sortOptions={SORTS}
      facets={BILL_PAY_FACETS}
      band={<>
        <AgingBand summary={summary} currencyCode={fallbackCurrency} />
        {payerAccounts.length === 0 && rows.length > 0 && <p role="status" className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">No payer account yet, so nothing here can be batched. <Link href={settingsHref} className="font-medium underline underline-offset-2">Add one under Admin › Payments</Link>.</p>}
      </>}
      initialSelectedId={initialSelectedId}
      empty={{ done: { title: "Nothing to pay.", body: "Approved invoices land here." }, filteredBody: "Clear a filter to widen the queue." }}
      loadDetail={loadDetail}
      bulkActions={({ selectedIds }) => {
        const chosen = selectedRows(selectedIds)
        const eligible = chosen.filter((row) => row.eligibility.eligible).length
        const payable = chosen.filter((row) => row.bill.paidState.state !== "scheduled").length
        const hint = eligible === 0
          ? (payerAccounts.length === 0 ? "Add a payer account first." : "Nothing selected can be batched — each row says why.")
          : eligible < selectedIds.length ? `${selectedIds.length - eligible} of ${selectedIds.length} selected can't be batched — each row says why.` : null
        return <>
          <Button type="button" className="lg:h-8 lg:text-xs" disabled={eligible === 0} onClick={() => setBatching(selectedIds)}>
            <Layers className="h-3.5 w-3.5" aria-hidden />Create batch{eligible > 0 && eligible !== selectedIds.length ? ` (${eligible})` : ""}
          </Button>
          {isOwner && <Button type="button" className="lg:h-8 lg:text-xs" variant="outline" disabled={payable === 0} onClick={() => setMarkingPaid(selectedIds)}>
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />Mark as paid{payable > 0 && payable !== selectedIds.length ? ` (${payable})` : ""}
          </Button>}
          <Button type="button" className="lg:h-8 lg:text-xs" variant="outline" disabled={payable === 0 || payerAccounts.length === 0} onClick={() => setSettingPayFrom(chosen.filter((row) => row.bill.paidState.state !== "scheduled").map((row) => row.bill.documentId))}>
            <Wallet className="h-3.5 w-3.5" aria-hidden />Set Pay From{payable > 0 && payable !== selectedIds.length ? ` (${payable})` : ""}
          </Button>
          {hint && <span className="text-xs text-slate-600">{hint}</span>}
        </>
      }}
      paneActions={(row) => <>
        {!row.eligibility.eligible && row.eligibility.reason === "needs_bank_details" && <Button asChild className="lg:h-8 lg:text-xs" variant="outline"><Link className="py-1.5" href={`${settingsHref}#supplier-${row.bill.supplierId ?? ""}`}><Landmark className="h-3.5 w-3.5" aria-hidden />Add bank details</Link></Button>}
        {row.bill.paidState.state === "scheduled" && row.scheduledBatch && <Button asChild className="lg:h-8 lg:text-xs" variant="outline"><Link className="py-1.5" href={withOrigin(`${batchesHref}/${row.scheduledBatch.id}`, origin)}>Open batch {row.scheduledBatch.name ?? ""}</Link></Button>}
        {isOwner && row.bill.paidState.source === "recorded" && <Button type="button" className="lg:h-8 lg:text-xs" variant="outline" onClick={() => setRemovingRecords(row)}>Remove payment records…</Button>}
        {isOwner && row.bill.paidState.state !== "scheduled" && <Button type="button" className="lg:h-8 lg:text-xs" variant="outline" onClick={() => setMarkingPaid([row.bill.documentId])}>Mark as paid…</Button>}
        {payerAccounts.length > 0 && row.bill.paidState.state !== "scheduled" && <Button type="button" className="lg:h-8 lg:text-xs" variant="outline" onClick={() => setSettingPayFrom([row.bill.documentId])}><Wallet className="h-3.5 w-3.5" aria-hidden />Set Pay From…</Button>}
        {row.eligibility.eligible && <Button type="button" className="lg:h-8 lg:text-xs" onClick={() => setBatching([row.bill.documentId])}><Layers className="h-3.5 w-3.5" aria-hidden />Create batch</Button>}
      </>}
      paneMenu={(row) => <>
        <PaneMenuItem onClick={() => router.push(withOrigin(`/workspaces/${workspaceId}/invoices/${row.bill.documentId}`, window.location.pathname + window.location.search))}>
          <ExternalLink className="mr-2 h-4 w-4 text-slate-500" aria-hidden />Open on Invoices
        </PaneMenuItem>
      </>} />

    <CreateBatchDialog open={batching !== null} onClose={() => setBatching(null)} rows={batching ? selectedRows(batching) : []}
      suggestedName={suggestedBatchName} fallbackCurrency={fallbackCurrency} batchesHref={batchesHref} origin={origin}
      onCreate={(input) => createPaymentBatchesAction(workspaceId, input)}
      onCreated={() => router.refresh()} />

    <MarkPaidDialog open={markingPaid !== null} onClose={() => setMarkingPaid(null)}
      title={`Mark ${markingPaid?.length === 1 ? "this invoice" : `${markingPaid?.length ?? 0} invoices`} as paid`}
      description="Records a payment on DocuBite's side for each invoice's amount to pay. The ledger isn't changed; the row reads “Paid (recorded)” until the ledger confirms. Reversal is “Remove payment records…” on the invoice, with a reason."
      submitLabel="Record payment"
      recap={markingPaid && <MarkPaidRecap rows={selectedRows(markingPaid)} money={money} />}
      onSubmit={async (input) => {
        const ids = (markingPaid ?? []).filter((id) => rowsById.get(id)?.bill.paidState.state !== "scheduled")
        const result = await markInvoicesPaidAction(workspaceId, { documentIds: ids, ...input })
        if (result.success && result.data) { setPaidReceipt({ ...result.data, rows: new Map(selectedRows(markingPaid ?? []).map((row) => [row.bill.documentId, row])) }); router.refresh() }
        return result
      }} />

    <ReasonDialog open={removingRecords !== null} onClose={() => setRemovingRecords(null)}
      action={async (formData) => {
        if (!removingRecords) return { success: false, error: "No invoice selected" }
        const result = await removePaymentRecordsForDocumentAction(workspaceId, removingRecords.bill.documentId, formData)
        if (result.success) { toast.success(`Payment records removed — ${removingRecords.bill.supplier ?? "the invoice"} reads Unpaid again`); router.refresh() }
        return result
      }}
      title={`Remove the payment records on ${removingRecords?.bill.invoiceNumber ?? "this invoice"}`}
      description={`${removingRecords ? money(removingRecords.bill.paidState.paidAmount, removingRecords.bill.currencyCode) : ""} recorded as paid by hand comes off; the invoice reads Unpaid again. The reason is kept on the audit trail. Payments recorded by a batch are removed from the batch.`}
      submitLabel="Remove payment records"
      placeholder="Why were these payments recorded in error?" />

    <Dialog open={paidReceipt !== null} onClose={() => setPaidReceipt(null)} title={`${paidReceipt?.recorded.length ?? 0} payment${paidReceipt?.recorded.length === 1 ? "" : "s"} recorded`}
      description="Each invoice now reads “Paid (recorded)” on Invoices until the ledger confirms. Reversal is “Remove payment records…” on the invoice, with a reason.">
      <div className="max-h-[60vh] space-y-3 overflow-y-auto px-5 py-4 text-sm">
        {paidReceipt && paidReceipt.recorded.length > 0 && <ul className="divide-y divide-slate-100 border-y border-slate-200">
          {paidReceipt.recorded.map((line) => { const row = paidReceipt.rows.get(line.documentId); return <li key={line.documentId} className="flex items-center justify-between gap-2 py-2"><span className="text-slate-800">{row?.bill.supplier ?? "Invoice"}{row?.bill.invoiceNumber ? ` · ${row.bill.invoiceNumber}` : ""}</span><span className="tabular-nums text-slate-900">{money(line.amount, row?.bill.currencyCode ?? null)}</span></li> })}
        </ul>}
        {paidReceipt && paidReceipt.leftOut.length > 0 && <section>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-700">Left out ({paidReceipt.leftOut.length})</h3>
          <ul className="divide-y divide-slate-100 border-y border-slate-200">
            {paidReceipt.leftOut.map((line) => { const row = paidReceipt.rows.get(line.documentId); return <li key={line.documentId} className="flex items-center justify-between gap-2 py-2"><span className="text-slate-800">{row?.bill.supplier ?? "Invoice"}{row?.bill.invoiceNumber ? ` · ${row.bill.invoiceNumber}` : ""}</span><span className="text-slate-600">{line.reason}</span></li> })}
          </ul>
        </section>}
      </div>
      <div className="flex justify-end border-t px-5 py-3"><Button type="button" size="sm" onClick={() => setPaidReceipt(null)}>Done</Button></div>
    </Dialog>

    <SetPayFromDialog open={settingPayFrom !== null} onClose={() => setSettingPayFrom(null)} accounts={payerAccounts} count={settingPayFrom?.length ?? 0}
      onSubmit={async (accountId) => {
        const result = await setPayFromAction(workspaceId, settingPayFrom ?? [], accountId)
        if (result.success) { toast.success(`Pay From set on ${result.data?.updated ?? 0} invoice${result.data?.updated === 1 ? "" : "s"}`); router.refresh() }
        return result
      }} />
  </>
}

function MarkPaidRecap({ rows, money }: { rows: BillPayRow[]; money: (value: number, currency: string | null) => string }) {
  const scheduled = rows.filter((row) => row.bill.paidState.state === "scheduled")
  const payable = rows.filter((row) => row.bill.paidState.state !== "scheduled")
  return <div className="space-y-2">
    <ul className="max-h-48 divide-y divide-slate-100 overflow-y-auto border-y border-slate-200 text-sm">
      {payable.map((row) => <li key={row.bill.documentId} className="flex items-center justify-between gap-2 px-3 py-2">
        <span className="min-w-0 truncate text-slate-800">{row.bill.supplier ?? "Unknown supplier"}{row.bill.invoiceNumber ? ` · ${row.bill.invoiceNumber}` : ""}</span>
        <span className="shrink-0 tabular-nums text-slate-900">{row.amountToPay !== null ? money(row.amountToPay, row.bill.currencyCode) : "—"}</span>
      </li>)}
    </ul>
    {scheduled.length > 0 && <p className="text-xs text-slate-600">{scheduled.length} scheduled invoice{scheduled.length === 1 ? " is" : "s are"} left out — the batch records those when it is marked paid.</p>}
  </div>
}

function SetPayFromDialog({ open, onClose, accounts, count, onSubmit }: {
  open: boolean
  onClose: () => void
  accounts: PayerAccountRow[]
  count: number
  onSubmit: (accountId: string) => Promise<{ success: boolean; error?: string }>
}) {
  const initial = accounts.find((a) => a.isDefault)?.id ?? accounts[0]?.id ?? ""
  const [accountId, setAccountId] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const close = () => { if (busy) return; onClose(); setAccountId(initial); setError(null) }
  return <Dialog open={open} onClose={close} title="Set Pay From" description={`The payer account ${count === 1 ? "this invoice" : `these ${count} invoices`} will be paid from. One batch pays from one account.`}>
    <form className="space-y-4 px-5 py-4" onSubmit={async (event) => {
      event.preventDefault(); setBusy(true); setError(null)
      try { const result = await onSubmit(accountId); if (!result.success) setError(result.error ?? "Couldn't set Pay From."); else close() }
      catch { setError("Couldn't reach the server. Nothing changed — try again.") } finally { setBusy(false) }
    }}>
      <fieldset className="space-y-1">
        <legend className="mb-1 text-sm font-medium text-slate-800">Payer account</legend>
        {accounts.map((account) => <label key={account.id} className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-sm hover:bg-slate-50">
          <input type="radio" name="payFrom" value={account.id} checked={accountId === account.id} onChange={() => setAccountId(account.id)} className="h-4 w-4 accent-emerald-700" />
          <span className="text-slate-900">{payerAccountLabel(account)}</span>
          <span className="text-xs text-slate-600">{account.currencyCode}{account.isDefault ? " · default" : ""}</span>
        </label>)}
      </fieldset>
      {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={close}>Cancel</Button>
        <Button type="submit" size="sm" disabled={busy || !accountId}>{busy ? "Saving…" : "Set Pay From"}</Button>
      </div>
    </form>
  </Dialog>
}
