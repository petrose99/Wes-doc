"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

export type AutomationTab = "metrics" | "review" | "vendors" | "matches" | "approvals" | "settings"

export function AutomationTabs({ workspaceId, active, reviewCount, reviewEnabled, showSettings = true }: {
  workspaceId: string
  active?: AutomationTab
  reviewCount: number
  reviewEnabled: boolean
  /** The Settings tab 404s for non-owners (owner-only page) — false hides the link rather than
   * leaving a door that slams. Defaults true so every existing caller keeps its prior behavior;
   * pages gated to owners-only pass the membership check through explicitly. */
  showSettings?: boolean
}) {
  const pathname = usePathname()
  const base = `/workspaces/${workspaceId}`
  const current: AutomationTab = active ?? (
    pathname.includes("/automation/vendors") ? "vendors"
    : pathname.includes("/automation/matches") ? "matches"
    : pathname.includes("/automation/approvals") ? "approvals"
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

  // The Review-queue tab used to also live here; it's been dropped because Review is a stage on
  // the Documents lifecycle now, not an Automation surface. `reviewCount` and `reviewEnabled`
  // stay on the prop signature so the pages calling AutomationTabs don't have to change.
  void reviewCount; void reviewEnabled

  return <nav className="flex flex-wrap border-b border-[#e6ebf1]" aria-label="Controls">
    <Link href={`${base}/automation`} aria-current={current === "metrics" ? "page" : undefined} className={tabClass(current === "metrics")}>Overview</Link>
    <Link href={`${base}/automation/vendors`} aria-current={current === "vendors" ? "page" : undefined} className={tabClass(current === "vendors")}>Vendors</Link>
    <Link href={`${base}/automation/matches`} aria-current={current === "matches" ? "page" : undefined} className={tabClass(current === "matches")}>Matches</Link>
    <Link href={`${base}/automation/approvals`} aria-current={current === "approvals" ? "page" : undefined} className={tabClass(current === "approvals")}>Approval workflows</Link>
    {showSettings && <Link href={`${base}/automation/settings`} aria-current={current === "settings" ? "page" : undefined} className={tabClass(current === "settings")}>Settings</Link>}
  </nav>
}
