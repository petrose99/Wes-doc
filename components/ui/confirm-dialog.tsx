"use client"

import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"
import { useEffect, useId, useRef } from "react"
import { createPortal } from "react-dom"

/** Confirmation for destructive actions. Portalled to the body so it is never clipped or
 * stacked by the panel/grid containers it is opened from. Same focus discipline as Dialog:
 * focus trapped while open (Tab cycles Cancel ⇄ Confirm), returned to the opener on close,
 * body scroll locked. Initial focus stays on the Confirm button via its autoFocus.
 * FOCUSABLE matches Dialog's full selector, not just buttons — a confirm that carries an
 * optional input (the stage-reject note) must keep that field in the tab cycle. */
const FOCUSABLE = "a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex=\"-1\"])"

export function ConfirmDialog({ open, title, description, confirmLabel = "Confirm", destructive = false, busy = false, onConfirm, onCancel, children }: {
  open: boolean
  title: string
  description?: string
  confirmLabel?: string
  destructive?: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
  /** Optional extra content between the description and the button row — e.g. an optional
   * note field. Keep it to one small control; a confirm dialog that grows a form should be a
   * Dialog instead. */
  children?: React.ReactNode
}) {
  const contentRef = useRef<HTMLDivElement>(null)
  const openerRef = useRef<Element | null>(null)
  // Per-instance ids so two ConfirmDialogs mounted concurrently (bulk approve + stage-reject,
  // for example, if both open in quick succession) don't collide on the same aria targets.
  const titleId = useId()
  const descId = useId()

  useEffect(() => {
    if (!open) return
    openerRef.current = typeof document !== "undefined" ? document.activeElement : null
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) { onCancel(); return }
      if (event.key !== "Tab") return
      const container = contentRef.current
      if (!container) return
      const focusables = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement as HTMLElement | null
      if (event.shiftKey && (active === first || !container.contains(active))) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener("keydown", onKey)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = previousOverflow
      if (openerRef.current instanceof HTMLElement) openerRef.current.focus()
    }
  }, [open, busy, onCancel])

  // The dialog only ever opens after hydration, so there is nothing to mismatch on the server.
  if (!open || typeof document === "undefined") return null

  return createPortal(
    <div role="presentation" className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-6" onClick={() => { if (!busy) onCancel() }}>
      {/* labelledby/describedby against the visible heading and description, so a screen reader
          announces the consequence line ("This cannot be undone", "can auto-publish and sync…"),
          not just the title — the consequence is the reason this dialog exists. */}
      <div ref={contentRef} role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descId : undefined} className="w-full max-w-sm overflow-hidden rounded-xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="px-5 pb-4 pt-5">
          <h2 id={titleId} className="text-base font-semibold text-slate-900">{title}</h2>
          {description && <p id={descId} className="mt-1.5 text-sm text-slate-500">{description}</p>}
          {children && <div className="mt-3">{children}</div>}
        </div>
        <div className="flex justify-end gap-2 border-t bg-slate-50 px-5 py-3">
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onCancel}>Cancel</Button>
          <Button type="button" variant={destructive ? "destructive" : "default"} size="sm" autoFocus disabled={busy} onClick={onConfirm}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}{confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
