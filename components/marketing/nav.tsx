"use client"

import { Logo } from "@/components/marketing/logo"
import { Menu, X } from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useRef, useState } from "react"

/** Nav links. Anchor targets on the marketing page get scroll-spy active state (see effect below).
 * Trimmed hard — few enough choices to hold in working memory. Pricing is deliberately absent
 * until real tiers exist: a "Pricing" link that lands on a page with no prices costs more trust
 * than it earns (the /pricing route itself stays reachable by URL). Re-add it here the day the
 * tier grid is real. */
const LINKS: { href: Route; label: string; anchor?: string }[] = [
  { href: "/#ap-loop", label: "The AP loop", anchor: "ap-loop" },
  { href: "/#extraction", label: "Extraction", anchor: "extraction" },
  { href: "/#automation", label: "Automation", anchor: "automation" },
  { href: "/#faq", label: "FAQ", anchor: "faq" },
]

/** The marketing header. Signed-in visitors get one CTA back into their workspace instead of the
 * trial pitch — everything else (links, logo) stays the same regardless of session.
 *
 * Scroll-spy: watches the anchor targets on the homepage and marks the current section active.
 * Uses IntersectionObserver rather than a scroll handler so it doesn't fire on every frame. */
export function MarketingNav({ workspaceHref }: { workspaceHref?: string }) {
  const pathname = usePathname()
  const [activeAnchor, setActiveAnchor] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const detailsRef = useRef<HTMLDetailsElement>(null)

  // Scroll-spy: only wire up on the marketing home page — that's where the anchors resolve.
  useEffect(() => {
    if (pathname !== "/") { setActiveAnchor(null); return }
    const anchors = LINKS.map((l) => l.anchor).filter((a): a is string => Boolean(a))
    const els = anchors.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => el !== null)
    if (els.length === 0) return
    const obs = new IntersectionObserver(
      (entries) => {
        const hits = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)
        if (hits.length > 0) setActiveAnchor(hits[0]!.target.id)
      },
      // Bias the viewport upward so a section reads as "active" when it's the one you're reading,
      // not the sliver just entering from the bottom.
      { rootMargin: "-40% 0px -50% 0px", threshold: [0, 0.25, 0.5] },
    )
    for (const el of els) obs.observe(el)
    return () => obs.disconnect()
  }, [pathname])

  // Close the mobile menu when a link is clicked. Native <details> would leave the panel open
  // during scroll to the anchor, which looks like the menu ignored the tap.
  const closeMenu = () => {
    setMenuOpen(false)
    if (detailsRef.current) detailsRef.current.open = false
  }

  const linkClass = (link: (typeof LINKS)[number]) => {
    const active = link.anchor ? activeAnchor === link.anchor : pathname === link.href
    return `transition-colors ${active ? "text-stone-900 font-semibold" : "text-stone-600 hover:text-stone-900"}`
  }

  return (
    <header className="sticky top-0 z-20 border-b border-cream-200 bg-cream-50/85 backdrop-blur">
      <div className="mx-auto flex items-center justify-between gap-4 px-5 py-3.5" style={{ maxWidth: "1180px" }}>
        <Link href="/" aria-label="DocuBite home" className="inline-flex items-center">
          <Logo />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-5.5 text-[0.86rem] font-medium md:flex">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} className={linkClass(link)}>
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Right-hand rail: CTAs on all viewports, plus the mobile menu button */}
        <div className="flex items-center gap-3 text-[0.86rem] font-medium">
          {workspaceHref ? (
            <Link href={workspaceHref as Route} className="inline-flex h-9 items-center rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-800">
              Open workspace
            </Link>
          ) : (
            <>
              <Link href="/login" className="hidden text-stone-600 transition-colors hover:text-stone-900 sm:inline">
                Sign in
              </Link>
              <Link href="/signup" className="inline-flex h-9 items-center rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-800">
                Start free trial
              </Link>
            </>
          )}
          <button
            type="button"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-cream-200 bg-white text-stone-700 transition-colors hover:bg-cream-50 md:hidden"
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Mobile panel */}
      {menuOpen && (
        <nav
          id="mobile-nav"
          className="border-t border-cream-200 bg-cream-50 md:hidden"
          onClick={closeMenu}
        >
          <div className="mx-auto flex max-w-6xl flex-col gap-1 px-5 py-3">
            {LINKS.map((link) => (
              <Link key={link.href} href={link.href} className={`rounded-md px-3 py-2.5 text-[0.95rem] ${linkClass(link)}`}>
                {link.label}
              </Link>
            ))}
            {!workspaceHref && (
              <Link href="/login" className="rounded-md px-3 py-2.5 text-[0.95rem] text-stone-600 hover:text-stone-900 sm:hidden">
                Sign in
              </Link>
            )}
          </div>
        </nav>
      )}
    </header>
  )
}
