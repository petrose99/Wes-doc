"use client"

import { BarChart3, Landmark, Library, ListChecks, MoreHorizontal, Table2 } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

/** Mobile bottom tab bar. Five slots, mirroring the desktop rail's primary spine:
 * Dashboard, Documents, Worksheets, Finance (when the ledger integration is enabled) or Archive
 * as a fallback fifth slot, then More. Same core-first framing as the desktop rail so a person on
 * mobile learns the same shape of the product as a person on desktop.
 *
 * Hidden on /sheet and /documents/ — those surfaces get their full viewport on a phone; users
 * navigate back through the surface's own header. */
export function MobileTabBar({ workspaceId, pipelineReviewCount = 0, sheetsUnplacedCount = 0, accountingEnabled = false }: {
  workspaceId: string
  pipelineReviewCount?: number
  sheetsUnplacedCount?: number
  accountingEnabled?: boolean
}) {
  const pathname = usePathname()
  if (pathname.endsWith("/sheet") || pathname.includes("/documents/")) return null

  const base = `/workspaces/${workspaceId}`
  const fifthSlot = accountingEnabled
    ? { href: `${base}/finance`, label: "Finance", icon: Landmark, exact: false as const }
    : { href: `${base}/library`, label: "Archive", icon: Library, exact: false as const }

  const tabs = [
    { href: base, label: "Dashboard", icon: BarChart3, exact: true, badge: undefined as number | undefined },
    { href: `${base}/pipeline`, label: "Documents", icon: ListChecks, exact: false, badge: pipelineReviewCount > 0 ? pipelineReviewCount : undefined },
    { href: `${base}/worksheets`, label: "Worksheets", icon: Table2, exact: false, badge: sheetsUnplacedCount > 0 ? sheetsUnplacedCount : undefined },
    fifthSlot,
    { href: `${base}/settings/workspace`, label: "More", icon: MoreHorizontal, exact: false, badge: undefined as number | undefined },
  ]

  return <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 items-center border-t border-[#eef2f6] bg-[rgba(255,255,255,0.94)] px-2 pb-5 pt-2 backdrop-blur-[10px] md:hidden">
    {tabs.map((tab) => {
      const active = tab.exact
        ? pathname === tab.href
        : pathname === tab.href
          || pathname.startsWith(`${tab.href}/`)
          || (tab.label === "More" && pathname.startsWith(`${base}/settings`))
          || (tab.label === "Documents" && (pathname.startsWith(`${base}/pipeline`) || pathname.startsWith(`${base}/documents`) || pathname.startsWith(`${base}/review`) || pathname.startsWith(`${base}/bills`)))
          || (tab.label === "Worksheets" && (pathname.startsWith(`${base}/worksheets`) || pathname.startsWith(`${base}/files`)))
          || (tab.label === "Finance" && pathname.startsWith(`${base}/accounting`))
      const badge = "badge" in tab ? tab.badge : undefined
      return <Link key={tab.href} href={tab.href}
        className={`relative flex flex-col items-center gap-1 p-1 text-[10.5px] ${active ? "font-semibold text-emerald-700" : "font-medium text-slate-400"}`}>
        <tab.icon className="h-[21px] w-[21px]" />
        {badge != null && <span className="absolute left-[calc(50%+8px)] top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-indigo-600 px-1 text-[10px] font-bold text-white">{badge}</span>}
        {tab.label}
      </Link>
    })}
  </nav>
}
