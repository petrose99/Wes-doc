"use client"

import { Dialog } from "@/components/ui/dialog"
import { useState, useTransition } from "react"

/** #97: shared "action that needs a written reason" control — Reopen (on the close header)
 * and Override (on each item card) both funnel through here. The reason is required; the
 * bound server action receives it as FormData. */
export function ReasonDialogButton({ action, triggerLabel, title, description, submitLabel, placeholder, tone = "neutral", disabled = false }: {
  action: (formData: FormData) => Promise<void>
  triggerLabel: string
  title: string
  description: string
  submitLabel: string
  placeholder: string
  tone?: "neutral" | "amber"
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [pending, startTransition] = useTransition()

  const triggerCls = tone === "amber"
    ? "rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-100 disabled:opacity-40"
    : "rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-40"

  return (
    <>
      <button type="button" className={triggerCls} disabled={disabled} onClick={() => setOpen(true)}>
        {triggerLabel}
      </button>
      <Dialog open={open} title={title} description={description} onClose={() => { if (!pending) setOpen(false) }}>
        <form
          className="space-y-3 px-5 py-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (!reason.trim() || pending) return
            const formData = new FormData()
            formData.set("reason", reason.trim())
            startTransition(async () => {
              await action(formData)
              setOpen(false)
              setReason("")
            })
          }}>
          <textarea
            name="reason"
            rows={3}
            required
            value={reason}
            placeholder={placeholder}
            className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm transition-colors focus:border-emerald-400 focus:bg-white focus:outline-none"
            onChange={(event) => setReason(event.target.value)} />
          <div className="flex justify-end gap-2">
            <button type="button" className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100" disabled={pending} onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-800 disabled:opacity-40" disabled={pending || !reason.trim()}>
              {pending ? "Working…" : submitLabel}
            </button>
          </div>
        </form>
      </Dialog>
    </>
  )
}
