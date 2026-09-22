"use client"

import { initAnalytics, track } from "@/lib/marketing-analytics"
import { usePathname } from "next/navigation"
import { useEffect } from "react"

/** Mounted once in each marketing/auth layout. Page views by route, plus delegated CTA tracking:
 * a click on any link to /signup is the primary CTA, any link to /demo the secondary — matching
 * the hierarchy decided on map #157 — so no CTA component needs editing and new CTAs are counted
 * automatically. `location` is the nearest data-track-location ancestor, else the landmark. */
export function MarketingAnalytics() {
  const pathname = usePathname()

  useEffect(() => { initAnalytics() }, [])

  useEffect(() => {
    initAnalytics()
    track("$pageview", { route: pathname })
  }, [pathname])

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.("a[href]")
      if (!link) return
      const path = new URL((link as HTMLAnchorElement).href, window.location.href).pathname
      const name = path === "/signup" ? "primary_cta_clicked" : path === "/demo" ? "secondary_cta_clicked" : null
      if (!name) return
      const location = link.closest("[data-track-location]")?.getAttribute("data-track-location")
        ?? (link.closest("header,nav") ? "nav" : link.closest("footer") ? "footer" : "body")
      track(name, { route: window.location.pathname, location, label: (link.textContent || "").trim().slice(0, 60) })
    }
    document.addEventListener("click", onClick, { capture: true })
    return () => document.removeEventListener("click", onClick, { capture: true })
  }, [])

  return null
}
