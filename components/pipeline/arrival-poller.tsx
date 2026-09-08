"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"

/** Refreshes the pipeline list periodically so a document that arrives *out of band* shows up on
 * a page that is already open.
 *
 * Everything else on this page updates because the person did something — an action runs, then
 * calls router.refresh(). The extraction poller is no help either: it only tracks document ids
 * the client was handed when it uploaded them, so it cannot know about a document it never saw
 * created. Email intake broke that assumption. A mail would arrive, extract, and land in "To
 * review" while the Extraction page sat unchanged in another tab, which reads exactly like the
 * mail never arrived — the single most confusing thing this channel does.
 *
 * router.refresh() re-runs the server component, so the rows and every tab count update together
 * and nothing here needs to know what changed. It preserves client state, so a selection or a
 * half-typed filter survives a tick.
 *
 * Gated on visibility: a backgrounded tab polls nothing, and a tab being returned to refreshes
 * immediately rather than waiting out the rest of its interval — which is the moment someone
 * actually looks, having just sent a mail from somewhere else.
 */
export function ArrivalPoller({ intervalMs = 15_000 }: { intervalMs?: number }) {
  const router = useRouter()

  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") router.refresh()
    }
    const timer = setInterval(refreshIfVisible, intervalMs)
    document.addEventListener("visibilitychange", refreshIfVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener("visibilitychange", refreshIfVisible)
    }
  }, [router, intervalMs])

  return null
}
