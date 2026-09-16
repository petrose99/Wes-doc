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

  const triggerCls = tone === "amber"
    ? "rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-100 disabled:opacity-40"
    : "rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-40"

  return (
    <div>
      <button type="button" className={triggerCls} disabled={disabled} title={disabled ? disabledHint : undefined} onClick={() => setOpen(true)}>
        {triggerLabel}
      </button>
      {disabled && disabledHint && <p className="mt-1 max-w-[16rem] text-xs text-slate-500">{disabledHint}</p>}
      <ReasonDialog open={open} onClose={() => setOpen(false)} action={action} title={title} description={description} submitLabel={submitLabel} placeholder={placeholder} />
    </div>
  )
}

/** #225: the dialog on its own, for callers whose trigger lives somewhere the dialog cannot —
 * a Detail pane's overflow menu closes (and unmounts its items) the moment a dialog opens over
 * it, so the menu item only flips `open` and the dialog mounts beside the pane instead. */
export function ReasonDialog({ open, onClose, action, title, description, submitLabel, placeholder, placement = "center", disabledReason = null, pendingLabel = "Working…" }: {
  open: boolean
  onClose: () => void
  action: (formData: FormData) => Promise<{ success: boolean; error?: string }>
  title: string
  description: string
  submitLabel: string
  placeholder: string
  /** #257: `"sheet"` for the phone lane's Reject/Override sheets — same Dialog, bottom-anchored. */
  placement?: "center" | "sheet"
  /** #257 spec 3.6 (offline inside an open sheet): when set, submit is disabled and this sentence
   * renders under it — the typed reason stays; clearing it re-enables submit in place. */
  disabledReason?: string | null
  /** What the submit button reads while the action runs ("Rejecting…", "Approving…"). */
  pendingLabel?: string
}) {
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // A cancelled reason never carries over to the next thing this dialog is opened for (#251).
  const close = () => { onClose(); setError(null); setReason("") }

  return (
    <Dialog open={open} placement={placement} initialFocus="textarea" title={title} description={description} onClose={() => { if (!pending) close() }}>
      {/* #251: the field is named (placeholder alone is not a name) and the refusal is announced. */}
      <form
        className="space-y-3 px-5 py-4"
        onSubmit={(event) => {
          event.preventDefault()
          if (!reason.trim() || pending || disabledReason) return
          const formData = new FormData()
          formData.set("reason", reason.trim())
          startTransition(async () => {
            const result = await action(formData)
            if (!result.success) { setError(result.error ?? "Couldn't record that."); return }
            onClose()
            setReason("")
            setError(null)
          })
        }}>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-800">Reason</span>
          <textarea
            name="reason"
            rows={3}
            required
            value={reason}
            placeholder={placeholder}
            className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-base text-slate-900 transition-colors placeholder:text-slate-500 focus:border-emerald-400 focus:bg-white focus:outline-none sm:text-sm"
            onChange={(event) => setReason(event.target.value)} />
        </label>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {disabledReason && <p role="status" className="text-[13px] text-slate-600">{disabledReason}</p>}
        <div className="flex justify-end gap-2 max-md:grid max-md:grid-cols-2 max-md:[&>button]:h-12">
          <button type="button" className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 max-md:border max-md:border-slate-300" disabled={pending} onClick={close}>
            Cancel
          </button>
          <button type="submit" className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-800 disabled:opacity-40" disabled={pending || !reason.trim() || !!disabledReason}>
            {pending ? pendingLabel : submitLabel}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
