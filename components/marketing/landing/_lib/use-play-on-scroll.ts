"use client"

import { useCallback, useEffect, useRef, useState } from "react"

/** Fires once when the section scrolls into view, then exposes a `replay()` that restarts the
 * whole reveal sequence — the pattern behind every animated section under components/marketing/
 * landing/. Callers use `played` to switch each child's animation-name from "none" (its resting
 * look — see the db-in/db-pop keyframe comment in app/globals.css) to the keyframe that reveals it.
 *
 * Skips the observer entirely under prefers-reduced-motion: the section just renders at rest. */
export function usePlayOnScroll<T extends HTMLElement = HTMLDivElement>(threshold = 0.28) {
  const ref = useRef<T | null>(null)
  const [played, setPlayed] = useState(false)
  const firedRef = useRef(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
    if (typeof IntersectionObserver === "undefined") return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || firedRef.current) return
        firedRef.current = true
        setPlayed(true)
      },
      { threshold },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [threshold])

  // Two rAFs, matching the source component's replay(): one frame to let the browser register the
  // animation-name drop to "none", a second to apply the keyframe again — a single rAF can still
  // land in the same paint as the state clear and never restart the animation.
  const replay = useCallback(() => {
    setPlayed(false)
    requestAnimationFrame(() => requestAnimationFrame(() => setPlayed(true)))
  }, [])

  return { ref, played, replay }
}

export const IN = "animate-[db-in_0.5s_cubic-bezier(0.22,1,0.36,1)_both]"
export const POP = "animate-[db-pop_0.5s_cubic-bezier(0.22,1,0.36,1)_both]"
export const SWEEP = "animate-[db-sweep_2.4s_ease-in-out_both]"
