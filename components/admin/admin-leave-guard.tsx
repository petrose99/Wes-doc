"use client"

import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { clearUnsaved, hasUnsaved, subscribeUnsaved, unsavedReason } from "@/lib/client/unsaved-changes"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"

/** #252 (critique H3, P0): `beforeunload` only guards a reload or a closed tab. Every link in the
 * app — the rail, the Admin nav, the document-type tabs — is a client navigation, which would
 * drop a dirty form without a word. This listens at the capture phase for any same-origin link
 * click while something is registered unsaved (lib/client/unsaved-changes) and asks first — in
 * the app's own ConfirmDialog, not `window.confirm` (evaluate H3): the question names what is
 * unsaved, Stay is the safe default, and focus returns where it was.
 *
 * The Back button is guarded the same way: while a form is dirty a sentinel history entry is
 * pushed, so the first Back lands on the same page and asks; declining re-arms the sentinel,
 * leaving goes back for real. A reload or closed tab still gets the browser's native prompt —
 * the only one a page may show there. */
const SENTINEL = "docubite-unsaved-sentinel"

type Pending = { kind: "link"; href: string } | { kind: "back" } | null

export function AdminLeaveGuard() {
  const router = useRouter()
  const [pending, setPending] = useState<Pending>(null)
  const armed = useRef(false)

  useEffect(() => {
    const arm = () => { if (armed.current) return; window.history.pushState({ [SENTINEL]: true }, "", window.location.href); armed.current = true }
    const disarm = () => { if (!armed.current) return; armed.current = false; if (window.history.state?.[SENTINEL]) window.history.back() }
    const unsubscribe = subscribeUnsaved((dirty) => { if (dirty) arm(); else disarm() })

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const anchor = (event.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return
      const url = new URL(anchor.href, window.location.href)
      if (url.origin !== window.location.origin) return
      if (url.pathname === window.location.pathname && url.search === window.location.search) return
      if (!hasUnsaved()) { armed.current = false; return }
      event.preventDefault(); event.stopPropagation()
      setPending({ kind: "link", href: url.pathname + url.search + url.hash })
    }
    const onPopState = () => {
      if (!armed.current) return
      // Back from the sentinel: stay (re-push it) and ask; leaving goes back past both entries.
      window.history.pushState({ [SENTINEL]: true }, "", window.location.href)
      setPending({ kind: "back" })
    }
    document.addEventListener("click", onClick, true)
    window.addEventListener("popstate", onPopState)
    return () => { unsubscribe(); document.removeEventListener("click", onClick, true); window.removeEventListener("popstate", onPopState) }
  }, [])

  const leave = () => {
    const target = pending
    setPending(null)
    if (!target) return
    armed.current = false
    clearUnsaved()
    if (target.kind === "link") router.push(target.href)
    else window.history.go(-2)
  }

  return <ConfirmDialog open={pending !== null} destructive title="Leave without saving?" description={`${unsavedReason() ?? "You have unsaved changes on this page."} They will be lost if you leave.`} confirmLabel="Leave without saving" onCancel={() => setPending(null)} onConfirm={leave} />
}
