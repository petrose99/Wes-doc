"use client"

import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import {
  leaveAffectedBillsAction,
  updateSelectedBillAccountsAction,
  type AffectedBillWithCheck,
  type UpdateSelectedBillsResult,
} from "@/app/(app)/workspaces/[workspaceId]/account-correction-actions"
import { useMemo, useState, useTransition } from "react"

/** #430 Screen 1 — "N bills already posted" dialog. Fired by the caller once
 * `listAffectedBillsAction` already found ≥1 affected bill (the caller owns the
 * "no dialog if 0" and "no client-side loading spinner on open" rules — this component only
 * ever renders already-populated, per the spec's Trigger/Layout sections). Reused as-is by
 * Screen 3's per-rule "Review" entry point; Screen 2's single-row path is its own smaller UI
 * (a one-document list would make this table's header checkbox and bulk copy meaningless). */

function refusalText(refusal: { code: "book_closed" | "period_locked" | "paid" | "voided" | "not_found"; provider: string }, providerLabel: string): string {
  switch (refusal.code) {
    case "book_closed": return "Books closed for this period — update in " + providerLabel
    case "period_locked": return `Locked period in ${providerLabel}`
    case "paid": return `Paid in ${providerLabel} — account can't be changed through DocuBite`
    case "voided": return `Voided in ${providerLabel} — nothing to update`
    case "not_found": return `No longer found in ${providerLabel}`
  }
}

/** Best-effort deep link to the provider's own bill-edit screen, for the "Open in ledger" escape
 * on a refused row. Both providers resolve the tenant from the signed-in session, so no realm/
 * tenant id is needed in the URL itself. */
function ledgerBillUrl(provider: string, externalBillId: string | null): string | null {
  if (!externalBillId) return null
  if (provider === "quickbooks") return `https://app.qbo.intuit.com/app/bill?txnId=${encodeURIComponent(externalBillId)}`
  if (provider === "xero") return `https://go.xero.com/AccountsPayable/View.aspx?invoiceID=${encodeURIComponent(externalBillId)}`
  return null
}

function formatAmount(total: number, currencyCode: string | null): string {
  try { return new Intl.NumberFormat("en", { style: "currency", currency: currencyCode ?? "USD", maximumFractionDigits: 2 }).format(total) }
  catch { return total.toFixed(2) }
}

