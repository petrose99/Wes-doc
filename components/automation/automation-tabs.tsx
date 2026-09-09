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

  // The active tab sits on the rule rather than under it: the underline is the same hairline the
  // rest of the section is ruled with, thickened and inked where you are.
  const tabClass = (isActive: boolean) =>
    `-mb-px border-b-2 pb-2.5 pr-7 text-sm transition-colors ${
      isActive
        ? "border-emerald-700 font-semibold text-slate-900"
        : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-900"
    }`

  return <nav className="flex flex-wrap border-b border-[#e6ebf1]">
    <Link href={`${base}/automation`} className={tabClass(current === "metrics")}>Overview</Link>
    {reviewEnabled && <Link href={`${base}/review`} className={`${tabClass(current === "review")} inline-flex items-center gap-2`}>
      Review queue
      {reviewCount > 0 && <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-amber-100 px-1 text-[11px] font-semibold tabular-nums text-amber-800">{reviewCount}</span>}
    </Link>}
    <Link href={`${base}/automation/vendors`} className={tabClass(current === "vendors")}>Vendors</Link>
    <Link href={`${base}/automation/matches`} className={tabClass(current === "matches")}>Matches</Link>
    <Link href={`${base}/automation/settings`} className={tabClass(current === "settings")}>Settings</Link>
  </nav>
}
