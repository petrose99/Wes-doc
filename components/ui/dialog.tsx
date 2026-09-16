"use client"

import { X } from "lucide-react"
import { useEffect, useId, useRef } from "react"
import { createPortal } from "react-dom"

/** The non-destructive counterpart to ConfirmDialog: a portalled modal that takes arbitrary
 * children, for the Create-folder and Share flows. Portalled to the body for the same reason —
 * so it is never clipped or stacked by the panel and grid containers it opens from.
 *
 * Handles the four things the previous hand-rolled version left off: focus trap (Tab/Shift+Tab
 * cycles inside the dialog), initial focus (first focusable inside the content), focus return
 * (whichever element opened the dialog), and body scroll lock while open. Escape, aria-modal and
 * click-outside-to-close remain as before. */
const FOCUSABLE = "a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex=\"-1\"])"

export function Dialog({ open, title, description, width = "max-w-md", onClose, children, placement = "center" }: {
  open: boolean
  title: string
  description?: string
  width?: string
  onClose: () => void
  children: React.ReactNode
  /** #257: `"sheet"` bottom-anchors below `md` (Filter, Reject, Approve, Override) — everything
   * but placement (trap, Esc, return focus, scroll lock) is this same Dialog; a second component
   * would be two systems for one job (B4). At `md`+ a sheet renders centered, same as `"center"`. */
  placement?: "center" | "sheet"
}) {
  const contentRef = useRef<HTMLDivElement>(null)
  const openerRef = useRef<Element | null>(null)
  // Per-instance ids so aria-labelledby/aria-describedby don't collide when two Dialogs mount
  // concurrently (e.g. Share opened over Create-folder). Static ids would silently break axe.
  const titleId = useId()
  const descId = useId()

  useEffect(() => {
    if (!open) return
    openerRef.current = typeof document !== "undefined" ? document.activeElement : null

    // Focus the first focusable inside the content on open — falls back to the content wrapper
    // itself so the dialog is always the tab-cycle anchor, never the page behind it.
    const focusFirst = () => {
      const container = contentRef.current
      if (!container) return
      const first = container.querySelector<HTMLElement>(FOCUSABLE)
      ;(first ?? container).focus()
    }
    const raf = window.requestAnimationFrame(focusFirst)

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { onClose(); return }
      if (event.key !== "Tab") return
      const container = contentRef.current
      if (!container) return
      const focusables = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.hasAttribute("disabled"))
      if (focusables.length === 0) { event.preventDefault(); container.focus(); return }
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement as HTMLElement | null
      if (event.shiftKey && (active === first || !container.contains(active))) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener("keydown", onKey)

    // Body scroll lock — a modal that lets the page scroll behind it disorients screen readers
    // and mouse-wheel users alike. Restored on close to whatever the app set.
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    return () => {
      window.cancelAnimationFrame(raf)
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = previousOverflow
      // Return focus to the element that opened the dialog (if it is still around).
      if (openerRef.current instanceof HTMLElement) openerRef.current.focus()
    }
  }, [open, onClose])

  if (!open || typeof document === "undefined") return null

  const sheet = placement === "sheet"

  return createPortal(
    <div role="presentation" data-inner
      className={sheet
        ? "fixed inset-0 z-[100] flex items-end justify-center overflow-y-auto bg-slate-900/50 md:items-start md:p-6 md:pt-[10vh]"
        : "fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-6 pt-[10vh]"}
      onClick={onClose}>
      {/* labelledby/describedby wired to the rendered heading and description, so a screen
          reader announces both — the description often carries the actual instruction ("How
          would you like to view them?"), and aria-label={title} alone drops it from the a11y
          tree. Same fix ConfirmDialog got.
          `data-inner` on the outer wrapper lets QueueScreen's document keydown handler tell "a
          Dialog is open" apart from the full-screen Detail pane sheet, which carries no such
          attribute — Escape must close only the innermost Dialog, never drop a typed reason. */}
      <div ref={contentRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descId : undefined}
        className={sheet
          ? `w-full ${width} overflow-hidden rounded-t-xl bg-white shadow-2xl focus:outline-none pb-[env(safe-area-inset-bottom)] md:rounded-xl md:pb-0`
          : `w-full ${width} overflow-hidden rounded-xl bg-white shadow-2xl focus:outline-none`}
        onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
          <div>
            <h2 id={titleId} className="text-base font-semibold text-slate-900">{title}</h2>
            {description && <p id={descId} className="mt-1 text-sm text-slate-500">{description}</p>}
          </div>
          <button type="button" className="-mr-1 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close" onClick={onClose}><X className="h-4 w-4" /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}
