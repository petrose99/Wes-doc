"use client"

import { AccountMenu } from "@/components/shell/account-menu"

import { SwitchableWorkspace, WorkspaceSwitcher } from "@/components/workspace/switcher"
import { BiteMark } from "@/components/marketing/logo"
import { WorkspacePulse } from "@/components/shell/workspace-pulse"
import { MODULES } from "@/lib/modules"
import { TYPED_DESTINATIONS } from "@/lib/typed-destinations"
import { AlertTriangle, BarChart3, CheckCircle2, ClipboardCheck, Files, HeartPulse, History, Landmark, Library, Mic, Percent, Receipt, Settings, Table2, Wallet, Workflow, Zap } from "lucide-react"
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

/** The workspace rail — a flat spine of destinations, no section captions. The primary group is
 * labelled `TODAY` (a verb-flavoured intent label, not a container word); its badge counts are the
 * promise the label keeps. When every primary is quiet the label drops one notch and a "you're
 * caught up" line takes over, so an empty rail reads as a win rather than a vacuum.
 *
 * Four typed intake destinations sit in two peer pairs, followed by Worksheets and Finance. The
 * entries keep identical weight and badge treatment; a hairline break separates the matching pair
 * from the receipts/reconciliation pair without adding another caption to the rail.
 *
 * On sheet-mode and document-detail pages the rail replaces its icon column with a
 * <WorkspacePulse /> card — a mini-map of the workspace's living state, three rows mirroring the
 * three primaries with the same badges. The workspace stays visibly alive inside those surfaces
 * instead of vanishing behind the door of a full-screen room. */
