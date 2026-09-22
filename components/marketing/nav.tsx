"use client"

import { Logo } from "@/components/marketing/logo"
import { solutionsByGroup } from "@/lib/solutions"
import { Activity, ArrowUpRight, BookOpenCheck, ChevronDown, FileText, Menu, Plug, ShieldCheck, X } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useRef, useState } from "react"

type PanelId = "product" | "solutions" | "resources"

type ProductLink = {
  href: string
  label: string
  description: string
  icon: typeof FileText
}

type ProductGroup = {
  label: string
  links: ProductLink[]
}

const PRODUCT_GROUPS: ProductGroup[] = [
  {
    label: "Read & review",
    links: [
      { href: "/product/extraction", label: "Document extraction", description: "Supported documents into reviewable rows", icon: FileText },
      { href: "/product/controls", label: "Controls & fraud", description: "Explainable checks before risky steps", icon: ShieldCheck },
    ],
  },
  {
    label: "Close with confidence",
    links: [
      { href: "/product/close", label: "Close the books", description: "Gated periods and unposted accrual drafts", icon: BookOpenCheck },
      { href: "/product/data-health", label: "Data health", description: "Find pipeline, ledger and tax drift", icon: Activity },
    ],
  },
  {
    label: "Connect & extend",
    links: [
      { href: "/product/integrations", label: "Integrations & API", description: "Send reviewed data through connected systems", icon: Plug },
    ],
  },
]

const RESOURCE_LINKS = [
  { href: "/resources#guides", label: "Guides", description: "Practical notes for finance teams" },
  { href: "/resources#product-deep-dives", label: "Product deep-dives", description: "The mechanisms, with the limits included" },
  { href: "/resources#comparisons", label: "Comparisons", description: "Plain-language workflow comparisons" },
  { href: "/resources#business-case", label: "Business case", description: "Questions to help a team decide" },
]

const ROLE_SOLUTIONS = solutionsByGroup("ap")

function sectionIsCurrent(pathname: string, section: string) {
  if (section === "product") return pathname === "/product" || pathname.startsWith("/product/")
  if (section === "solutions") return pathname === "/solutions" || pathname.startsWith("/solutions/")
  return pathname.startsWith(`/${section}`)
}

