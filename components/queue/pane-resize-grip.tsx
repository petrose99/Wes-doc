"use client"

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type RefObject } from "react"

/** #360 Section 3: a continuous viewer/form split, replacing the old three-state Split/Details/
 * Source radiogroup. Shared here (not inline in a single caller) so #362/#364/#365 (Bill/Receipt/PO
 * templates, same map) can reuse the same resize behavior. */
const SPLIT_MIN = 35
const SPLIT_MAX = 65
const SPLIT_DEFAULT = 52
function parseSplitPct(raw: string | null): number {
  const n = raw === null ? NaN : Number(raw)
  return Number.isFinite(n) && n >= SPLIT_MIN && n <= SPLIT_MAX ? n : SPLIT_DEFAULT
}

/** Percentage-based split state + drag/keyboard handlers, persisted per session under `storageKey`.
 * An old enum string (`"split"`/`"details-only"`/`"source-only"`) from a still-open tab is tolerated
 * — `parseSplitPct` falls back to the default on a non-numeric/out-of-bounds read. */
export function usePaneResize(storageKey: string) {
  const [splitPct, setSplitPct] = useState(SPLIT_DEFAULT)
  const [dragging, setDragging] = useState(false)
  const rowRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    setSplitPct(parseSplitPct(window.sessionStorage.getItem(storageKey)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const commitSplit = (pct: number) => {
    const clamped = Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, pct))
    setSplitPct(clamped)
    return clamped
  }
  // B2: write once per gesture (pointerup), not on every pointermove — `current` here is a plain
  // closure-local variable (not a React ref), so tracking it during drag is a normal event-handler
  // side effect, not a render-time ref read.
  const onGripPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    const row = rowRef.current
    if (!row) return
    setDragging(true)
    let current = splitPct
    const move = (moveEvent: PointerEvent) => {
      const rect = row.getBoundingClientRect()
      current = commitSplit(((moveEvent.clientX - rect.left) / rect.width) * 100)
    }
    const up = () => {
      setDragging(false)
      window.sessionStorage.setItem(storageKey, String(current))
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
  }
  const onGripKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = event.key === "ArrowLeft" ? splitPct - 2
      : event.key === "ArrowRight" ? splitPct + 2
      : event.key === "Home" ? SPLIT_MIN
      : event.key === "End" ? SPLIT_MAX
      : null
    if (next === null) return
    event.preventDefault()
    window.sessionStorage.setItem(storageKey, String(commitSplit(next)))
  }
  return { splitPct, dragging, rowRef, onGripPointerDown, onGripKeyDown, SPLIT_MIN, SPLIT_MAX }
}

/** The `role="separator"` grip itself — B4/B5/WCAG 2.5.7: Home/End/Arrow keys resize without
 * requiring the drag. Rendered ≥`lg` only by the caller (phone lane keeps its stacked layout). */
export function PaneResizeGrip({ state }: { state: ReturnType<typeof usePaneResize> }) {
  const { splitPct, dragging, onGripPointerDown, onGripKeyDown, SPLIT_MIN: min, SPLIT_MAX: max } = state
  return (
    <div role="separator" aria-orientation="vertical" aria-label="Resize document viewer"
      aria-valuenow={Math.round(splitPct)} aria-valuemin={min} aria-valuemax={max}
      tabIndex={0} onPointerDown={onGripPointerDown} onKeyDown={onGripKeyDown}
      className={`hidden w-1.5 shrink-0 cursor-col-resize items-center justify-center bg-slate-100 hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 lg:flex ${dragging ? "bg-emerald-100" : ""}`}>
      <span className="pointer-events-none text-[10px] leading-none text-slate-400" aria-hidden>⫶</span>
    </div>
  )
}

export type PaneResizeState = ReturnType<typeof usePaneResize>