export function AccountCorrectionDialog({
  open, onClose, workspaceId, connectionId, provider, providerLabel,
  oldAccountExternalId, oldAccountName, newAccountExternalId, newAccountName,
  bills, onResolved,
}: {
  open: boolean
  onClose: () => void
  workspaceId: string
  connectionId: string
  provider: string
  providerLabel: string
  oldAccountExternalId: string
  oldAccountName: string
  newAccountExternalId: string
  newAccountName: string
  bills: AffectedBillWithCheck[]
  /** Called once every selected row has resolved (or "Leave them"/"Not now" closed the dialog),
   * so the caller can revalidate its own affected-count (Screen 3's reminder line). */
  onResolved?: () => void
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [results, setResults] = useState<Map<string, UpdateSelectedBillsResult> | null>(null)
  const [pending, startTransition] = useTransition()

  const selectable = useMemo(() => bills.filter((b) => !b.refusal), [bills])
  const refused = useMemo(() => bills.filter((b) => b.refusal), [bills])
  const ordered = [...selectable, ...refused]

  const allSelectableChecked = selectable.length > 0 && selectable.every((b) => selected.has(b.id))

  const toggleAll = () => {
    setSelected(allSelectableChecked ? new Set() : new Set(selectable.map((b) => b.id)))
  }
  const toggleRow = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const close = () => {
    setSelected(new Set())
    setResults(null)
    onClose()
    onResolved?.()
  }

  const submit = () => {
    const documentIds = Array.from(selected)
    if (!documentIds.length) return
    startTransition(async () => {
      const res = await updateSelectedBillAccountsAction(workspaceId, connectionId, oldAccountExternalId, newAccountExternalId, documentIds)
      const next = new Map<string, UpdateSelectedBillsResult>()
      if (res.success && res.data) for (const row of res.data) next.set(row.documentId, row)
      else for (const id of documentIds) next.set(id, { documentId: id, status: "failed", error: res.error || "Could not update this bill" })
      setResults(next)
    })
  }

  const leaveThem = (documentIds: string[]) => {
    startTransition(async () => {
      await leaveAffectedBillsAction(workspaceId, oldAccountExternalId, documentIds)
      close()
    })
  }

  const phase: "select" | "result" = results ? "result" : "select"
  const updatedCount = results ? Array.from(results.values()).filter((r) => r.status === "updated").length : 0
  const allResolved = results ? Array.from(selected).every((id) => results.get(id)) : false

  return (
    <Dialog open={open} onClose={close} width="max-w-2xl"
      title={`${bills.length} bill${bills.length === 1 ? "" : "s"} already posted to ${oldAccountName}`}>
      <div className="px-5 py-4">
        {phase === "select" && (
          <p className="text-sm text-slate-600">
            Update the Account on these to {newAccountName}? Amounts and VAT stay as posted.
          </p>
        )}
        <div className="mt-3 max-h-[50vh] overflow-y-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-8 border-b px-3 py-2">
                  <input type="checkbox" aria-label="Select all updatable bills" className="h-4 w-4 accent-emerald-600"
                    checked={allSelectableChecked} disabled={!selectable.length || phase === "result"} onChange={toggleAll} />
                </th>
                <th className="border-b px-3 py-2 text-left">Supplier</th>
                <th className="border-b px-3 py-2 text-left">Date</th>
                <th className="border-b px-3 py-2 text-left">Amount</th>
                <th className="border-b px-3 py-2 text-left">{phase === "select" ? "Change" : "Result"}</th>
              </tr>
            </thead>
            <tbody>
              {ordered.map((bill) => {
                const result = results?.get(bill.id)
                const reason = bill.refusal ? refusalText(bill.refusal, providerLabel) : null
                const link = bill.refusal ? ledgerBillUrl(provider, bill.externalBillId) : null
                return (
                  <tr key={bill.id} className={bill.refusal ? "text-slate-400" : "text-slate-800"}>
                    <td className="border-b px-3 py-2 align-top">
                      <input type="checkbox" aria-label={`Select ${bill.vendorName}`} className="h-4 w-4 accent-emerald-600"
                        checked={selected.has(bill.id)} disabled={!!bill.refusal || phase === "result"}
                        aria-describedby={reason ? `refusal-${bill.id}` : undefined}
                        onChange={() => toggleRow(bill.id)} />
                    </td>
                    <td className="border-b px-3 py-2 align-top">
                      {bill.ledgerFact === "paid" && <span className="mr-1.5 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">Paid</span>}
                      {bill.vendorName}
                    </td>
                    <td className="border-b px-3 py-2 align-top">{bill.receivedAt.toLocaleDateString()}</td>
                    <td className="border-b px-3 py-2 align-top tabular-nums">{formatAmount(bill.total, bill.currencyCode)}</td>
                    <td className="border-b px-3 py-2 align-top">
                      {phase === "result" && result ? (
                        result.status === "updated"
                          ? <span className="font-medium text-emerald-700">✓ Updated</span>
                          : <span className="font-medium text-red-700">✕ {result.error}</span>
                      ) : reason ? (
                        <span id={`refusal-${bill.id}`}>
                          {reason}
                          {link && <> · <a href={link} target="_blank" rel="noreferrer" className="font-medium text-emerald-700 underline underline-offset-2">Open in ledger</a></>}
                        </span>
                      ) : (
                        `${bill.lines.length} line${bill.lines.length === 1 ? "" : "s"} → ${newAccountName}`
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {phase === "result" && (
          <p className="mt-3 text-sm font-medium text-slate-700">{updatedCount} of {selected.size} updated.</p>
        )}
      </div>
      <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
        {phase === "select" && (
          <>
            <button type="button" className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100" disabled={pending} onClick={() => leaveThem(selectable.map((b) => b.id))}>
              Leave them
            </button>
            <Button type="button" variant="ghost" disabled={pending} onClick={close}>Not now</Button>
            <Button type="button" disabled={pending || selected.size === 0} onClick={submit}>
              Update {selected.size} bill{selected.size === 1 ? "" : "s"} in {providerLabel}
            </Button>
          </>
        )}
        {phase === "result" && (
          <Button type="button" disabled={!allResolved} onClick={close}>Done</Button>
        )}
      </div>
    </Dialog>
  )
}
