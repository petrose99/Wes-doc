"use client"

import { Dialog } from "@/components/ui/dialog"
import { useState, useTransition } from "react"

/** A shared "action that needs a written reason" control, modeled after the close checklist's
 * `ReasonDialogButton` (app/(app)/workspaces/[workspaceId]/(chrome)/close/reason-dialog.tsx) —
 * that one is page-local to the Close feature, so #203's gate-override flow gets its own copy
 * here under list-screen rather than reaching across feature folders. The one behavioral
 * difference: the bound `action` here returns a result instead of throwing, since server actions
 * in this app return `ActionState`-shaped `{ success, error }` far more often than they throw —
 * a refusal (a hard gate, a reason the server still rejects) surfaces inline in the dialog instead
 * of an unhandled rejection reaching the console. */
export function ReasonDialogButton({
  action, triggerLabel, title, description, submitLabel, placeholder,
  tone = "neutral", disabled = false, disabledHint,
}: {
  action: (formData: FormData) => Promise<{ success: boolean; error?: string }>
  triggerLabel: string
  title: string
  description: string
  submitLabel: string
  placeholder: string
  tone?: "neutral" | "amber"
  disabled?: boolean
  /** #203: "a disabled Override control on a hard gate must say why in its own copy" — a title
   * tooltip alone doesn't satisfy that (hover-only, invisible on touch), so this also renders as
   * plain text under the trigger whenever `disabled` is true. */
  disabledHint?: string
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const triggerCls = tone === "amber"
    ? "rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-100 disabled:opacity-40"
    : "rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-40"

  const close = () => { setOpen(false); setError(null) }

  return (
    <div>
      <button type="button" className={triggerCls} disabled={disabled} title={disabled ? disabledHint : undefined} onClick={() => setOpen(true)}>
        {triggerLabel}
      </button>
      {disabled && disabledHint && <p className="mt-1 max-w-[16rem] text-xs text-slate-400">{disabledHint}</p>}
      <Dialog open={open} title={title} description={description} onClose={() => { if (!pending) close() }}>
        <form
          className="space-y-3 px-5 py-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (!reason.trim() || pending) return
            const formData = new FormData()
            formData.set("reason", reason.trim())
            startTransition(async () => {
              const result = await action(formData)
              if (!result.success) { setError(result.error ?? "Couldn't record the override."); return }
              setOpen(false)
              setReason("")
              setError(null)
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
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100" disabled={pending} onClick={close}>
              Cancel
            </button>
            <button type="submit" className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-800 disabled:opacity-40" disabled={pending || !reason.trim()}>
              {pending ? "Working…" : submitLabel}
            </button>
          </div>
        </form>
      </Dialog>
    </div>
  )
}