export function Sidebar({ workspaceId, workspaces, user, enabledModuleKeys, accountingEnabled = false, pipelineReviewCount = 0, reviewTaskCount = 0, sheetsUnplacedCount = 0, financePushableCount = 0, openExceptionsCount = 0 }: {
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
   * own rail badge, since pipelineReviewCount already carries that signal on Invoices. */
  reviewTaskCount?: number
  /** countReviewedUnplaced — documents extracted and ready to land in a worksheet. Surfaced on the
   * Worksheets rail entry as the parallel of pipelineReviewCount, so the app points *at* Worksheets
   * from every page. */
  sheetsUnplacedCount?: number
  /** counts.approved from countDocumentsByStage — documents past review, waiting to push to the
   * ledger. Only meaningful when accountingEnabled is true. */
  financePushableCount?: number
  /** #210: open+in_review escalated-check count — countOpenExceptions. */
  openExceptionsCount?: number
}) {
  void reviewTaskCount
  const pathname = usePathname()

  // Sheet and document-detail pages get the mini-map treatment. The rail keeps its full 236px
  // width — the pulse card + secondaries + bottom items need it — but its contents change: pulse
  // card in place of the main nav column. Users staying on any other page get the classic rail.
  const isTypedDocumentDetail = TYPED_DESTINATIONS.some(({ segment }) => pathname.includes(`/${segment}/`))
  const isImmersive = pathname.endsWith("/sheet") || pathname.includes("/documents/") || pathname.includes("/library/documents/") || isTypedDocumentDetail

  const base = `/workspaces/${workspaceId}`
  const enabled = new Set(enabledModuleKeys)
  const moduleWorkItems = MODULES
    .filter((module) => enabled.has(module.key))
    .flatMap((module) => module.navItems ?? [])
    .filter((item) => !item.href.startsWith("settings/") && item.href !== "expenses" && item.href !== "dictation" && item.href !== "health")
    .map((item) => ({ href: `${base}/${item.href}`, label: item.label, icon: ICONS[item.icon] ?? Files, exact: false }))

  // Controls (the touchless-automation module's nav item) is hoisted out of the module bucket
  // into the primary spine, directly under the typed intake group: it is the levers that govern the document
  // pipeline, so adjacency to the pipeline it controls is the information architecture.
  const controlsItem = moduleWorkItems.find((item) => item.href === `${base}/automation`)
  const otherModuleItems = moduleWorkItems.filter((item) => item.href !== `${base}/review` && item.href !== `${base}/automation`)

  // Primary spine, in workflow order: the four typed intake destinations, then Exceptions
  // (escalated work needing attention, per #210 — organize: same tier as the typed destinations
  // by weight/badge treatment, not paired with any of them since it has no document-type sibling
  // and cuts across all four), then Controls (their governing levers), Finance (booked outcome),
  // Archive (the permanent record everything lands in), and Worksheets (compute over any of it)
  // closing the group.
  const dashboardItem = { href: base, label: "Dashboard", icon: BarChart3, exact: true, badge: undefined as number | undefined }
  const typedDestinationGroups = [
    [
      { href: `${base}/invoices`, label: "Invoices", icon: Receipt, exact: false },
      { href: `${base}/purchase-orders`, label: "Purchase Orders", icon: ClipboardCheck, exact: false },
    ],
    [
      { href: `${base}/receipts`, label: "Receipts", icon: Receipt, exact: false },
      { href: `${base}/bank-statements`, label: "Bank Statements", icon: Landmark, exact: false },
    ],
  ]
  const exceptionsItem = { href: `${base}/exceptions`, label: "Exceptions", icon: AlertTriangle, exact: false, badge: openExceptionsCount > 0 ? openExceptionsCount : undefined }
  const primaryItems = [
    exceptionsItem,
    ...(controlsItem ? [controlsItem] : []),
    ...(accountingEnabled ? [{ href: `${base}/finance`, label: "Finance", icon: Landmark, exact: false, badge: financePushableCount > 0 ? financePushableCount : undefined }] : []),
    // "Archive" is the accountant's own word for the permanent source-document record (Dext and
    // Hubdoc both name this surface Archive). Route stays /library — same label-over-URL stance
    // as Controls (/automation) and Finance's /accounting redirect.
    { href: `${base}/library`, label: "Archive", icon: Library, exact: false, tourTarget: "library" as const },
    { href: `${base}/worksheets`, label: "Worksheets", icon: Table2, exact: false, badge: sheetsUnplacedCount > 0 ? sheetsUnplacedCount : undefined, tourTarget: "sheets" as const },
  ]

  // Secondary destinations: per-workspace module extras only. Under a hairline, no caption — the
  // divider is the sectioning.
  const secondaryItems = otherModuleItems

  const bottomItems = [
    { href: `${base}/settings/workspace`, label: "Settings", icon: Settings, exact: false },
    { href: `${base}/activity`, label: "Activity", icon: History, exact: false },
    { href: `${base}/health`, label: "Health Checks", icon: HeartPulse, exact: false },
  ]

  // Sum across primary badges tells us whether the TODAY label is a promise or a reward. When the
  // total is zero every primary is quiet, and the "you're caught up" line reads under the group
  // instead of a promise the badges are supposed to keep.
  const todayTotal = (pipelineReviewCount || 0) + (sheetsUnplacedCount || 0) + (accountingEnabled ? (financePushableCount || 0) : 0) + (openExceptionsCount || 0)

  const isActive = (item: { href: string; label: string; exact: boolean }) => item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`)
      || (item.label === "Settings" && pathname.startsWith(`${base}/settings`))
      // Ingestion and review are still reachable through the typed destinations. Keep the first
      // destination lit for those legacy/generic work surfaces until their queues are migrated.
      || (item.label === "Invoices" && (pathname.startsWith(`${base}/pipeline`) || pathname.startsWith(`${base}/documents`) || pathname.startsWith(`${base}/review`) || pathname.startsWith(`${base}/bills`)))
      || (item.label === "Invoices" && pathname.startsWith(`${base}/invoices`))
      || (item.label === "Purchase Orders" && pathname.startsWith(`${base}/purchase-orders`))
      || (item.label === "Receipts" && (pathname.startsWith(`${base}/receipts`) || pathname.startsWith(`${base}/expenses`)))
      || (item.label === "Bank Statements" && pathname.startsWith(`${base}/bank-statements`))
      // Worksheets stays lit across its surface (index, file hub, grid) and on the legacy /files
      // URLs that redirect here so old bookmarks keep working.
      || (item.label === "Worksheets" && (pathname.startsWith(`${base}/worksheets`) || pathname.startsWith(`${base}/files`)))
      // Finance keeps its rail lit on the legacy /accounting URL too, which redirects here.
      || (item.label === "Finance" && pathname.startsWith(`${base}/accounting`))

  const navLink = (item: { href: string; label: string; icon: typeof Files; exact: boolean; badge?: number; tourTarget?: string }) => {
    const active = isActive(item)
    return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}
      {...(item.tourTarget ? { "data-tour-target": item.tourTarget } : {})}
      className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${active ? "relative bg-white text-emerald-800 shadow-sm ring-1 ring-emerald-700/10" : "text-slate-600 hover:bg-slate-300/40 hover:text-slate-900"}`}>
      {active && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-emerald-700" />}
      <item.icon className="h-4 w-4 shrink-0" />{item.label}
      {item.badge != null && <span className="ml-auto flex h-[19px] min-w-[19px] items-center justify-center rounded-full bg-indigo-600 px-1 text-[11px] font-bold text-white tabular-nums transition-[background-color] duration-200">{item.badge > 99 ? "99+" : item.badge}</span>}
    </Link>
  }

  // TODAY caption. Muted uppercase, small — a promise the badges keep. When totalToday is 0 the
  // caption goes one step quieter and the "caught up" line under the group carries the meaning.
  const todayLabel = <div className="mb-1 px-2.5 pt-1 text-[10.5px] font-bold uppercase tracking-[0.08em] text-slate-400">Today</div>

  return <aside className="hidden w-[236px] shrink-0 flex-col gap-0.5 border-r border-slate-200 bg-slate-100 px-3 py-3.5 md:flex">
    <Link href={base} className="flex items-center gap-2 px-1.5 py-1" aria-label="DocuBite home">
      <BiteMark className="h-7 w-7 shrink-0" />
      <span className="truncate text-sm font-bold font-display text-slate-900">DocuBite</span>
    </Link>

    <div className="mb-1 mt-2"><WorkspaceSwitcher workspaces={workspaces} workspaceId={workspaceId} /></div>

    <nav className="mt-2 flex flex-1 flex-col">
      {isImmersive ? (
        // Immersive mode: the pulse card takes the primary column. Same three peers, but they
        // report status rather than list themselves — the destinations are still reachable, but
        // now they show a heartbeat too. Secondary items collapse to a small icon strip below the
        // pulse; bottom items stay in the same position on the rail.
        <WorkspacePulse
          workspaceId={workspaceId}
          documentsCount={pipelineReviewCount}
          worksheetsCount={sheetsUnplacedCount}
          financeCount={financePushableCount}
          accountingEnabled={accountingEnabled}
        />
      ) : (
        <>
          {todayLabel}
          <div className="space-y-1">
            {navLink(dashboardItem)}
            {typedDestinationGroups.map((group, index) => (
              <div key={index} role="group" aria-label={index === 0 ? "Invoices and purchase orders" : "Receipts and bank statements"} className={index === 1 ? "border-t border-slate-200/80 pt-1" : "space-y-0.5"}>
                {group.map(navLink)}
              </div>
            ))}
            <div className="space-y-0.5">{primaryItems.map(navLink)}</div>
          </div>
          {todayTotal === 0 && <p className="mt-1 px-2.5 text-[11px] font-medium text-slate-400">You&apos;re caught up.</p>}
        </>
      )}

      {secondaryItems.length > 0 && <>
        <div className="my-3 border-t border-slate-200/80" aria-hidden="true" />
        <div className="space-y-0.5">{secondaryItems.map(navLink)}</div>
      </>}

      <div className="mt-auto space-y-0.5">{bottomItems.map(navLink)}</div>
    </nav>

    <div className="mt-auto pt-3">
      <AccountMenu name={user.name} email={user.email} />
    </div>
  </aside>
}
