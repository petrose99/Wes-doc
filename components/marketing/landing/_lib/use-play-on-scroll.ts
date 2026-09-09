"use client"

import { useEffect, useRef, useState } from "react"

/** Plays a section's reveal whenever it scrolls into view, and rearms when it scrolls back out —
 * the pattern behind every animated section under components/marketing/landing/. Callers use
 * `played` to switch each child's animation-name from "none" (its resting look — see the db-in and
 * db-pop keyframe comment in app/globals.css) to the keyframe that reveals it.
 *
 * It used to fire once per page load and offer a Replay button for a second look. Scrolling back
 * to a section is that second look, so the observer now drives it on its own: entering plays,
 * leaving resets to the resting state, and the next entry plays again. Clearing on exit is what
 * makes the restart work — the animation-name drops to "none" while the section is off-screen, so
 * reapplying the keyframe on re-entry lands in a later paint and genuinely restarts it.
 *
 * The rearm threshold is 0, not the entry threshold: a section resets only once it is completely
 * gone, so a section parked near a viewport edge cannot flicker between states as the page is
 * nudged. Skips the observer entirely under prefers-reduced-motion — the section renders at rest. */
export function usePlayOnScroll<T extends HTMLElement = HTMLDivElement>(threshold = 0.28) {
  const ref = useRef<T | null>(null)
  const [played, setPlayed] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
    if (typeof IntersectionObserver === "undefined") return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.intersectionRatio >= threshold) setPlayed(true)
          else if (entry.intersectionRatio === 0) setPlayed(false)
        }
      },
      { threshold: [0, threshold] },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [threshold])

  return { ref, played }
}

export const IN = "animate-[db-in_0.5s_cubic-bezier(0.22,1,0.36,1)_both]"
export const POP = "animate-[db-pop_0.5s_cubic-bezier(0.22,1,0.36,1)_both]"
export const SWEEP = "animate-[db-sweep_2.4s_ease-in-out_both]"
/** Fills a bar from its left edge. Pair with origin-left and the element's final width. */
export const GROW = "animate-[db-grow_0.7s_cubic-bezier(0.22,1,0.36,1)_both]"
