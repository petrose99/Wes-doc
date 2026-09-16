"use client"

import { useEffect, useState } from "react"

/** #236 decision #10's offline state: "buttons disabled with a stated reason, list stays
 * readable". `navigator.onLine` only ever proves "definitely offline" reliably (a true value can
 * still mean no real route to the server), but that asymmetry is fine here — it only ever
 * disables a button proactively, never blocks a submit that would otherwise have been allowed to
 * try and fail with its own inline error. Defaults to `true` (online) so server-rendered markup
 * and the first client render agree; the real value lands a tick after hydration. */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true)
  useEffect(() => {
    // Deferred a tick, matching `DetailPane`'s own load() — the effect body itself never calls
    // setState synchronously, so the real value (which can differ from the `true` server/first-
    // render default the instant the browser is actually offline) lands a tick after hydration
    // instead of racing it.
    Promise.resolve().then(() => {
      try { setOnline(navigator.onLine) } catch { /* no navigator — assume online */ }
    })
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener("online", goOnline)
    window.addEventListener("offline", goOffline)
    return () => {
      window.removeEventListener("online", goOnline)
      window.removeEventListener("offline", goOffline)
    }
  }, [])
  return online
}
