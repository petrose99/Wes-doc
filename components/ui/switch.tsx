"use client"

/** A track-and-thumb toggle, `role="switch"` (B4, #262: same control the queue's Override menu
 * item and the module catalog approximate with their own one-off markup — this is the version
 * both should eventually import; the Keyboard shortcuts dialog is its first user). */
export function Switch({ checked, onCheckedChange, label, describedBy, disabled = false, id }: {
  checked: boolean
  onCheckedChange: (next: boolean) => void
  label: string
  describedBy?: string
  disabled?: boolean
  id?: string
}) {
  return <button type="button" id={id} role="switch" aria-checked={checked} aria-label={label} aria-describedby={describedBy}
    disabled={disabled} onClick={() => onCheckedChange(!checked)}
    className={`relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:opacity-50 ${checked ? "bg-emerald-700" : "bg-slate-300"}`}>
    <span aria-hidden className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? "translate-x-[22px]" : "translate-x-1"}`} />
  </button>
}
