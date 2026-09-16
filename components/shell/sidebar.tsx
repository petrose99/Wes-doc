"use client"

import { AccountMenu } from "@/components/shell/account-menu"
import { KeyboardShortcuts, SHORTCUT_DESTINATIONS } from "@/components/shell/keyboard-shortcuts"

import { SwitchableWorkspace, WorkspaceSwitcher } from "@/components/workspace/switcher"
import { BiteMark } from "@/components/marketing/logo"
import { WorkspacePulse } from "@/components/shell/workspace-pulse"
import { MODULES } from "@/lib/modules"
import { isUnpluggedPath } from "@/lib/unplugged"
import { AlertTriangle, BadgeCheck, Banknote, CheckCircle2, ClipboardCheck, Files, HeartPulse, History, Landmark, Library, PanelLeftClose, PanelLeftOpen, Percent, Receipt, Settings, Wallet, Workflow, Zap } from "lucide-react"
import { adminPaths } from "@/lib/admin/paths"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"

const RAIL_PIN_KEY = "docubite.rail.pinned"
// #231 Q20 (#252): Admin collapses the rail exactly as a queue does — its own left nav needs the width.
const QUEUE_SEGMENTS = ["invoices", "purchase-orders", "receipts", "bank-statements", "exceptions", "payments", "approvals", "admin"]

/** Maps a ModuleDefinition.navItems[].icon string (lib/modules) to the lucide component it names.
 * A string in the registry rather than the component itself keeps lib/modules free of a React/UI
 * dependency — it's read by server code (capabilities, seeds) that has no business importing icons.
 * Settings-tagged module items (Rules, Tax) don't render here at all — they live inside Admin
 * (#252) — and unplugged surfaces (lib/unplugged) never render. */
