"use client"

import { CheckCircle2, X } from "lucide-react"
import Link from "next/link"
import { Dialog } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

/** #204 (map #177): the pre-action "Eligible for Approval (N of M)" strip and the post-action
 * itemized receipt modal, per #185's resolution. Shared by Invoices and Receipts — the only two
 * typed surfaces with a working bulk action bar so far (Purchase Orders and Bank Statements have
 * no selection state yet; #210/other tickets add those destinations). Only Approve and Prepare
 * payment run get this full treatment — Reprocess/Export/Delete stay toast-only, unchanged here. */

/** Green-dot eligibility strip. Rendered as `ConfirmDialog`'s `children` slot, between the
 * description and the confirm/cancel row — the same position Vic.ai's own "Approve Invoices"
 * modal puts it, just before the recap. Eligibility is derived from `blockedByCheck`, the only
 * pre-action signal callers have without a new round trip to the server's own field-validation
 * (the actual `markDocumentsReviewed` hold-back reason, "missing required fields or document
 * type", isn't otherwise exposed on the row) — good enough to warn, not a guarantee the server
 * won't hold back an additional row it discovers is still incomplete. */
export function EligibilityStrip({ eligible, total, label = "Eligible for Approval" }: { eligible: number; total: number; label?: string }) {
  const allEligible = eligible === total
  return (
    <div className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${allEligible ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
      <span className={`h-2 w-2 shrink-0 rounded-full ${allEligible ? "bg-emerald-500" : "bg-amber-500"}`} aria-hidden />
      <span className="font-medium">{label} ({eligible} of {total})</span>
    </div>
  )
}

export type ItemizedRecord = {
  id: string
  type: "Invoice" | "Purchase Order" | "Receipt" | "Bank Statement"
  vendor: string | null
  number: string | null
  amount: number | null
  currencyCode: string | null
  dateLabel: string
  date: Date | null
  /** #273: a trailing per-row note (the Held-back reason in the Add to claim dialog). The column
   * renders only when at least one record carries one. */
  note?: string
}

/** The compact recap table shown inside a pre-action confirm (Prepare payment run — no separate
 * post-action modal makes sense there, since confirming redirects straight to a file download)
 * and reused as the row layout for the post-action receipt modal below (Approve, which stays on
 * the page and so gets a real "here's what happened" step). Vic's own column order: Type / Vendor
 * / Number / Amount, per `docs/vic-ai-ux-tour-findings.md`. */
export function ItemizedRecapTable({ records }: { records: ItemizedRecord[] }) {
  // One typed table's rows always share a dateLabel ("Due" for invoices, "Date" for receipts) —
  // Purchase Order/Bank Statement rows carry their own per-decision fields once those surfaces
  // get bulk actions (#210 and friends), which is why this reads the label off the first row
  // rather than hardcoding it.
  const dateLabel = records[0]?.dateLabel ?? "Date"
  const withNotes = records.some((record) => record.note)
  return (
    <div className="max-h-64 overflow-y-auto rounded-md border">
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2 font-medium">Type</th>
            <th className="px-3 py-2 font-medium">Vendor</th>
            <th className="px-3 py-2 font-medium">Number</th>
            <th className="px-3 py-2 font-medium text-right">Amount</th>
            <th className="px-3 py-2 font-medium">{dateLabel}</th>
            {withNotes && <th className="px-3 py-2 font-medium">Reason</th>}
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.id} className="border-t border-slate-100">
              <td className="px-3 py-2 text-slate-600">{record.type}</td>
              <td className="px-3 py-2 text-slate-800">{record.vendor ?? <span className="italic text-slate-400">unknown</span>}</td>
              <td className="px-3 py-2 text-slate-600">{record.number ?? "—"}</td>
              <td className="px-3 py-2 text-right tabular-nums text-slate-800">{record.amount !== null ? formatMoney(record.amount, record.currencyCode) : "—"}</td>
              <td className="px-3 py-2 tabular-nums text-slate-600">{record.date ? record.date.toISOString().slice(0, 10) : "—"}</td>
              {withNotes && <td className="px-3 py-2 text-slate-600">{record.note ?? ""}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Post-action itemized receipt for a bulk Approve — the one bulk action here that doesn't leave
 * the page, so it's the one that gets a real "here's what happened" modal rather than folding the
 * recap into the pre-action confirm. Splits into Approved and "Needs attention" (held back)
 * groups per #185's partial-failure rule; each held-back row also carries the row-level badge
 * (`row-signals`'s cluster in `invoice-table.tsx`/`receipt-table.tsx`) for as long as this
 * session's selection state remembers it — see that badge's own note on the persistence gap. */
export function BulkApproveReceiptModal({ open, onClose, approved, heldBack, next }: {
  open: boolean
  onClose: () => void
  approved: ItemizedRecord[]
  heldBack: ItemizedRecord[]
  /** #229 Q9 (#251): the approved rows' next home, as one link on the receipt. */
  next?: { label: string; href: string }
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Approve receipt" width="max-w-lg"
      description={heldBack.length === 0
        ? `${approved.length} approved.`
        : `${approved.length} approved, ${heldBack.length} held back.`}>
      <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-4">
        {approved.length > 0 && (
          <section>
            <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" />Approved ({approved.length})
            </h3>
            <ItemizedRecapTable records={approved} />
          </section>
        )}
        {heldBack.length > 0 && (
          <section>
            <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700">
              <X className="h-3.5 w-3.5" />Needs attention ({heldBack.length})
            </h3>
            <p className="mb-1.5 text-xs text-slate-500">Missing required fields or a document type. See the record&apos;s row badge or the Activity page for the full trail.</p>
            <ItemizedRecapTable records={heldBack} />
          </section>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t bg-slate-50 px-5 py-3">
        {next && approved.length > 0 && <Button asChild size="sm" variant="outline"><Link className="py-1.5" href={next.href}>{next.label}</Link></Button>}
        <Button type="button" size="sm" onClick={onClose}>Done</Button>
      </div>
    </Dialog>
  )
}

export function formatMoney(amount: number, currency?: string | null): string {
  const currencyCode = currency && /^[A-Z]{3}$/.test(currency) ? currency : "USD"
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency: currencyCode, maximumFractionDigits: 0 }).format(amount)
  } catch {
    return `${amount.toFixed(0)} ${currency ?? ""}`.trim()
  }
}
