"use client"

import { useState } from "react"
import Link from "next/link"
import { CheckCircle2, Loader2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { formatPaymentDate, formatPaymentMoney } from "@/components/payments/format"
import { splitBatchName, splitIntoBatches } from "@/lib/payments/batch-split"
import { ELIGIBILITY_COPY, CLAIM_ELIGIBILITY_COPY } from "@/lib/payments/eligibility"
import { payerAccountLabel } from "@/lib/payments/payer-account-label"
import { describeBatchCounts } from "@/lib/payments/batch-counts"
import { withOrigin } from "@/lib/navigation/origin"
import { rowId, rowPayeeName, rowAmount, rowCurrency, rowPayFrom } from "@/lib/payments/bill-pay-row"
import type { BillPayRow, BillPayBillRow, BillPayClaimRow } from "@/models/bill-pay"
import type { PayerAccountRow } from "@/models/payer-accounts"
import type { CreateBatchesResult } from "@/models/payment-batches"

/** #229 Q1/Q4 (#251): the Create batch dialog — the batch's only draft. A real Dialog (the
 * incumbent's `max-w-sm` ConfirmDialog clipped its recap), focus moved in, rows grouped by
 * supplier with a per-line Remove, a footer of Bills · Total · Pay From, and the split rule
 * said out loud before anything is written. After the server confirms, the same dialog becomes
 * the receipt: which rows went into which batch and which were left out and why. */
export function CreateBatchDialog({ open, onClose, rows, defaultPayerAccount, suggestedName, fallbackCurrency, batchesHref, origin, onCreate, onCreated }: {
  open: boolean
  onClose: () => void
  rows: BillPayRow[]
  /** The claim branch has no Pay From of its own — a claim reimbursement pays from the
   * workspace's default account (§4's `rowPayFrom`). */
  defaultPayerAccount: PayerAccountRow | null
  suggestedName: string
  fallbackCurrency: string
  batchesHref: string
  /** The queue's own address, carried as `from=` on every hop to Payment Batches (#244). */
  origin: string
  onCreate: (input: { documentIds: string[]; name: string | null; comment: string | null }) => Promise<{ success: boolean; error?: string; data?: CreateBatchesResult }>
  onCreated: () => void
}) {
  const [removed, setRemoved] = useState<Set<string>>(new Set())
  const [name, setName] = useState(suggestedName)
  const [comment, setComment] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<CreateBatchesResult | null>(null)

  const kept = rows.filter((row) => !removed.has(rowId(row)))
  const eligible = kept.filter((row) => row.eligibility.eligible)
  const ineligible = kept.filter((row) => !row.eligibility.eligible)
  // The React Compiler memoizes these; manual useMemo over a filtered array only fights it.
  const groups = splitIntoBatches(eligible.map((row) => ({ payFromAccountId: rowPayFrom(row, defaultPayerAccount)?.id ?? null, currencyCode: (rowCurrency(row) ?? fallbackCurrency).toUpperCase(), row })))
  const total = eligible.reduce((sum, row) => sum + Math.round((rowAmount(row) ?? 0) * 100), 0) / 100
  const billRows = eligible.filter((row): row is BillPayBillRow => row.kind === "bill")
  const claimRows = eligible.filter((row): row is BillPayClaimRow => row.kind === "claim")
  const supplierMap = new Map<string, BillPayBillRow[]>()
  for (const row of billRows) { const key = row.bill.supplier ?? "Unknown supplier"; supplierMap.set(key, [...(supplierMap.get(key) ?? []), row]) }
  const bySupplier = [...supplierMap.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  const claimsTotal = claimRows.reduce((sum, row) => sum + Math.round((row.claim.total ?? 0) * 100), 0) / 100
  const money = (value: number, currency: string | null) => formatPaymentMoney(value, currency, fallbackCurrency)

  const close = () => { if (busy) return; onClose(); setRemoved(new Set()); setError(null); setReceipt(null); setName(suggestedName); setComment("") }
  const submit = async () => {
    if (eligible.length === 0) { setError("Nothing eligible is left in this selection."); return }
    setBusy(true); setError(null)
    try {
      const result = await onCreate({ documentIds: eligible.map((row) => rowId(row)), name: name.trim() || null, comment: comment.trim() || null })
      if (!result.success || !result.data) { setError(result.error ?? "Couldn't create the batch."); return }
      setReceipt(result.data)
      onCreated()
    } catch {
      setError("Couldn't reach the server. Nothing was created — try again.")
    } finally { setBusy(false) }
  }

  if (receipt) {
    return <Dialog open={open} onClose={close} title={receipt.batches.length === 0 ? "No batch created" : receipt.batches.length === 1 ? "Batch created — pending approval" : `${receipt.batches.length} batches created — pending approval`} width="max-w-2xl"
      description={receipt.batches.length === 0 ? "Nothing in the selection could be batched." : "An owner decides it on Payment Batches. No money moves."}>
      <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-4">
        {receipt.batches.length > 0 && <section>
          <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden />Submitted ({receipt.batches.length})</h3>
          <ul className="divide-y divide-slate-100 border-y border-slate-200">
            {receipt.batches.map((batch) => <li key={batch.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
              <Link href={withOrigin(`${batchesHref}/${batch.id}`, origin)} className="font-medium text-emerald-800 underline-offset-2 hover:underline">{batch.name}</Link>
              <span className="text-slate-600">{describeBatchCounts(batch.billCount, batch.claimCount)}</span>
              <span className="tabular-nums text-slate-900">{money(batch.total, batch.currencyCode)}</span>
              <span className="text-slate-600">Pay From {batch.payFromLabel}</span>
            </li>)}
          </ul>
        </section>}
        {receipt.leftOut.length > 0 && <section>
          <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700"><X className="h-3.5 w-3.5" aria-hidden />Left out ({receipt.leftOut.length})</h3>
          <ul className="divide-y divide-slate-100 border-y border-slate-200">
            {receipt.leftOut.map((line) => <li key={line.documentId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className="text-slate-800">{line.supplier ?? "Unknown supplier"}{line.invoiceNumber ? ` · ${line.invoiceNumber}` : ""}</span>
              <span className="text-slate-600">{line.reason}</span>
            </li>)}
          </ul>
        </section>}
      </div>
      <div className="flex justify-end gap-2 border-t px-5 py-3">
        {receipt.batches.length > 0 && <Button asChild size="sm" variant="outline"><Link className="py-1.5" href={withOrigin(batchesHref, origin)}>Open Payment Batches</Link></Button>}
        <Button type="button" size="sm" onClick={close}>Done</Button>
      </div>
    </Dialog>
  }

  return <Dialog open={open} onClose={close} title="Create batch" width="max-w-2xl"
    description="The batch goes to an owner for approval. No money moves.">
    <form className="flex max-h-[75vh] flex-col" onSubmit={(event) => { event.preventDefault(); void submit() }}>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-800">Batch name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} required maxLength={80}
              className="h-9 w-full rounded-md border border-slate-300 px-2 text-sm tabular-nums text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-800">Comment <span className="font-normal text-slate-500">(optional)</span></span>
            <input value={comment} onChange={(event) => setComment(event.target.value)} maxLength={280} placeholder="For the approver — why now, anything unusual"
              className="h-9 w-full rounded-md border border-slate-300 px-2 text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-600" />
          </label>
        </div>

        <div className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${ineligible.length === 0 ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
          <span className={`h-2 w-2 shrink-0 rounded-full ${ineligible.length === 0 ? "bg-emerald-500" : "bg-amber-500"}`} aria-hidden />
          <span className="font-medium">Eligible for payment ({eligible.length} of {kept.length})</span>
        </div>

        {groups.length > 1 && <p role="status" className="border-l-2 border-slate-300 py-1 pl-3 text-sm text-slate-700">
          One batch pays from one account in one currency, so this selection becomes <span className="font-medium text-slate-900">{groups.length} batches</span>: {groups.map((group, index) => `${splitBatchName(name.trim() || suggestedName, groups.length, group.currencyCode, index)} (${group.lines.length} line${group.lines.length === 1 ? "" : "s"} · ${group.currencyCode} · ${payerAccountLabel(rowPayFrom(group.lines[0].row, defaultPayerAccount))})`).join("; ")}.
        </p>}

        {bySupplier.length > 0 && <div className="border-t border-slate-200 pt-1">
          <table className="w-full text-sm">
            <thead className="text-left text-xs font-medium uppercase tracking-wide text-slate-600">
              <tr><th scope="col" className="px-3 py-2">Supplier · Invoice</th><th scope="col" className="px-3 py-2">Due</th><th scope="col" className="px-3 py-2 text-right">Amount to pay</th><th scope="col" className="px-3 py-2"><span className="sr-only">Remove</span></th></tr>
            </thead>
            {bySupplier.map(([supplier, lines]) => <tbody key={supplier} className="border-t border-slate-100">
              <tr className="bg-slate-50"><th scope="rowgroup" colSpan={4} className="px-3 py-1.5 text-left text-xs font-semibold text-slate-800">{supplier} <span className="font-normal text-slate-600">· {lines.length} bill{lines.length === 1 ? "" : "s"} · {money(lines.reduce((sum, row) => sum + Math.round((row.amountToPay ?? 0) * 100), 0) / 100, lines[0].bill.currencyCode)}</span></th></tr>
              {lines.map((row) => <tr key={row.bill.documentId} className="border-t border-slate-100">
                <td className="px-3 py-2 text-slate-800">{row.bill.invoiceNumber ?? row.bill.filename}</td>
                <td className="px-3 py-2 tabular-nums text-slate-700">{formatPaymentDate(row.bill.dueDate)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-900">
                  {money(row.amountToPay ?? 0, row.bill.currencyCode)}
                  {row.discount && row.amountToPayOverride === null && <span className="ml-1 text-xs text-emerald-700">{row.discount.discountPercent}% discount</span>}
                </td>
                <td className="px-2 py-1 text-right">
                  <button type="button" onClick={() => setRemoved((prev) => new Set(prev).add(row.bill.documentId))} aria-label={`Remove ${row.bill.supplier ?? "invoice"} ${row.bill.invoiceNumber ?? ""} from this batch`}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600">
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                </td>
              </tr>)}
            </tbody>)}
          </table>
        </div>}

        {claimRows.length > 0 && <div className="border-t border-slate-200 pt-1">
          <table className="w-full text-sm">
            <thead className="text-left text-xs font-medium uppercase tracking-wide text-slate-600">
              <tr><th scope="col" className="px-3 py-2">Claimant</th><th scope="col" className="px-3 py-2">Approved</th><th scope="col" className="px-3 py-2 text-right">Amount</th><th scope="col" className="px-3 py-2"><span className="sr-only">Remove</span></th></tr>
            </thead>
            <tbody className="border-t border-slate-100">
              <tr className="bg-slate-50"><th scope="rowgroup" colSpan={4} className="px-3 py-1.5 text-left text-xs font-semibold text-slate-800">Reimbursements <span className="font-normal text-slate-600">· {claimRows.length} claim{claimRows.length === 1 ? "" : "s"} · {money(claimsTotal, claimRows[0]?.claim.currencyCode ?? null)}</span></th></tr>
              {claimRows.map((row) => <tr key={row.claim.id} className="border-t border-slate-100">
                <td className="px-3 py-2 text-slate-800">{rowPayeeName(row) ?? "Unknown claimant"}</td>
                <td className="px-3 py-2 tabular-nums text-slate-700">{formatPaymentDate(row.claim.resolvedAt)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-900">{money(rowAmount(row) ?? 0, row.claim.currencyCode)}</td>
                <td className="px-2 py-1 text-right">
                  <button type="button" onClick={() => setRemoved((prev) => new Set(prev).add(row.claim.id))} aria-label={`Remove ${rowPayeeName(row) ?? "claim"} from this batch`}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600">
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                </td>
              </tr>)}
            </tbody>
          </table>
        </div>}

        {ineligible.length > 0 && <section>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700">Left out ({ineligible.length})</h3>
          <ul className="divide-y divide-slate-100 border-y border-slate-200">
            {ineligible.map((row) => <li key={rowId(row)} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className="text-slate-800">{rowPayeeName(row) ?? "Unknown supplier"}{row.kind === "bill" && row.bill.invoiceNumber ? ` · ${row.bill.invoiceNumber}` : ""}</span>
              <span className="text-slate-600">{row.scheduledBatch ? <Link href={withOrigin(`${batchesHref}/${row.scheduledBatch.id}`, origin)} className="text-emerald-800 underline-offset-2 hover:underline">Already in {row.scheduledBatch.name ?? "a batch"}</Link> : row.kind === "bill" && !row.eligibility.eligible ? ELIGIBILITY_COPY[row.eligibility.reason] : row.kind === "claim" && !row.eligibility.eligible ? CLAIM_ELIGIBILITY_COPY[row.eligibility.reason] : ""}</span>
            </li>)}
          </ul>
        </section>}

        {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t px-5 py-3 text-sm">
        <span className="text-slate-700"><span className="font-semibold tabular-nums text-slate-900">{describeBatchCounts(billRows.length, claimRows.length)}</span></span>
        <span className="text-slate-700">Total <span className="font-semibold tabular-nums text-slate-900">{groups.length <= 1 ? money(total, eligible[0] ? rowCurrency(eligible[0]) : null) : groups.map((g) => money(g.lines.reduce((s, l) => s + Math.round((rowAmount(l.row) ?? 0) * 100), 0) / 100, g.currencyCode)).join(" + ")}</span></span>
        <span className="text-slate-700">Pay From <span className="font-medium text-slate-900">{groups.length <= 1 ? payerAccountLabel(eligible[0] ? rowPayFrom(eligible[0], defaultPayerAccount) : null) : `${groups.length} accounts`}</span></span>
        <span className="ml-auto flex gap-2">
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={close}>Cancel</Button>
          <Button type="submit" size="sm" disabled={busy || eligible.length === 0}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
            {busy ? "Creating…" : groups.length > 1 ? `Create ${groups.length} batches` : `Create batch (${eligible.length})`}
          </Button>
        </span>
      </div>
    </form>
  </Dialog>
}
