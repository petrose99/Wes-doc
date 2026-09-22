"use client"

/** A tiny registry of "there is unsaved work on this screen" that the Queue screen consults
 * before it closes or swaps the Detail pane (#250: Match manually's pending line matches). A
 * section registers a reason while it is dirty and clears it when it saves or discards; the
 * screen asks `confirmLeave()` before an exit that would unmount it, and the browser's own
 * `beforeunload` covers a reload or a closed tab. Module state, not React state, so the guard
 * survives the section being several levels down inside server-action-returned content. */

const reasons = new Map<string, string>()
const listeners = new Set<(dirty: boolean) => void>()

/** Subscribe to "is anything unsaved" changing — the Admin leave guard uses it to hold a
 * history entry while a form is dirty so the Back button asks too. */
export function subscribeUnsaved(listener: (dirty: boolean) => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function onBeforeUnload(event: BeforeUnloadEvent) {
  if (reasons.size === 0) return
  event.preventDefault()
  event.returnValue = ""
}

export function setUnsaved(key: string, reason: string | null) {
  if (typeof window === "undefined") return
  const had = reasons.size > 0
  if (reason) reasons.set(key, reason); else reasons.delete(key)
  const has = reasons.size > 0
  if (!had && has) window.addEventListener("beforeunload", onBeforeUnload)
  if (had && !has) window.removeEventListener("beforeunload", onBeforeUnload)
  if (had !== has) for (const listener of listeners) listener(has)
}

export function hasUnsaved(): boolean {
  return reasons.size > 0
}

/** The first registered reason, for a guard that asks in its own dialog (AdminLeaveGuard). */
export function unsavedReason(): string | null {
  return reasons.size > 0 ? [...reasons.values()][0] : null
}

/** The person chose to leave anyway: forget every reason and tell subscribers. */
export function clearUnsaved() {
  if (reasons.size === 0) return
  reasons.clear()
  if (typeof window !== "undefined") window.removeEventListener("beforeunload", onBeforeUnload)
  for (const listener of listeners) listener(false)
}

/** True when it is fine to leave: nothing unsaved, or the person chose to leave anyway. */
export function confirmLeave(): boolean {
  if (reasons.size === 0) return true
  const reason = [...reasons.values()][0]
  const leave = window.confirm(`${reason}\n\nLeave anyway? The unsaved changes will be lost.`)
  if (leave) clearUnsaved()
  return leave
}
