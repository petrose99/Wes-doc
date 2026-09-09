"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

export type AutomationTab = "metrics" | "review" | "vendors" | "matches" | "settings"

export function AutomationTabs({ workspaceId, active, reviewCount, reviewEnabled }: {
  workspaceId: string
  active?: AutomationTab
  reviewCount: number
  reviewEnabled: boolean
}) {
  const pathname = usePathname()
  const base = `/workspaces/${workspaceId}`
  const current: AutomationTab = active ?? (
    pathname.includes("/automation/vendors") ? "vendors"
    : pathname.includes("/automation/matches") ? "matches"
    : pathname.includes("/automation/settings") ? "settings"
    : pathname.includes("/review") ? "review"
    : "metrics"
  )

  const tabClass = (isActive: boolean) => `border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${isActive ? "border-emerald-700 text-emerald-800" : "border-transparent text-slate-500 hover:text-slate-800"}`

  return <nav className="flex gap-1 border-b border-[#e6ebf1]">
    <Link href={`${base}/automation`} className={tabClass(current === "metrics")}>Metrics</Link>
    {reviewEnabled && <Link href={`${base}/review`} className={`${tabClass(current === "review")} inline-flex items-center gap-2`}>
      Review queue
      {reviewCount > 0 && <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-100 px-1.5 text-[11px] font-semibold text-amber-800">{reviewCount}</span>}
    </Link>}
    <Link href={`${base}/automation/vendors`} className={tabClass(current === "vendors")}>Vendors</Link>
    <Link href={`${base}/automation/matches`} className={tabClass(current === "matches")}>Matches</Link>
    <Link href={`${base}/automation/settings`} className={tabClass(current === "settings")}>Settings</Link>
  </nav>
}
