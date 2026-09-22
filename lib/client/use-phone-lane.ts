"use client"

import { useEffect, useState } from "react"

/** #257: the one breakpoint the phone approval lane hangs off — below `lg` the Detail pane is a
 * full-screen sheet, the queue is a card list, and decisions are the only actions offered. One
 * query string shared by the Queue screen, the Detail pane and the two Approval surfaces, so
 * "phone lane" means the same width everywhere (B3: one term, one definition). */
export const PHONE_LANE_QUERY = "(max-width: 1023px)"

export function isPhoneLane(): boolean {
  return typeof window !== "undefined" && window.matchMedia(PHONE_LANE_QUERY).matches
}

/** `false` on the server and the first client render so the markup agrees; the real value lands
 * a tick after hydration and tracks the viewport from there. Layout itself stays in CSS
 * (`lg:` classes) — this hook only drives *behaviour* that CSS cannot (history entries, dialog
 * semantics, `inert`, tab order). */
export function usePhoneLane(): boolean {
  const [phone, setPhone] = useState(false)
  useEffect(() => {
    const media = window.matchMedia(PHONE_LANE_QUERY)
    const update = () => setPhone(media.matches)
    Promise.resolve().then(update)
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])
  return phone
}
