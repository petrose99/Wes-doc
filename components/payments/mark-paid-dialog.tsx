"use client"

import { useState, type ReactNode } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { toDateInputValue } from "@/components/payments/format"

/** #229 Q6 (#251): Mark as paid — writes a Payment record (ADR 0001), never touches the ledger.
 * One dialog for the Bill Pay bulk bar (a manual record per row) and the batch footer (one per
 * line, method `batch`). Date defaults to today, a reference is optional, the recap says what
 * is about to be recorded, and a refusal renders inline. Server-confirmed; no Undo — removal is
 * "Remove payment record" with a reason. */
export function MarkPaidDialog({ open, onClose, title, description, recap, submitLabel, onSubmit }: {
  open: boolean
  onClose: () => void
  title: string
  description: string
  recap: ReactNode
  submitLabel: string
  onSubmit: (input: { paidOn: string; reference: string | null }) => Promise<{ success: boolean; error?: string }>
}) {
  const [paidOn, setPaidOn] = useState(toDateInputValue(new Date()))
  const [reference, setReference] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Closing resets the fields, so the next open starts from today with no stale reference.
  const reset = () => { setPaidOn(toDateInputValue(new Date())); setReference(""); setError(null) }
  const close = () => { if (busy) return; onClose(); reset() }
  const submit = async () => {
    setBusy(true); setError(null)
    try {
      const result = await onSubmit({ paidOn, reference: reference.trim() || null })
      if (!result.success) { setError(result.error ?? "Couldn't record the payment."); return }
      onClose(); reset()
    } catch { setError("Couldn't reach the server. Nothing was recorded — try again.") } finally { setBusy(false) }
  }
  return <Dialog open={open} onClose={close} title={title} description={description} width="max-w-lg">
    <form className="space-y-4 px-5 py-4" onSubmit={(event) => { event.preventDefault(); void submit() }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-800">Paid on</span>
          <input type="date" value={paidOn} max={toDateInputValue(new Date())} required onChange={(event) => setPaidOn(event.target.value)}
            className="h-9 w-full rounded-md border border-slate-300 px-2 text-sm tabular-nums text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-800">Reference <span className="font-normal text-slate-500">(optional)</span></span>
          <input value={reference} maxLength={80} placeholder="Bank reference or note" onChange={(event) => setReference(event.target.value)}
            className="h-9 w-full rounded-md border border-slate-300 px-2 text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-600" />
        </label>
      </div>
      {recap}
      {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={close}>Cancel</Button>
        <Button type="submit" size="sm" disabled={busy}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}{busy ? "Recording…" : submitLabel}</Button>
      </div>
    </form>
  </Dialog>
}