export function MarketingNav({ workspaceHref }: { workspaceHref?: string }) {
  const pathname = usePathname()
  const [openPanel, setOpenPanel] = useState<PanelId | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const navRef = useRef<HTMLElement>(null)
  const mobileNavRef = useRef<HTMLElement>(null)
  const triggerRefs = useRef<Partial<Record<PanelId, HTMLButtonElement>>>({})
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimers = () => {
    if (openTimer.current) clearTimeout(openTimer.current)
    if (closeTimer.current) clearTimeout(closeTimer.current)
    openTimer.current = null
    closeTimer.current = null
  }

  const closePanel = (restoreFocus = false) => {
    const panel = openPanel
    clearTimers()
    setOpenPanel(null)
    if (restoreFocus && panel) triggerRefs.current[panel]?.focus()
  }

  useEffect(() => {
    if (!openPanel) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!navRef.current?.contains(event.target as Node) && !mobileNavRef.current?.contains(event.target as Node)) {
        clearTimers()
        setOpenPanel(null)
      }
    }
    const handleFocusIn = (event: FocusEvent) => {
      if (!navRef.current?.contains(event.target as Node) && !mobileNavRef.current?.contains(event.target as Node)) {
        clearTimers()
        setOpenPanel(null)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        const panel = openPanel
        clearTimers()
        setOpenPanel(null)
        if (panel) triggerRefs.current[panel]?.focus()
      }
    }

    document.addEventListener("pointerdown", handlePointerDown)
    document.addEventListener("focusin", handleFocusIn)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown)
      document.removeEventListener("focusin", handleFocusIn)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [openPanel])

  useEffect(() => () => clearTimers(), [])

  const togglePanel = (panel: PanelId) => {
    clearTimers()
    setOpenPanel((current) => current === panel ? null : panel)
  }

  const openFromPointer = (panel: PanelId) => {
    clearTimers()
    openTimer.current = setTimeout(() => setOpenPanel(panel), 200)
  }

  const closeFromPointer = () => {
    clearTimers()
    closeTimer.current = setTimeout(() => setOpenPanel(null), 300)
  }

  const keepPanelOpen = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = null
  }

  const linkClass = (active: boolean, mobile = false) => [
    "transition-colors",
    mobile ? "rounded-md px-3 py-3 text-[0.95rem]" : "px-2 py-2 text-[0.86rem]",
    active ? "font-semibold text-slate-950" : "text-slate-600 hover:text-slate-950",
  ].join(" ")

  const panelId = (panel: PanelId, mobile = false) => `marketing-panel-${mobile ? "mobile-" : ""}${panel}`

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-3 focus:text-sm focus:font-semibold focus:text-slate-950 focus:shadow-panel focus:outline-2 focus:outline-offset-2 focus:outline-emerald-700"
      >
        Skip to main content
      </a>
      <div className="mx-auto flex items-center justify-between gap-3 px-5 py-3.5" style={{ maxWidth: "1180px" }}>
        <Link href="/" aria-label="DocuBite home" className="inline-flex shrink-0 items-center">
          <Logo />
        </Link>

        <nav ref={navRef} aria-label="Primary navigation" className="hidden min-w-0 flex-1 justify-center md:flex" onPointerLeave={closeFromPointer}>
          <ul className="flex items-center gap-0.5 text-[0.86rem] font-medium">
            <li className="relative" onPointerEnter={() => openFromPointer("product")} onPointerLeave={closeFromPointer}>
              <div className="flex items-center">
                <Link href="/product" aria-current={sectionIsCurrent(pathname, "product") ? "page" : undefined} className={linkClass(sectionIsCurrent(pathname, "product"))} onClick={() => closePanel()}>
                  Product
                </Link>
                <button
                  ref={(node) => { triggerRefs.current.product = node ?? undefined }}
                  type="button"
                  aria-label="Toggle Product menu"
                  aria-expanded={openPanel === "product"}
                  aria-controls={panelId("product")}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
                  onClick={() => togglePanel("product")}
                  onPointerEnter={keepPanelOpen}
                >
                  <ChevronDown aria-hidden className={`h-4 w-4 transition-transform ${openPanel === "product" ? "rotate-180" : ""}`} />
                </button>
              </div>
              <div
                id={panelId("product")}
                hidden={openPanel !== "product"}
                aria-labelledby="marketing-product-title"
                className="absolute left-1/2 top-full z-30 w-[min(760px,calc(100vw-2rem))] -translate-x-1/2 pt-3"
                onPointerEnter={keepPanelOpen}
              >
                <div className="border-t-2 border-slate-900 bg-white p-6 shadow-panel ring-1 ring-slate-200">
                  <h2 id="marketing-product-title" className="sr-only">Product navigation</h2>
                  <Link href="/product" className="group flex items-start justify-between gap-5 border-b border-slate-200 pb-5" onClick={() => closePanel()}>
                    <span>
                      <span className="block font-display text-xl font-bold tracking-[-0.025em] text-slate-950 group-hover:text-emerald-800">Product overview</span>
                      <span className="mt-1 block text-sm leading-6 text-slate-600">See how documents move from intake to a reviewed, connected ledger.</span>
                    </span>
                    <ArrowUpRight aria-hidden className="mt-1 h-4 w-4 shrink-0 text-emerald-700" />
                  </Link>
                  <div className="mt-6 grid gap-7 sm:grid-cols-3">
                    {PRODUCT_GROUPS.map((group) => (
                      <div key={group.label}>
                        <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{group.label}</h3>
                        <ul className="mt-3 space-y-1">
                          {group.links.map(({ href, label, description, icon: Icon }) => {
                            const active = pathname === href
                            return (
                              <li key={href}>
                                <Link href={href} aria-current={active ? "page" : undefined} className="group/link -mx-2 flex items-start gap-3 rounded-md p-2 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700" onClick={() => closePanel()}>
                                  <Icon aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                                  <span>
                                    <span className="block text-sm font-semibold text-slate-900 group-hover/link:text-emerald-800">{label}</span>
                                    <span className="mt-0.5 block text-xs leading-5 text-slate-600">{description}</span>
                                  </span>
                                </Link>
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </li>

            <li className="relative" onPointerEnter={() => openFromPointer("solutions")} onPointerLeave={closeFromPointer}>
              <div className="flex items-center">
                <Link href="/solutions" aria-current={sectionIsCurrent(pathname, "solutions") ? "page" : undefined} className={linkClass(sectionIsCurrent(pathname, "solutions"))} onClick={() => closePanel()}>
                  Solutions
                </Link>
                <button
                  ref={(node) => { triggerRefs.current.solutions = node ?? undefined }}
                  type="button"
                  aria-label="Toggle Solutions menu"
                  aria-expanded={openPanel === "solutions"}
                  aria-controls={panelId("solutions")}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
                  onClick={() => togglePanel("solutions")}
                  onPointerEnter={keepPanelOpen}
                >
                  <ChevronDown aria-hidden className={`h-4 w-4 transition-transform ${openPanel === "solutions" ? "rotate-180" : ""}`} />
                </button>
              </div>
              <div
                id={panelId("solutions")}
                hidden={openPanel !== "solutions"}
                aria-labelledby="marketing-solutions-title"
                className="absolute left-1/2 top-full z-30 w-[min(650px,calc(100vw-2rem))] -translate-x-1/2 pt-3"
                onPointerEnter={keepPanelOpen}
              >
                <div className="border-t-2 border-slate-900 bg-white p-6 shadow-panel ring-1 ring-slate-200">
                  <h2 id="marketing-solutions-title" className="sr-only">Solutions navigation</h2>
                  <Link href="/solutions" className="group flex items-start justify-between gap-5 border-b border-slate-200 pb-5" onClick={() => closePanel()}>
                    <span>
                      <span className="block font-display text-xl font-bold tracking-[-0.025em] text-slate-950 group-hover:text-emerald-800">Solutions by role</span>
                      <span className="mt-1 block text-sm leading-6 text-slate-600">See how the same AP workflow fits controllers, bookkeepers and finance-ops teams.</span>
                    </span>
                    <ArrowUpRight aria-hidden className="mt-1 h-4 w-4 shrink-0 text-emerald-700" />
                  </Link>
                  <div className="mt-6">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">For AP teams</h3>
                    <ul className="mt-3 grid gap-x-7 gap-y-1 sm:grid-cols-3">
                      {ROLE_SOLUTIONS.map(({ slug, name, tagline, icon: Icon }) => {
                        const href = `/solutions/${slug}`
                        const active = pathname === href
                        return (
                          <li key={slug}>
                            <Link href={href} aria-current={active ? "page" : undefined} className="group/link -mx-2 flex items-start gap-3 rounded-md p-2 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700" onClick={() => closePanel()}>
                              <Icon aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                              <span>
                                <span className="block text-sm font-semibold text-slate-900 group-hover/link:text-emerald-800">{name}</span>
                                <span className="mt-0.5 block text-xs leading-5 text-slate-600">{tagline}</span>
                              </span>
                            </Link>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                </div>
              </div>
            </li>

            <li>
              <Link href="/pricing" aria-current={sectionIsCurrent(pathname, "pricing") ? "page" : undefined} className={linkClass(sectionIsCurrent(pathname, "pricing"))} onClick={() => closePanel()}>Pricing</Link>
            </li>

            <li className="relative" onPointerEnter={() => openFromPointer("resources")} onPointerLeave={closeFromPointer}>
              <div className="flex items-center">
                <Link href="/resources" aria-current={sectionIsCurrent(pathname, "resources") ? "page" : undefined} className={linkClass(sectionIsCurrent(pathname, "resources"))} onClick={() => closePanel()}>Resources</Link>
                <button
                  ref={(node) => { triggerRefs.current.resources = node ?? undefined }}
                  type="button"
                  aria-label="Toggle Resources menu"
                  aria-expanded={openPanel === "resources"}
                  aria-controls={panelId("resources")}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
                  onClick={() => togglePanel("resources")}
                  onPointerEnter={keepPanelOpen}
                >
                  <ChevronDown aria-hidden className={`h-4 w-4 transition-transform ${openPanel === "resources" ? "rotate-180" : ""}`} />
                </button>
              </div>
              <div
                id={panelId("resources")}
                hidden={openPanel !== "resources"}
                aria-labelledby="marketing-resources-title"
                className="absolute left-1/2 top-full z-30 w-[min(430px,calc(100vw-2rem))] -translate-x-1/2 pt-3"
                onPointerEnter={keepPanelOpen}
              >
                <div className="border-t-2 border-slate-900 bg-white p-6 shadow-panel ring-1 ring-slate-200">
                  <h2 id="marketing-resources-title" className="sr-only">Resources navigation</h2>
                  <Link href="/resources" className="group flex items-start justify-between gap-5 border-b border-slate-200 pb-5" onClick={() => closePanel()}>
                    <span>
                      <span className="block font-display text-xl font-bold tracking-[-0.025em] text-slate-950 group-hover:text-emerald-800">Browse resources</span>
                      <span className="mt-1 block text-sm leading-6 text-slate-600">Notes on invoice workflows, document controls and the work behind every bill.</span>
                    </span>
                    <ArrowUpRight aria-hidden className="mt-1 h-4 w-4 shrink-0 text-emerald-700" />
                  </Link>
                  <ul className="mt-4 divide-y divide-slate-200">
                    {RESOURCE_LINKS.map(({ href, label, description }) => (
                      <li key={href}>
                        <Link href={href} className="group/link block py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700" onClick={() => closePanel()}>
                          <span className="block text-sm font-semibold text-slate-900 group-hover/link:text-emerald-800">{label}</span>
                          <span className="mt-0.5 block text-xs leading-5 text-slate-600">{description}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </li>

            <li>
              <span className="inline-flex cursor-default px-2 py-2 text-[0.86rem] font-medium text-slate-400" aria-disabled="true" title="The About page is not available yet">About</span>
            </li>
          </ul>
        </nav>

        <div className="flex shrink-0 items-center gap-2 text-[0.86rem] font-medium">
          {workspaceHref ? (
            <Link href={workspaceHref} className="inline-flex h-9 items-center rounded-lg bg-emerald-700 px-3.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 sm:px-4">
              Open workspace
            </Link>
          ) : (
            <>
              <Link href="/login" className="hidden text-slate-600 transition-colors hover:text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 sm:inline">Sign in</Link>
              <Link href="/signup" className="inline-flex h-9 items-center rounded-lg bg-emerald-700 px-3.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 sm:px-4">Create an account</Link>
            </>
          )}
          <button
            type="button"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 md:hidden"
            onClick={() => setMobileOpen((current) => !current)}
          >
            {mobileOpen ? <X aria-hidden className="h-4 w-4" /> : <Menu aria-hidden className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <nav ref={mobileNavRef} id="mobile-nav" aria-label="Mobile navigation" className={`${mobileOpen ? "block" : "hidden"} border-t border-slate-200 bg-white md:hidden`}>
        <div className="mx-auto max-w-6xl px-5 py-3">
          <ul className="space-y-1 text-[0.95rem] font-medium">
            <MobileDisclosureLink
              panel="product"
              label="Product"
              href="/product"
              openPanel={openPanel}
              pathname={pathname}
              panelId={panelId("product", true)}
              onToggle={togglePanel}
              onNavigate={() => { closePanel(); setMobileOpen(false) }}
            >
              <div className="grid gap-1 border-l border-slate-200 pl-4 sm:grid-cols-2">
                {PRODUCT_GROUPS.flatMap((group) => group.links).map(({ href, label }) => (
                  <Link key={href} href={href} className="rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700" onClick={() => { closePanel(); setMobileOpen(false) }}>{label}</Link>
                ))}
              </div>
            </MobileDisclosureLink>
            <MobileDisclosureLink
              panel="solutions"
              label="Solutions"
              href="/solutions"
              openPanel={openPanel}
              pathname={pathname}
              panelId={panelId("solutions", true)}
              onToggle={togglePanel}
              onNavigate={() => { closePanel(); setMobileOpen(false) }}
            >
              <div className="grid gap-1 border-l border-slate-200 pl-4 sm:grid-cols-2">
                {ROLE_SOLUTIONS.map(({ slug, name }) => (
                  <Link key={slug} href={`/solutions/${slug}`} className="rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700" onClick={() => { closePanel(); setMobileOpen(false) }}>{name}</Link>
                ))}
              </div>
            </MobileDisclosureLink>
            <li><Link href="/pricing" aria-current={sectionIsCurrent(pathname, "pricing") ? "page" : undefined} className={linkClass(sectionIsCurrent(pathname, "pricing"), true)} onClick={() => { closePanel(); setMobileOpen(false) }}>Pricing</Link></li>
            <MobileDisclosureLink
              panel="resources"
              label="Resources"
              href="/resources"
              openPanel={openPanel}
              pathname={pathname}
              panelId={panelId("resources", true)}
              onToggle={togglePanel}
              onNavigate={() => { closePanel(); setMobileOpen(false) }}
            >
              <div className="grid gap-1 border-l border-slate-200 pl-4">
                {RESOURCE_LINKS.map(({ href, label }) => (
                  <Link key={href} href={href} className="rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700" onClick={() => { closePanel(); setMobileOpen(false) }}>{label}</Link>
                ))}
              </div>
            </MobileDisclosureLink>
            <li><span className="inline-flex px-3 py-3 text-[0.95rem] text-slate-400" aria-disabled="true">About</span></li>
            {!workspaceHref && <li><Link href="/login" className="inline-flex rounded-md px-3 py-3 text-[0.95rem] text-slate-600 hover:text-slate-950 sm:hidden" onClick={() => setMobileOpen(false)}>Sign in</Link></li>}
          </ul>
        </div>
      </nav>
    </header>
  )
}

function MobileDisclosureLink({
  panel,
  label,
  href,
  openPanel,
  pathname,
  panelId,
  onToggle,
  onNavigate,
  children,
}: {
  panel: PanelId
  label: string
  href: string
  openPanel: PanelId | null
  pathname: string
  panelId: string
  onToggle: (panel: PanelId) => void
  onNavigate: () => void
  children: React.ReactNode
}) {
  const active = sectionIsCurrent(pathname, panel)
  const expanded = openPanel === panel
  return (
    <li>
      <div className="flex items-center">
        <Link href={href} aria-current={active ? "page" : undefined} className={`min-w-0 flex-1 ${["rounded-md px-3 py-3 text-[0.95rem]", active ? "font-semibold text-slate-950" : "text-slate-600 hover:text-slate-950"].join(" ")}`} onClick={onNavigate}>{label}</Link>
        <button
          type="button"
          aria-label={`Toggle ${label} menu`}
          aria-expanded={expanded}
          aria-controls={panelId}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-50 hover:text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
          onClick={() => onToggle(panel)}
        >
          <ChevronDown aria-hidden className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
      </div>
      <div id={panelId} hidden={!expanded} className="pb-2 pt-1">{children}</div>
    </li>
  )
}
