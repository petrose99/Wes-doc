"use client"

import { AccountMenu } from "@/components/shell/account-menu"

import { SwitchableWorkspace, WorkspaceSwitcher } from "@/components/workspace/switcher"
import { BiteMark } from "@/components/marketing/logo"
import { MODULES } from "@/lib/modules"
import { BarChart3, CheckCircle2, ClipboardCheck, Files, HeartPulse, History, Landmark, Library, ListChecks, Mic, Percent, Receipt, Settings, Table2, Wallet, Workflow, Zap } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

/** Maps a ModuleDefinition.navItems[].icon string (lib/modules) to the lucide component it names.
 * A string in the registry rather than the component itself keeps lib/modules free of a React/UI
 * dependency — it's read by server code (capabilities, seeds) that has no business importing icons.
 * Settings-tagged module items (Rules, Tax, Approvals) don't render here at all — they show up in
 * components/shell/settings-nav.tsx instead. */
const ICONS: Record<string, typeof Files> = {
  inbox: ClipboardCheck,
  mic: Mic,
  "heart-pulse": HeartPulse,
  zap: Zap,
  "check-circle": CheckCircle2,
  workflow: Workflow,
  percent: Percent,
  receipt: Receipt,
  wallet: Wallet,
}

/** The workspace rail. One flat spine of destinations — no section labels — with three peer
 * primaries (Documents, Worksheets, Finance) that all read as first-class work surfaces, then a
 * hairline divider before secondary destinations (Docu Search, per-workspace module items).
 *
 * Why no "Tools" section any more: captioning a group "Tools" over Worksheets and Finance told users
 * those surfaces were optional. Worksheets and Finance are both core — Worksheets extracts value
 * from documents (=AI(), the assistant, formulas over real invoice rows) and Finance is the ledger
 * the whole product feeds. Hierarchy carries weight; a category label just contradicts it.
 *
 * Why the rail no longer vanishes inside a sheet or a document detail: the surface where the most
 * work happens should stay embedded in the product, not become a full-screen mode with no way back.
 * On those pages the rail collapses to an icon-only strip (52px) instead of returning null. */
