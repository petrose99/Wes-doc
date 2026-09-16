"use client"

import { useEffect, useId, useRef, useState } from "react"
import { Pencil } from "lucide-react"
import { toast } from "sonner"
import { formatPaymentMoney } from "@/components/payments/format"
import { validateAmountToPay } from "@/lib/payments/eligibility"

/** #229 Q10/Q13 (#251): the *Amount to pay* cell. The discounted figure in emerald-700 over the
 * due in slate-500 line-through with an sr-only "was" — never colour alone (#188's inline-
 * adjustment anatomy). Editable inline on desktop within 0 < amount ≤ due (a partial payment is
 * a real ledger condition); the phone reads it. Saving is Server-confirmed: the cell shows the
 * old value until the action returns, and a refusal stays in the cell, not a toast. */
export function AmountToPayCell({ amountToPay, due, discountedTotal, override, currencyCode, fallbackCurrency, editable, scheduled, onSave }: {
  amountToPay: number | null
  due: number | null
  /** The discounted total when a discount window is open, else null. */
  discountedTotal: number | null
  /** The operator's own amount (a partial), when one is set. */
  override: number | null
  currencyCode: string | null
  fallbackCurrency: string
  editable: boolean
  scheduled: boolean
  onSave: (amount: number | null) => Promise<{ success: boolean; error?: string }>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const id = useId()
  useEffect(() => { if (editing) inputRef.current?.select() }, [editing])

  const money = (value: number) => formatPaymentMoney(value, currencyCode, fallbackCurrency)
  if (amountToPay === null || due === null) return <span className="text-slate-500">—</span>

  const struck = override !== null ? due : discountedTotal !== null ? due : null
  const shown = amountToPay

  const commit = async () => {
    const value = parseFloat(draft.replace(/[^0-9.\-]/g, ""))
    const problem = validateAmountToPay(value, due)
    if (problem) { setError(problem); return }
    setSaving(true)
    const cents = Math.round(value * 100)
    // Back to the computed amount when the operator types the discounted total or the due itself.
    const next = cents === Math.round((discountedTotal ?? due) * 100) ? null : cents / 100
    let result: { success: boolean; error?: string }
    try { result = await onSave(next) } catch { result = { success: false, error: "Couldn't reach the server. Nothing changed — try again." } }
    setSaving(false)
    if (!result.success) { setError(result.error ?? "Couldn't save the amount."); return }
    setEditing(false); setError(null)
    toast.success(next === null ? "Amount to pay reset" : `Amount to pay set to ${money(next)}`)
  }

  if (editing) {
    return <span className="flex flex-col items-end gap-1">
      <span className="flex items-center gap-1">
        <label className="sr-only" htmlFor={`${id}-input`}>Amount to pay</label>
        <input id={`${id}-input`} ref={inputRef} type="text" inputMode="decimal" value={draft} disabled={saving}
          aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined}
          onChange={(event) => { setDraft(event.target.value); setError(null) }}
          onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void commit() } else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setEditing(false); setError(null) } }}
          onBlur={() => { if (!saving && !error) void commit() }}
          className="h-9 w-28 rounded-md border border-slate-300 bg-white px-2 text-right text-sm tabular-nums text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600" />
      </span>
      {error && <span id={`${id}-error`} role="alert" className="max-w-[12rem] text-right text-xs text-red-700">{error}</span>}
    </span>
  }

  return <span className="inline-flex items-center justify-end gap-1.5">
    <span className="inline-flex flex-col items-end leading-tight">
      <span className={`tabular-nums ${struck !== null ? "font-semibold text-emerald-700" : "text-slate-900"}`}>{money(shown)}</span>
      {struck !== null && <span className="text-xs tabular-nums text-slate-500 line-through"><span className="sr-only">was </span>{money(struck)}</span>}
    </span>
    {editable && !scheduled && <button type="button" onClick={() => { setDraft(shown.toFixed(2)); setEditing(true) }} aria-label={`Edit amount to pay, currently ${money(shown)}`}
      className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 md:inline-flex">
      <Pencil className="h-3.5 w-3.5" aria-hidden />
    </button>}
  </span>
}
