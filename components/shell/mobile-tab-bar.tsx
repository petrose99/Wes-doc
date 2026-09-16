"use client"

import { AlertTriangle, Landmark, Library, ListChecks, UserRound } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

/** Mobile bottom tab bar. Four slots, the interim shape decided on #237 until #257 builds
 * #232's Approvals · Invoices · Exceptions · Account: Invoices (the workspace home —
 * CONTEXT.md), Exceptions, Finance (when the ledger integration is enabled) or Archive as the
 * fallback third slot, then Account (#231 Q18, #252: Admin is a desktop area, so the phone's
 * fourth tab is the person — security, switching company, sign out).
 *
 * Hidden on /sheet and /documents/ — those surfaces get their full viewport on a phone; users
 * navigate back through the surface's own header. */
export function MobileTabBar({ workspaceId, pipelineReviewCount = 0, openExceptionsCount = 0, accountingEnabled = false }: {
  workspaceId: string
  pipelineReviewCount?: number
  /** #210 / #238: countOpenExceptions — the same badge the rail's Exceptions entry carries. */
  openExceptionsCount?: number
  accountingEnabled?: boolean
}) {
  const pathname = usePathname()
  if (pathname.endsWith("/sheet") || pathname.includes("/documents/")) return null

  const base = `/workspaces/${workspaceId}`
  const thirdSlot = accountingEnabled
    ? { href: `${base}/finance`, label: "Finance", icon: Landmark, badge: undefined as number | undefined }
    : { href: `${base}/library`, label: "Archive", icon: Library, badge: undefined as number | undefined }

  const tabs = [
    { href: `${base}/invoices`, label: "Invoices", icon: ListChecks, badge: pipelineReviewCount > 0 ? pipelineReviewCount : undefined },
    { href: `${base}/exceptions`, label: "Exceptions", icon: AlertTriangle, badge: openExceptionsCount > 0 ? openExceptionsCount : undefined },
    thirdSlot,
    { href: `${base}/account`, label: "Account", icon: UserRound, badge: undefined as number | undefined },
  ]

  return <nav aria-label="Primary workspace navigation" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 items-center border-t border-[#eef2f6] bg-[rgba(255,255,255,0.94)] px-2 pb-5 pt-2 backdrop-blur-[10px] md:hidden">
    {tabs.map((tab) => {
      const active = pathname === tab.href
        || pathname.startsWith(`${tab.href}/`)
        || (tab.label === "Account" && (pathname.startsWith(`${base}/settings`) || pathname.startsWith(`${base}/admin`)))
        || (tab.label === "Invoices" && (pathname.startsWith(`${base}/pipeline`) || pathname.startsWith(`${base}/documents`) || pathname.startsWith(`${base}/review`) || pathname.startsWith(`${base}/bills`)))
        || (tab.label === "Finance" && pathname.startsWith(`${base}/accounting`))
      // Same cap as the rail badge: three digits of "99+" reads; four digits of a real count does not.
      const badge = tab.badge == null ? null : tab.badge > 99 ? "99+" : String(tab.badge)
      return <Link key={tab.href} href={tab.href}
        aria-current={active ? "page" : undefined}
        className={`relative flex flex-col items-center gap-1 rounded-md p-1 text-[11px] outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 ${active ? "font-semibold text-emerald-700" : "font-medium text-slate-500"}`}>
        <tab.icon className="h-[21px] w-[21px]" />
        {tab.label}
        {/* After the label in the DOM so it is announced as "Invoices, 6 waiting"; positioned by the icon. */}
        {badge != null && <span className="absolute left-[calc(50%+8px)] top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-indigo-600 px-1 text-[10px] font-bold text-white tabular-nums"><span className="sr-only">, </span>{badge}<span className="sr-only"> waiting</span></span>}
      </Link>
    })}
  </nav>
}
