"use client"

import { useCallback, useRef, useState, type ReactNode } from "react"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DETAIL_PANE_ID } from "@/components/queue/detail-pane"

/** After the dialog closes the shell returns focus to its opener; a ⋯ menu item has already
 * unmounted by then, so focus would land on body — the pane heading is the documented fallback. */
function settleFocus() {
  window.requestAnimationFrame(() => {
    if (document.activeElement && document.activeElement !== document.body) return
    document.getElementById(`${DETAIL_PANE_ID}-title`)?.focus({ preventScroll: true })
  })
}

/** #286 spec §4.3/§4.4/§8: one promise-shaped confirm for the Users pane's ⚠ actions. `ask()`
 * resolves true on confirm, false on cancel; `escalate()` re-renders the *same* dialog with the
 * second-phase sentence inside an `aria-live="assertive"` region (the last-reviewer two-phase —
 * a title change alone is not announced) and a new confirm label, keeping focus on the confirm
 * button; `refuse()` turns it into a Cancel-only dialog with the reason (the last-owner race).
 * Every caller renders `dialog` once beside its content — the shared `ConfirmDialog`, never
 * `window.confirm` (B1). */
export type ConfirmSpec = {
  title: string
  description: string
  confirmLabel: string
  destructive?: boolean
  busyLabel?: string
}

export function useAsyncConfirm() {
  const [spec, setSpec] = useState<ConfirmSpec | null>(null)
  const [phase2, setPhase2] = useState<string | null>(null)
  const [refusal, setRefusal] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const resolver = useRef<((ok: boolean) => void) | null>(null)

  const settle = useCallback((ok: boolean) => {
    resolver.current?.(ok)
    resolver.current = null
    if (!ok) { setSpec(null); setPhase2(null); setRefusal(null); setError(null); setBusy(false); settleFocus() }
  }, [])

  /** Opens the dialog (or re-arms an open one) and waits for the answer. */
  const ask = useCallback((next: ConfirmSpec): Promise<boolean> => {
    setSpec(next); setError(null); setRefusal(null); setBusy(false)
    return new Promise<boolean>((resolve) => { resolver.current = resolve })
  }, [])

  /** Second phase in place: adds the sentence, swaps the label, waits again. */
  const escalate = useCallback((sentence: string, confirmLabel: string): Promise<boolean> => {
    setPhase2(sentence)
    setSpec((current) => (current ? { ...current, confirmLabel } : current))
    setBusy(false)
    return new Promise<boolean>((resolve) => { resolver.current = resolve })
  }, [])

  /** The action can no longer proceed: the reason replaces the confirm button (Cancel only). */
  const refuse = useCallback((reason: string) => { setRefusal(reason); setBusy(false) }, [])

  const close = useCallback(() => { setSpec(null); setPhase2(null); setRefusal(null); setError(null); setBusy(false); resolver.current = null; settleFocus() }, [])

  const fail = useCallback((message: string) => { setError(message); setBusy(false) }, [])

  const dialog: ReactNode = spec ? <ConfirmDialog open title={spec.title} description={spec.description}
    confirmLabel={busy ? (spec.busyLabel ?? "Working…") : spec.confirmLabel} destructive={spec.destructive ?? true} busy={busy} confirmDisabled={refusal !== null}
    onConfirm={() => { if (refusal) return; setBusy(true); setError(null); settle(true) }}
    onCancel={() => { if (busy) return; settle(false) }}>
    {phase2 && <p aria-live="assertive" className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{phase2}</p>}
    {refusal && <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{refusal}</p>}
    {error && <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
  </ConfirmDialog> : null

  return { ask, escalate, refuse, fail, close, busy, dialog }
}
