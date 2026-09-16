"use client"

import { useEffect, useId } from "react"
import { Button } from "@/components/ui/button"
import { setUnsaved } from "@/lib/client/unsaved-changes"

/** #231 Q23 (#252): explicit Save + Discard on a sticky bottom bar, never autosave — an owner
 * must not have a half-typed policy in force. The bar only appears while there is something to
 * save, says "Unsaved changes" while it is there, registers the dirty state with
 * lib/client/unsaved-changes (so a reload *and* a client-side link both ask first — see
 * AdminLeaveGuard), and reports the outcome in place: "Saved" for a few seconds (polite) or the
 * refusal as an alert, with the form intact.
 *
 * Every Admin form renders one of these rather than its own bottom Save so the pattern is the
 * same on every page (critique H4). `blocker` is an in-form validation problem that keeps Save
 * disabled and says why. Below `md` the bar sits above the phone tab bar. */
const SAVED_FOR_MS = 4000

export function AdminSaveBar({ dirty, pending, pendingLabel, error, savedAt, blocker, onSave, onDiscard, onSavedShown, errorAction, disabled = false, shortcut = true }: {
  dirty: boolean
  pending: boolean
  /** What the Save button says while `pending` — "Saving…" unless the wait is something else
   * (#253's Default flow counts an estimate before it saves: "Counting…"). */
  pendingLabel?: string
  error: string | null
  /** A timestamp of the last successful save in this session, for the "Saved" line. */
  savedAt: number | null
  blocker?: string | null
  onSave: () => void
  onDiscard: () => void
  /** Called when the "Saved" line has been shown long enough; the owner clears `savedAt`. */
  onSavedShown?: () => void
  /** The one control an error can offer beside its sentence — "Reload" on a stale save. */
  errorAction?: { label: string; onClick: () => void }
  /** Read-only viewers never see the bar. */
  disabled?: boolean
  /** Off while a dialog owns the keyboard, so ⌘S cannot re-run Save under an open confirm. */
  shortcut?: boolean
}) {
  const key = useId()
  useEffect(() => {
    setUnsaved(key, dirty && !disabled ? "You have unsaved changes on this page." : null)
    return () => setUnsaved(key, null)
  }, [key, dirty, disabled])

  useEffect(() => {
    if (disabled || !shortcut) return
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault()
        if (dirty && !pending && !blocker) onSave()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [disabled, shortcut, dirty, pending, blocker, onSave])

  useEffect(() => {
    if (savedAt === null || dirty || !onSavedShown) return
    const id = window.setTimeout(onSavedShown, SAVED_FOR_MS)
    return () => window.clearTimeout(id)
  }, [savedAt, dirty, onSavedShown])

  if (disabled) return null
  const visible = dirty || pending || !!error || savedAt !== null

  return <div className={`sticky bottom-[72px] z-20 -mx-5 border-t border-hairline bg-white/95 px-5 backdrop-blur-sm transition-[opacity,transform] duration-150 ease-out md:bottom-0 md:-mx-8 md:px-8 ${visible ? "mt-10 translate-y-0 opacity-100" : "pointer-events-none mt-0! h-0 translate-y-2 overflow-hidden border-t-0 opacity-0"}`} aria-hidden={visible ? undefined : true}>
    <div className="flex min-h-[56px] flex-wrap items-center gap-x-4 gap-y-2 py-2.5">
      <Button type="button" onClick={onSave} disabled={pending || !dirty || !!blocker} title="⌘S / Ctrl+S">{pending ? (pendingLabel ?? "Saving…") : "Save changes"}</Button>
      <Button type="button" variant="ghost" onClick={onDiscard} disabled={pending || !dirty}>Discard</Button>
      <span aria-live="polite" className="inline-flex items-center">
        {dirty && !pending && !error && <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
          Unsaved changes
        </span>}
        {!dirty && !pending && !error && savedAt !== null && <span className="text-xs font-medium text-emerald-800">Saved</span>}
      </span>
      {blocker && dirty && <span className="text-xs text-red-700">{blocker}</span>}
      {error && <span role="alert" className="inline-flex flex-wrap items-center gap-x-2 text-xs text-red-700">{error}{errorAction && <button type="button" onClick={errorAction.onClick} className="font-medium underline underline-offset-2 hover:text-red-900">{errorAction.label}</button>}</span>}
    </div>
  </div>
}