const ICONS: Record<string, typeof Files> = {
  inbox: ClipboardCheck,
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
 * Four typed intake destinations sit in two peer pairs, followed by Exceptions, Payments, Finance
 * and Archive. Controls left the spine on #231 (#252): its pages are Admin's now. There is no Dashboard entry: the workspace home is the Invoices queue (#238), and
 * the logo goes there. The entries keep identical weight and badge treatment; a hairline break
 * separates the matching pair from the receipts/reconciliation pair without adding another
 * caption to the rail.
 *
 * On sheet-mode and document-detail pages the rail replaces its icon column with a
 * <WorkspacePulse /> card — a mini-map of the workspace's living state, three rows mirroring the
 * three primaries with the same badges. The workspace stays visibly alive inside those surfaces
 * instead of vanishing behind the door of a full-screen room. */
export function Sidebar({ workspaceId, workspaces, user, enabledModuleKeys, accountingEnabled = false, pipelineReviewCount = 0, reviewTaskCount = 0, financePushableCount = 0, openExceptionsCount = 0, batchesPendingApprovalCount = 0, approvalsReadyCount = 0 }: {
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
  /** counts.approved from countDocumentsByStage — documents past review, waiting to push to the
   * ledger. Only meaningful when accountingEnabled is true. */
  financePushableCount?: number
  /** #210: open+in_review escalated-check count — countOpenExceptions. */
  openExceptionsCount?: number
  /** #229 Q9 (#251): Payment batches waiting for an owner's decision — the Payments badge. */
  batchesPendingApprovalCount?: number
  /** #236: countReadyToApprove(workspaceId, currentUser) — the signed-in person's own
   * Ready-to-Approve count across BOTH Approvals queues, never the workspace-wide count. */
  approvalsReadyCount?: number
}) {
  void reviewTaskCount
  const pathname = usePathname()
  const base = `/workspaces/${workspaceId}`
  // #238: the workspace home is the Invoices queue; link there directly rather than through the
  // index route's redirect.
  const home = `${base}/invoices`

  // #225: on a Queue screen (and its `/<queue>/<id>` deep links, which render the same screen)
  // the rail collapses to a 56px icon rail so the queue gets the work area. It expands over the
  // content on hover or keyboard focus, and a pin toggle keeps it expanded; the pin is a
  // per-browser convenience, so it lives in localStorage rather than the workspace.
  const isQueue = QUEUE_SEGMENTS.some((segment) => pathname === `${base}/${segment}` || pathname.startsWith(`${base}/${segment}/`))
  const [pinned, setPinned] = useState(false)
  useEffect(() => {
    // Read after hydration (the server can't know the browser's pin), off the effect's own tick.
    const id = window.setTimeout(() => {
      try { setPinned(window.localStorage.getItem(RAIL_PIN_KEY) === "1") } catch { /* private mode: stay unpinned */ }
    }, 0)
    return () => window.clearTimeout(id)
  }, [])
  const togglePin = () => setPinned((current) => {
    const next = !current
    try { window.localStorage.setItem(RAIL_PIN_KEY, next ? "1" : "0") } catch { /* ignore */ }
    return next
  })
  const compact = isQueue && !pinned

  // Sheet and document-detail pages get the mini-map treatment. The rail keeps its full 236px
  // width — the pulse card + secondaries + bottom items need it — but its contents change: pulse
  // card in place of the main nav column. Users staying on any other page get the classic rail.
  // A typed deep link (`/invoices/<id>`) is a Queue screen since #225, not an immersive page.
  const isImmersive = !isQueue && (pathname.endsWith("/sheet") || pathname.includes("/documents/") || pathname.includes("/library/documents/"))
  const enabled = new Set(enabledModuleKeys)
  const moduleWorkItems = MODULES
    .filter((module) => enabled.has(module.key))
    .flatMap((module) => module.navItems ?? [])
    .filter((item) => !item.href.startsWith("settings/") && !item.href.startsWith("admin/") && item.href !== "health" && !isUnpluggedPath(`${base}/${item.href}`))
    .map((item) => ({ href: `${base}/${item.href}`, label: item.label, icon: ICONS[item.icon] ?? Files, exact: false }))

  // The review-queue module's "Review" item is dropped (#238): since #225 every queue is the
  // review surface, so a second entry for the same job was a second grammar. Controls
  // (`/automation`) is dropped too (#231 Q9, #252): its pages moved into Admin.
  const otherModuleItems = moduleWorkItems.filter((item) => item.href !== `${base}/review` && item.href !== `${base}/automation`)

  // Primary spine, in workflow order: the four typed intake destinations, then Exceptions
  // (escalated work needing attention, per #210 — organize: same tier as the typed destinations
  // by weight/badge treatment, not paired with any of them since it has no document-type sibling
  // and cuts across all four), then Controls (their governing levers), Finance (booked outcome),
  // and Archive (the permanent record everything lands in) closing the group.
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
  // #236: Approvals sits right after Exceptions (map's Notes: "after Exceptions, before
  // Worksheets" — Worksheets is unplugged per #237/#238, so Exceptions is the item it actually
  // lands beside). Its badge is the signed-in person's own Ready-to-Approve count, never the
  // workspace-wide total — see CONTEXT.md's "Ready to Approve".
  const approvalsItem = { href: `${base}/approvals/invoices`, label: "Approvals", icon: BadgeCheck, exact: false, badge: approvalsReadyCount > 0 ? approvalsReadyCount : undefined }
  // #229 Q9 (#251): one rail item, Payments, after Exceptions (after Approvals, #236); two queues behind it, Bill Pay and Payment Batches. Badge = the
  // batches pending approval — the one number that is somebody's work.
  const paymentsItem = { href: `${base}/payments/bill-pay`, label: "Payments", icon: Banknote, exact: false, badge: batchesPendingApprovalCount > 0 ? batchesPendingApprovalCount : undefined }
  const primaryItems = [
    exceptionsItem,
    approvalsItem,
    paymentsItem,
    ...(accountingEnabled ? [{ href: `${base}/finance`, label: "Finance", icon: Landmark, exact: false, badge: financePushableCount > 0 ? financePushableCount : undefined }] : []),
    // "Archive" is the accountant's own word for the permanent source-document record (Dext and
    // Hubdoc both name this surface Archive). Route stays /library — same label-over-URL stance
    // as Controls (/automation) and Finance's /accounting redirect.
    { href: `${base}/library`, label: "Archive", icon: Library, exact: false, tourTarget: "library" as const },
  ]

  // Secondary destinations: per-workspace module extras only. Under a hairline, no caption — the
  // divider is the sectioning.
  const secondaryItems = otherModuleItems

  // #231 Q9 (#252): one rail item, Admin, last — Settings and Controls fold into it.
  const bottomItems = [
    { href: `${base}/activity`, label: "Activity", icon: History, exact: false },
    { href: `${base}/health`, label: "Health Checks", icon: HeartPulse, exact: false },
    { href: adminPaths(workspaceId).configuration, label: "Admin", icon: Settings, exact: false },
  ]

  // Sum across primary badges tells us whether the TODAY label is a promise or a reward. When the
  // total is zero every primary is quiet, and the "you're caught up" line reads under the group
  // instead of a promise the badges are supposed to keep.
  const todayTotal = (pipelineReviewCount || 0) + (accountingEnabled ? (financePushableCount || 0) : 0) + (openExceptionsCount || 0) + (batchesPendingApprovalCount || 0) + (approvalsReadyCount || 0)

  const isActive = (item: { href: string; label: string; exact: boolean }) => item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`)
      || (item.label === "Admin" && (pathname.startsWith(`${base}/admin`) || pathname.startsWith(`${base}/settings`) || pathname.startsWith(`${base}/automation`)))
      // Ingestion and review are still reachable through the typed destinations. Keep the first
      // destination lit for those legacy/generic work surfaces until their queues are migrated.
      || (item.label === "Invoices" && (pathname.startsWith(`${base}/pipeline`) || pathname.startsWith(`${base}/documents`) || pathname.startsWith(`${base}/review`) || pathname.startsWith(`${base}/bills`)))
      || (item.label === "Invoices" && pathname.startsWith(`${base}/invoices`))
      || (item.label === "Purchase Orders" && pathname.startsWith(`${base}/purchase-orders`))
      || (item.label === "Receipts" && pathname.startsWith(`${base}/receipts`))
      || (item.label === "Bank Statements" && pathname.startsWith(`${base}/bank-statements`))
      || (item.label === "Payments" && pathname.startsWith(`${base}/payments`))
      || (item.label === "Approvals" && pathname.startsWith(`${base}/approvals`))
      // Finance keeps its rail lit on the legacy /accounting URL too, which redirects here.
      || (item.label === "Finance" && pathname.startsWith(`${base}/accounting`))

  // In the compact rail every label is hidden until the rail expands (hover / focus-within /
  // pin), and the link keeps a `title` so a hover over the icon alone still names it. The badge
  // stays visible in both widths — it is the promise the TODAY group makes — as a small count
  // pinned to the icon's corner while collapsed.
  const labelClass = compact ? "hidden group-hover/rail:inline group-focus-within/rail:inline" : ""
  // #262: collapsed-rail tooltip carries the `g` jump key beside the label (H6 recognition — the
  // dialog is the source of truth, this is a hint). Only the eight destinations the shortcut
  // listener actually registers get one.
  const SHORTCUT_KEY_BY_LABEL: Record<string, string> = { Invoices: "i", "Purchase Orders": "p", Receipts: "r", "Bank Statements": "b", Exceptions: "e", Approvals: "a", Payments: "y", Admin: "d" }
  const navLink = (item: { href: string; label: string; icon: typeof Files; exact: boolean; badge?: number; tourTarget?: string }) => {
    const active = isActive(item)
    const shortcutKey = SHORTCUT_KEY_BY_LABEL[item.label]
    const tooltip = compact ? (shortcutKey ? `${item.label} · g ${shortcutKey}` : item.label) : undefined
    return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} title={tooltip}
      {...(item.tourTarget ? { "data-tour-target": item.tourTarget } : {})}
      className={`relative flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${active ? "bg-white text-emerald-800 shadow-sm ring-1 ring-emerald-700/10" : "text-slate-600 hover:bg-slate-300/40 hover:text-slate-900"}`}>
      {active && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-emerald-700" />}
      <span className="relative shrink-0">
        <item.icon className="h-4 w-4" />
        {compact && item.badge != null && <span aria-hidden className="absolute -right-2 -top-1.5 flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-indigo-600 px-0.5 text-[10px] font-bold text-white tabular-nums group-hover/rail:hidden group-focus-within/rail:hidden">{item.badge > 99 ? "99+" : item.badge}</span>}
      </span>
      <span className={`truncate ${labelClass}`}>{item.label}</span>
      {item.badge != null && <span className={`ml-auto flex h-[19px] min-w-[19px] items-center justify-center rounded-full bg-indigo-600 px-1 text-[11px] font-bold text-white tabular-nums transition-[background-color] duration-200 ${labelClass}`}>{item.badge > 99 ? "99+" : item.badge}</span>}
      {compact && item.badge != null && <span className="sr-only">{item.badge} waiting</span>}
    </Link>
  }

  // TODAY caption. Muted uppercase, small — a promise the badges keep. When totalToday is 0 the
  // caption goes one step quieter and the "caught up" line under the group carries the meaning.
  const todayLabel = <div className={`mb-1 px-2.5 pt-1 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-600 ${compact ? "hidden group-hover/rail:block group-focus-within/rail:block" : ""}`}>Today</div>

  // Compact: the aside holds a 56px slot in the flow; the panel inside it widens over the
  // content on hover/focus so the queue never reflows while the operator glances at a label.
  return <aside className={`group/rail relative hidden shrink-0 md:flex ${compact ? "w-14" : "w-[236px]"}`}>
  <div className={`flex flex-col gap-0.5 border-r border-slate-200 bg-slate-100 py-3.5 transition-shadow duration-150 ease-out ${compact ? "absolute inset-y-0 left-0 z-30 w-14 overflow-hidden px-2 group-hover/rail:w-[236px] group-hover/rail:px-3 group-hover/rail:shadow-[8px_0_24px_-16px_rgba(15,23,42,0.35)] group-focus-within/rail:w-[236px] group-focus-within/rail:px-3 group-focus-within/rail:shadow-[8px_0_24px_-16px_rgba(15,23,42,0.35)]" : "w-full px-3"}`}>
    <Link href={home} className="flex items-center gap-2 px-1.5 py-1" aria-label="DocuBite home">
      <BiteMark className="h-7 w-7 shrink-0" />
      <span className={`truncate text-sm font-bold font-display text-slate-900 ${labelClass}`}>DocuBite</span>
    </Link>

    <div className={`mb-1 mt-2 ${compact ? "hidden group-hover/rail:block group-focus-within/rail:block" : ""}`}><WorkspaceSwitcher workspaces={workspaces} workspaceId={workspaceId} /></div>

    <nav className="mt-2 flex flex-1 flex-col" aria-label="Workspace">
      {isImmersive ? (
        // Immersive mode: the pulse card takes the primary column. Same three peers, but they
        // report status rather than list themselves — the destinations are still reachable, but
        // now they show a heartbeat too. Secondary items collapse to a small icon strip below the
        // pulse; bottom items stay in the same position on the rail.
        <WorkspacePulse
          workspaceId={workspaceId}
          documentsCount={pipelineReviewCount}
          financeCount={financePushableCount}
          accountingEnabled={accountingEnabled}
        />
      ) : (
        <>
          {todayLabel}
          <div className="space-y-1">
            {typedDestinationGroups.map((group, index) => (
              <div key={index} role="group" aria-label={index === 0 ? "Invoices and purchase orders" : "Receipts and bank statements"} className={index === 1 ? "border-t border-slate-200/80 pt-1" : "space-y-0.5"}>
                {group.map(navLink)}
              </div>
            ))}
            <div className="space-y-0.5">{primaryItems.map(navLink)}</div>
          </div>
          {todayTotal === 0 && <p className={`mt-1 px-2.5 text-[11px] font-medium text-slate-500 ${compact ? "hidden group-hover/rail:block group-focus-within/rail:block" : ""}`}>You&apos;re caught up.</p>}
        </>
      )}

      {secondaryItems.length > 0 && <>
        <div className="my-3 border-t border-slate-200/80" aria-hidden="true" />
        <div className="space-y-0.5">{secondaryItems.map(navLink)}</div>
      </>}

      <div className="mt-auto space-y-0.5">
        {bottomItems.map(navLink)}
        {isQueue && <button type="button" onClick={togglePin} aria-pressed={pinned} title={pinned ? "Collapse the rail" : "Keep the rail open"}
          className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-300/40 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600">
          {pinned ? <PanelLeftClose className="h-4 w-4 shrink-0" /> : <PanelLeftOpen className="h-4 w-4 shrink-0" />}
          <span className={`truncate ${labelClass}`}>{pinned ? "Collapse rail" : "Keep rail open"}</span>
        </button>}
      </div>
    </nav>

    <div className="mt-auto pt-3">
      <AccountMenu name={user.name} email={user.email} collapsed={compact} workspaceId={workspaceId} />
    </div>
  </div>
  <KeyboardShortcuts destinations={SHORTCUT_DESTINATIONS(workspaceId, adminPaths(workspaceId).configuration)} />
  </aside>
}
