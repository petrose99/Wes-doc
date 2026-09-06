"use client"
/** A4.1 + A4.2: confidence-sorted field navigation for the review form. A reviewer opens a
 * document and lands on the LOWEST-confidence non-array field — the one most likely to need
 * a correction — with Enter confirming it and jumping to the next suspect. A ranked visit list
 * means a reviewer spends time on the fields most likely to matter instead of scrolling top-to-
 * bottom past the fields the model got right. Pure client hook: no data-layer state, keyboard
 * only, and it degrades to "do nothing" the moment the form ref isn't wired yet. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

/** Fields at or below this confidence are "suspect" — the ones the nav visits first. Matches
 * the LOW_CONFIDENCE threshold field-row.tsx uses for its amber warning ring, deliberately, so
 * "amber field" and "field the nav lands on" are one concept, not two. */
export const NAV_SUSPECT_THRESHOLD = 0.6

export type FieldNavItem = { key: string; confidence: number | null; type: string }

export type FieldNavAPI = {
  currentKey: string | null
  visitedKeys: Set<string>
  completedKeys: Set<string>
  totalSuspects: number
  suspectsRemaining: number
  /** Move focus to the next unvisited suspect (or, if none, the first low-confidence field
   * ever). Returns the key that got focus, or null if there is nothing left to visit. */
  focusNext: () => string | null
  /** Mark the current field confirmed by the reviewer and advance. Returns the newly focused
   * field's key, or null when the queue is empty (the "you're done" state). */
  confirmAndAdvance: () => string | null
  /** Wire this on the form to intercept Enter for the confirm-and-advance behavior. */
  onFormKeyDown: (event: React.KeyboardEvent<HTMLFormElement>) => void
  /** Attach to each field's wrapper element so the hook can find and focus it. */
  registerField: (key: string, element: HTMLElement | null) => void
}

/** Sort suspects by confidence ascending, with a stable tiebreak on the field's own order so a
 * reviewer sees the same sequence every time they open the document. Array fields are excluded:
 * line_items has its own editor and its own confidence signal isn't a single scalar. */
export function orderSuspectFields(fields: FieldNavItem[]): string[] {
  return fields
    .map((field, index) => ({ field, index }))
    .filter(({ field }) => field.type !== "array" && field.confidence !== null && field.confidence < NAV_SUSPECT_THRESHOLD)
    .sort((a, b) => {
      const ca = a.field.confidence ?? 0
      const cb = b.field.confidence ?? 0
      if (ca !== cb) return ca - cb
      return a.index - b.index
    })
    .map(({ field }) => field.key)
}

export function useFieldNav(fields: FieldNavItem[]): FieldNavAPI {
  const registryRef = useRef<Map<string, HTMLElement>>(new Map())
  const [currentKey, setCurrentKey] = useState<string | null>(null)
  const [visitedKeys, setVisitedKeys] = useState<Set<string>>(() => new Set())
  const [completedKeys, setCompletedKeys] = useState<Set<string>>(() => new Set())

  // Order is a pure derivation — no state, so a re-render with new confidences reshuffles safely.
  const suspectQueue = useMemo(() => orderSuspectFields(fields), [fields])

  const registerField = useCallback((key: string, element: HTMLElement | null) => {
    if (element) registryRef.current.set(key, element)
    else registryRef.current.delete(key)
  }, [])

  const focusField = useCallback((key: string): boolean => {
    const element = registryRef.current.get(key)
    if (!element) return false
    const input = element.querySelector<HTMLElement>("input, select, textarea") ?? element
    input.focus()
    if ("select" in input && typeof (input as HTMLInputElement).select === "function") {
      try { (input as HTMLInputElement).select() } catch { /* not selectable, that's fine */ }
    }
    element.scrollIntoView({ behavior: "smooth", block: "center" })
    setCurrentKey(key)
    setVisitedKeys((prev) => (prev.has(key) ? prev : new Set(prev).add(key)))
    return true
  }, [])

  const focusNext = useCallback((): string | null => {
    for (const key of suspectQueue) {
      if (completedKeys.has(key)) continue
      if (focusField(key)) return key
    }
    return null
  }, [suspectQueue, completedKeys, focusField])

  const confirmAndAdvance = useCallback((): string | null => {
    if (currentKey) {
      setCompletedKeys((prev) => (prev.has(currentKey) ? prev : new Set(prev).add(currentKey)))
    }
    const nextQueue = suspectQueue.filter((key) => key !== currentKey && !completedKeys.has(key))
    for (const key of nextQueue) if (focusField(key)) return key
    setCurrentKey(null)
    return null
  }, [currentKey, suspectQueue, completedKeys, focusField])

  const onFormKeyDown = useCallback((event: React.KeyboardEvent<HTMLFormElement>) => {
    if (event.key !== "Enter") return
    const target = event.target as HTMLElement
    // Never hijack Enter inside a textarea (line breaks in a note field), a button/submit, or
    // the array editor's own inputs — the whole point is to accelerate scalar-field review, not
    // to fight richer widgets.
    if (target.tagName === "TEXTAREA" || target.tagName === "BUTTON") return
    if (target.closest("[data-line-items-editor]")) return
    event.preventDefault()
    confirmAndAdvance()
  }, [confirmAndAdvance])

  // Land on the first suspect once the form has finished registering its refs.
  useEffect(() => {
    if (currentKey) return
    if (!suspectQueue.length) return
    // Defer to next microtask so all children have registered before we try to focus.
    const timeout = setTimeout(() => focusNext(), 0)
    return () => clearTimeout(timeout)
    // Intentionally NOT re-running when focusNext changes — we only auto-focus on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suspectQueue])

  return {
    currentKey,
    visitedKeys,
    completedKeys,
    totalSuspects: suspectQueue.length,
    suspectsRemaining: suspectQueue.filter((key) => !completedKeys.has(key)).length,
    focusNext,
    confirmAndAdvance,
    onFormKeyDown,
    registerField,
  }
}
