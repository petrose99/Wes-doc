"use client"

import { useEffect } from "react"
import { confirmLeave, subscribeUnsaved } from "@/lib/client/unsaved-changes"

/** #252 (critique H3, P0): `beforeunload` only guards a reload or a closed tab. Every link in the
 * app — the rail, the Admin nav, the document-type tabs — is a client navigation, which would
 * drop a dirty form without a word. This listens at the capture phase for any same-origin link
 * click while something is registered unsaved (lib/client/unsaved-changes) and asks first, the
 * same question the Queue screen asks before it swaps the Detail pane.
 *
 * The Back button is guarded the same way: while a form is dirty a sentinel history entry is
 * pushed, so the first Back lands on the same page and asks; declining re-arms the sentinel,
 * leaving goes back for real. */
const SENTINEL = "docubite-unsaved-sentinel"

export function AdminLeaveGuard() {
  useEffect(() => {
    let armed = false
    const arm = () => { if (armed) return; window.history.pushState({ [SENTINEL]: true }, "", window.location.href); armed = true }
    const disarm = () => { if (!armed) return; armed = false; if (window.history.state?.[SENTINEL]) window.history.back() }
    const unsubscribe = subscribeUnsaved((dirty) => { if (dirty) arm(); else disarm() })

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const anchor = (event.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return
      const url = new URL(anchor.href, window.location.href)
      if (url.origin !== window.location.origin) return
      if (url.pathname === window.location.pathname && url.search === window.location.search) return
      if (!confirmLeave()) { event.preventDefault(); event.stopPropagation(); return }
      armed = false
    }
    const onPopState = () => {
      if (!armed) return
      // Back from the sentinel: ask; declining re-pushes the sentinel so the page stays.
      if (!confirmLeave()) { window.history.pushState({ [SENTINEL]: true }, "", window.location.href); return }
      // Leaving: the pop landed on this page's own entry; go back once more to where Back meant.
      armed = false
      window.history.back()
    }
    document.addEventListener("click", onClick, true)
    window.addEventListener("popstate", onPopState)
    return () => { unsubscribe(); document.removeEventListener("click", onClick, true); window.removeEventListener("popstate", onPopState) }
  }, [])
  return null
}