export function Sidebar({ workspaceId, workspaces, user, enabledModuleKeys, accountingEnabled = false, pipelineReviewCount = 0, reviewTaskCount = 0, sheetsUnplacedCount = 0 }: {
  workspaceId: string
  workspaces: SwitchableWorkspace[]
  user: { name: string; email: string }
  /** Every module key currently enabled for this workspace (getWorkspaceCapabilities(...).enabled),
   * used to build the nav entries each module registers via ModuleDefinition.navItems. */
  enabledModuleKeys: string[]
  /** config.integrations.bigcapital.enabled — a deployment-level gate for whether Finance is a
   * live destination on this rail. */
  accountingEnabled?: boolean
  /** counts.to_review from countDocumentsByStage — surfaced on Documents so "something needs you"
   * is visible from every page. */
  pipelineReviewCount?: number
  /** countOpenReviewTasks — retained on the prop signature for API stability; not surfaced as its
   * own rail badge, since pipelineReviewCount already carries that signal on Documents. */
  reviewTaskCount?: number
  /** countReviewedUnplaced — documents extracted and ready to land in a sheet. Surfaced on the
   * Worksheets rail entry as the parallel of pipelineReviewCount, so the app points *at* Worksheets from
   * every page and treats it as a destination the rest of the product promotes. */
  sheetsUnplacedCount?: number
}) {
  void reviewTaskCount
  const pathname = usePathname()

  // The rail used to `return null` on sheet and document detail pages; that stripped every
  // destination the moment a user was doing the most work, and made Worksheets feel bolted on.
  // Collapse instead: a 52px icon-only strip that keeps the workspace embedded in the product
  // without stealing 236px from the grid.
  const isCompact = pathname.endsWith("/sheet") || pathname.includes("/documents/")

  const base = `/workspaces/${workspaceId}`
  const enabled = new Set(enabledModuleKeys)
  const moduleWorkItems = MODULES
    .filter((module) => enabled.has(module.key))
    .flatMap((module) => module.navItems ?? [])
    .filter((item) => !item.href.startsWith("settings/") && item.href !== "expenses" && item.href !== "dictation" && item.href !== "health")
    .map((item) => ({ href: `${base}/${item.href}`, label: item.label, icon: ICONS[item.icon] ?? Files, exact: false }))

  const otherModuleItems = moduleWorkItems.filter((item) => item.href !== `${base}/review`)

  // Primary spine: three peer destinations plus the workspace overview. Documents (collect + review),
  // Worksheets (structure + extract), Finance (book + reconcile). Any one of them is where a person
  // could spend a whole day; the rail should treat them as such. Finance is gated on the deployment
  // having the ledger integration configured, but it lives *in* the primary group when it does.
  const primaryItems = [
    { href: base, label: "Dashboard", icon: BarChart3, exact: true },
    { href: `${base}/pipeline`, label: "Documents", icon: ListChecks, exact: false, badge: pipelineReviewCount > 0 ? pipelineReviewCount : undefined, tourTarget: "extraction" as const },
    { href: `${base}/worksheets`, label: "Worksheets", icon: Table2, exact: false, badge: sheetsUnplacedCount > 0 ? sheetsUnplacedCount : undefined, tourTarget: "sheets" as const },
    ...(accountingEnabled ? [{ href: `${base}/finance`, label: "Finance", icon: Landmark, exact: false }] : []),
  ]

  // Secondary: destinations the app has, but that are not "where the work is." Docu Search is a
  // lookup surface; module items come and go per workspace. Under a hairline, no label — the
  // divider is doing the sectioning that "Tools" used to.
  const secondaryItems = [
    { href: `${base}/library`, label: "Docu Search", icon: Library, exact: false, tourTarget: "library" as const },
    ...otherModuleItems,
  ]

  const bottomItems = [
    { href: `${base}/settings/workspace`, label: "Settings", icon: Settings, exact: false },
    { href: `${base}/activity`, label: "Activity", icon: History, exact: false },
    { href: `${base}/health`, label: "Health Checks", icon: HeartPulse, exact: false },
  ]

  const isActive = (item: { href: string; label: string; exact: boolean }) => item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`)
      || (item.label === "Settings" && pathname.startsWith(`${base}/settings`))
      // Documents stays lit across the whole document lifecycle — pipeline, individual docs,
      // review, bills — so the rail always tells the user which spine surface they are on.
      || (item.label === "Documents" && (pathname.startsWith(`${base}/pipeline`) || pathname.startsWith(`${base}/documents`) || pathname.startsWith(`${base}/review`) || pathname.startsWith(`${base}/bills`)))
      // Worksheets stays lit across the whole surface — index, file hub, and the grid page — and
      // also on the legacy /files URLs, which redirect here so old bookmarks keep working.
      || (item.label === "Worksheets" && (pathname.startsWith(`${base}/worksheets`) || pathname.startsWith(`${base}/files`)))
      // Finance keeps its rail lit on the legacy /accounting URL too, which redirects here.
      || (item.label === "Finance" && pathname.startsWith(`${base}/accounting`))

  const navLink = (item: { href: string; label: string; icon: typeof Files; exact: boolean; badge?: number; tourTarget?: string }) => {
    const active = isActive(item)
    if (isCompact) {
      // Icon-only strip. Same active treatment as the expanded rail so the location signal is
      // identical, just without the label column. Title attribute carries the label for hover
      // discoverability; aria-label carries it for screen readers.
      return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}
        aria-label={item.label} title={item.label}
        {...(item.tourTarget ? { "data-tour-target": item.tourTarget } : {})}
        className={`relative mx-auto flex h-9 w-9 items-center justify-center rounded-md transition-colors ${active ? "bg-white text-emerald-800 shadow-sm ring-1 ring-emerald-700/10" : "text-slate-500 hover:bg-slate-300/40 hover:text-slate-900"}`}>
        {active && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-emerald-700" />}
        <item.icon className="h-[17px] w-[17px] shrink-0" />
        {item.badge != null && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-indigo-600 px-1 text-[10px] font-bold text-white">{item.badge}</span>}
      </Link>
    }
    return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}
      {...(item.tourTarget ? { "data-tour-target": item.tourTarget } : {})}
      className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${active ? "relative bg-white text-emerald-800 shadow-sm ring-1 ring-emerald-700/10" : "text-slate-600 hover:bg-slate-300/40 hover:text-slate-900"}`}>
      {active && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-emerald-700" />}
      <item.icon className="h-4 w-4 shrink-0" />{item.label}
      {item.badge != null && <span className="ml-auto flex h-[19px] min-w-[19px] items-center justify-center rounded-full bg-indigo-600 px-1 text-[11px] font-bold text-white">{item.badge}</span>}
    </Link>
  }

  const railWidth = isCompact ? "w-[52px]" : "w-[236px]"
  const railPadding = isCompact ? "px-1.5 py-3.5" : "px-3 py-3.5"

  return <aside className={`hidden ${railWidth} shrink-0 flex-col gap-0.5 border-r border-slate-200 bg-slate-100 ${railPadding} md:flex`}>
    <Link href={base} className={`flex items-center gap-2 py-1 ${isCompact ? "justify-center px-0" : "px-1.5"}`} aria-label="DocuBite home">
      <BiteMark className="h-7 w-7 shrink-0" />
      {!isCompact && <span className="truncate text-sm font-bold font-display text-slate-900">DocuBite</span>}
    </Link>

    {!isCompact && <div className="mb-1 mt-2"><WorkspaceSwitcher workspaces={workspaces} workspaceId={workspaceId} /></div>}

    <nav className={`flex flex-1 flex-col ${isCompact ? "mt-3 items-center" : "mt-2"}`}>
      <div className={`w-full space-y-0.5 ${isCompact ? "flex flex-col items-center" : ""}`}>{primaryItems.map(navLink)}</div>

      {secondaryItems.length > 0 && <>
        <div className={`my-2 border-t border-slate-200/80 ${isCompact ? "mx-2 w-8" : ""}`} aria-hidden="true" />
        <div className={`w-full space-y-0.5 ${isCompact ? "flex flex-col items-center" : ""}`}>{secondaryItems.map(navLink)}</div>
      </>}

      <div className={`mt-auto w-full space-y-0.5 ${isCompact ? "flex flex-col items-center" : ""}`}>{bottomItems.map(navLink)}</div>
    </nav>

    {!isCompact && <div className="mt-auto pt-3">
      <AccountMenu name={user.name} email={user.email} />
    </div>}
  </aside>
}
