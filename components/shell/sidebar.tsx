"use client"

import { AccountMenu } from "@/components/shell/account-menu"
import { ApprovalEmailsDialog } from "@/components/shell/approval-emails"
import type { RailWidth } from "@/components/shell/rail-width-control"
import { KeyboardShortcuts, SHORTCUT_DESTINATIONS } from "@/components/shell/keyboard-shortcuts"
import { HowItWorksDialog } from "@/components/shell/how-it-works"

import { SwitchableWorkspace, WorkspaceSwitcher } from "@/components/workspace/switcher"
import { BiteMark } from "@/components/marketing/logo"
import { WorkspacePulse } from "@/components/shell/workspace-pulse"
import { MODULES } from "@/lib/modules"
import { isUnpluggedPath } from "@/lib/unplugged"
import { AlertTriangle, BadgeCheck, Banknote, CheckCircle2, ClipboardCheck, Files, HeartPulse, Landmark, Library, Percent, Receipt, Search, Settings, Wallet, Workflow, Zap } from "lucide-react"
import { adminPaths } from "@/lib/admin/paths"
import Link from "next/link"
import { usePathname } from "next/navigation"

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
 * Four typed intake destinations sit in two peer pairs, followed by Exceptions, Approvals,
 * Payments and Accounting (#342 §2, reversing #282's "no rail item" clause — routes into #329's
 * connector picker inside Admin › Integrations). Archive and Admin sit in the bottom group
 * (#342 §1: Archive is the permanent record, not today's work). Controls left the spine on #231
 * (#252): its pages are Admin's now. There is no Dashboard entry: the workspace home is the Invoices queue (#238), and
 * the logo goes there. The entries keep identical weight and badge treatment; a hairline break
 * separates the matching pair from the receipts/reconciliation pair without adding another
 * caption to the rail.
 *
 * On sheet-mode and document-detail pages the rail replaces its icon column with a
 * <WorkspacePulse /> card — a mini-map of the workspace's living state, three rows mirroring the
 * three primaries with the same badges. The workspace stays visibly alive inside those surfaces
 * instead of vanishing behind the door of a full-screen room. */
export function Sidebar({ workspaceId, workspaces, user, enabledModuleKeys, accountingEnabled = false, pipelineReviewCount = 0, reviewTaskCount = 0, financePushableCount = 0, openExceptionsCount = 0, batchesPendingApprovalCount = 0, approvalsReadyCount = 0, inboundAddress = null }: {
  workspaceId: string
  workspaces: SwitchableWorkspace[]
  user: { name: string; email: string; approvalEmails?: boolean; /** #342: server-persisted, replaces the old localStorage pin. */ railWidth?: RailWidth }
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
  /** #266 step 2b: null when inboundEmail.enabled is false or the token couldn't be minted —
   * threaded to HowItWorksDialog's phone-reachable rediscovery line. */
  inboundAddress?: string | null
}) {
  void reviewTaskCount
  const pathname = usePathname()
  const base = `/workspaces/${workspaceId}`
  // #238: the workspace home is the Invoices queue; link there directly rather than through the
  // index route's redirect.
  const home = `${base}/invoices`

  // #225: on a Queue screen (and its `/<queue>/<id>` deep links, which render the same screen)
  // the rail collapses to a 56px icon rail so the queue gets the work area. It expands over the
  // content on hover or keyboard focus. #342 spec §4 replaces the old localStorage pin with a
  // server-persisted three-state control (Icons only / Full labels / Auto), reachable from
  // Account and the account-menu, not gated on isQueue:
  //   - "icons"  → always collapsed, never expands (even on hover) — expandsOnHover = false.
  //   - "labels" → always expanded — compact = false, everywhere.
  //   - "auto" (default) → today's behavior: collapses only on a Queue page, expands on hover.
  const isQueue = QUEUE_SEGMENTS.some((segment) => pathname === `${base}/${segment}` || pathname.startsWith(`${base}/${segment}/`))
  const railWidth = user.railWidth ?? "auto"
  const compact = railWidth === "icons" || (railWidth === "auto" && isQueue)
  const expandsOnHover = railWidth !== "icons"

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
    .map((item) => ({ href: `${base}/${item.href}`, label: item.label, icon: ICONS[item.icon] ?? Files, matchPrefixes: [`${base}/${item.href}`] }))

  // The review-queue module's "Review" item is dropped (#238): since #225 every queue is the
  // review surface, so a second entry for the same job was a second grammar. Controls
  // (`/automation`) is dropped too (#231 Q9, #252): its pages moved into Admin.
  const otherModuleItems = moduleWorkItems.filter((item) => item.href !== `${base}/review` && item.href !== `${base}/automation`)

  // Primary spine, in workflow order: the four typed intake destinations, then Exceptions
  // (escalated work needing attention, per #210 — organize: same tier as the typed destinations
  // by weight/badge treatment, not paired with any of them since it has no document-type sibling
  // and cuts across all four), then Controls (their governing levers), Finance (booked outcome),
  // and Archive (the permanent record everything lands in) closing the group.
  // #270: Search sits above the typed group — its own predicate spans every document, typed or
  // not, so it isn't paired with either pair below it. `/` is its own shortcut (#262); no `g`
  // letter is reserved for it.
  const searchItem = { href: `${base}/search`, label: "Search", icon: Search, matchPrefixes: [`${base}/search`] }
  const typedDestinationGroups = [
    [
      // #342 §5: Invoices also lights up on the legacy/generic work surfaces it still stands in
      // for (Ingestion/review) until their queues are migrated.
      { href: `${base}/invoices`, label: "Invoices", icon: Receipt, matchPrefixes: [`${base}/invoices`, `${base}/pipeline`, `${base}/documents`, `${base}/review`, `${base}/bills`] },
      { href: `${base}/purchase-orders`, label: "Purchase Orders", icon: ClipboardCheck, matchPrefixes: [`${base}/purchase-orders`] },
    ],
    [
      { href: `${base}/receipts`, label: "Receipts", icon: Receipt, matchPrefixes: [`${base}/receipts`] },
      { href: `${base}/bank-statements`, label: "Bank Statements", icon: Landmark, matchPrefixes: [`${base}/bank-statements`] },
    ],
  ]
  const exceptionsItem = { href: `${base}/exceptions`, label: "Exceptions", icon: AlertTriangle, matchPrefixes: [`${base}/exceptions`], badge: openExceptionsCount > 0 ? openExceptionsCount : undefined }
  // #236: Approvals sits right after Exceptions (map's Notes: "after Exceptions, before
  // Worksheets" — Worksheets is unplugged per #237/#238, so Exceptions is the item it actually
  // lands beside). Its badge is the signed-in person's own Ready-to-Approve count, never the
  // workspace-wide total — see CONTEXT.md's "Ready to Approve".
  const approvalsItem = { href: `${base}/approvals/invoices`, label: "Approvals", icon: BadgeCheck, matchPrefixes: [`${base}/approvals`], badge: approvalsReadyCount > 0 ? approvalsReadyCount : undefined }
  // #229 Q9 (#251): one rail item, Payments, after Exceptions (after Approvals, #236); two queues behind it, Bill Pay and Payment Batches. Badge = the
  // batches pending approval — the one number that is somebody's work.
  const paymentsItem = { href: `${base}/payments/bill-pay`, label: "Payments", icon: Banknote, matchPrefixes: [`${base}/payments`], badge: batchesPendingApprovalCount > 0 ? batchesPendingApprovalCount : undefined }
  // #342 §2 (execution of #291): Accounting reverses #282's "no rail item" clause — the badge
  // reuses financePushableCount (prop name kept for API stability; every user-facing reference is
  // Accounting now), destination is #329's connector picker inside Admin › Integrations.
  // #342 §5: Accounting's own href sits inside /admin — its matchPrefixes entry there is longer/
  // more specific than Admin's `${base}/admin`, so the longest-prefix-wins reduce below resolves
  // it correctly with no Admin-side exclusion clause. It also keeps the legacy /accounting
  // redirect lit (§2).
  const accountingItem = { href: adminPaths(workspaceId).integrations, label: "Accounting", icon: Landmark, matchPrefixes: [adminPaths(workspaceId).integrations, `${base}/accounting`], badge: financePushableCount > 0 ? financePushableCount : undefined }
  const primaryItems = [
    exceptionsItem,
    approvalsItem,
    paymentsItem,
    ...(accountingEnabled ? [accountingItem] : []),
  ]

  // Secondary destinations: per-workspace module extras only. Under a hairline, no caption — the
  // divider is the sectioning.
  const secondaryItems = otherModuleItems

  // #342 §1: Archive leaves "Today" — it's the permanent record, not today's work — and joins the
  // bottom group above Admin. #342 §3: Activity and Health Checks move into Admin's own nav
  // (admin/layout.tsx); Admin is last, always-labelled (navLink's alwaysLabelled).
  const bottomItems = [
    // "Archive" is the accountant's own word for the permanent source-document record (Dext and
    // Hubdoc both name this surface Archive). Route stays /library — same label-over-URL stance
    // as Controls (/automation) and Finance's /accounting redirect.
    { href: `${base}/library`, label: "Archive", icon: Library, matchPrefixes: [`${base}/library`], tourTarget: "library" as const },
    // #342 §5: matchPrefixes covers every /admin/* route plus the two legacy aliases that used to
    // need their own `||` clause (/settings, /automation) — Accounting's more specific prefix
    // (above) wins the one overlapping route via longest-prefix-wins, no exclusion needed here.
    { href: adminPaths(workspaceId).configuration, label: "Admin", icon: Settings, matchPrefixes: [`${base}/admin`, `${base}/settings`, `${base}/automation`], alwaysLabelled: true as const },
  ]

  // Sum across primary badges tells us whether the TODAY label is a promise or a reward. When the
  // total is zero every primary is quiet, and the "you're caught up" line reads under the group
  // instead of a promise the badges are supposed to keep.
  const todayTotal = (pipelineReviewCount || 0) + (accountingEnabled ? (financePushableCount || 0) : 0) + (openExceptionsCount || 0) + (batchesPendingApprovalCount || 0) + (approvalsReadyCount || 0)

  // #342 §5: one generic prefix-match reduce replaces the accreted per-label `||` clauses.
  // matchPrefixes replaces href-prefix-plus-special-case; when two items both match (Accounting's
  // href sits inside Admin's `/admin` prefix) the longest matching prefix wins, so Accounting
  // resolves correctly with no exclusion clause on Admin's side.
  type RailNavItem = { href: string; label: string; matchPrefixes: string[] }
  const matchLength = (item: RailNavItem) => item.matchPrefixes
    .filter((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
    .reduce((longest, prefix) => Math.max(longest, prefix.length), -1)
  const allNavItems: RailNavItem[] = [searchItem, ...typedDestinationGroups.flat(), exceptionsItem, approvalsItem, paymentsItem, accountingItem, ...secondaryItems, ...bottomItems]
  const activeItem = allNavItems.reduce<RailNavItem | null>((winner, item) => {
    const length = matchLength(item)
    if (length < 0) return winner
    return !winner || length > matchLength(winner) ? item : winner
  }, null)
  const isActive = (item: RailNavItem) => item === activeItem

  // In the compact rail every label is hidden until the rail expands (hover / focus-within /
  // pin), and the link keeps a `title` so a hover over the icon alone still names it. The badge
  // stays visible in both widths — it is the promise the TODAY group makes — as a small count
  // pinned to the icon's corner while collapsed.
  // group-has-[[aria-expanded=true]]/rail keeps the rail expanded while the workspace switcher
  // popover is open: the popover content is portaled to <body>, so focus moving into it drops
  // :focus-within on the rail and the trigger (and its label) would otherwise vanish mid-open,
  // stranding Escape's focus-return with nowhere to land (#287 close, F2).
  // #342 spec §4: "Icons only" (expandsOnHover = false) never reveals these on hover/focus —
  // a genuinely new state, every other compact rail expands on hover.
  const expandClasses = (display: string) => !compact ? "" : !expandsOnHover ? "hidden" : `hidden group-hover/rail:${display} group-focus-within/rail:${display} group-has-[[aria-expanded=true]]/rail:${display}`
  const labelClass = expandClasses("inline")
  // #262: collapsed-rail tooltip carries the `g` jump key beside the label (H6 recognition — the
  // dialog is the source of truth, this is a hint). Only the eight destinations the shortcut
  // listener actually registers get one.
  const SHORTCUT_KEY_BY_LABEL: Record<string, string> = { Invoices: "i", "Purchase Orders": "p", Receipts: "r", "Bank Statements": "b", Exceptions: "e", Approvals: "a", Payments: "y", Accounting: "c", Admin: "d" }
  const navLink = (item: RailNavItem & { icon: typeof Files; badge?: number; tourTarget?: string; alwaysLabelled?: boolean }) => {
    const active = isActive(item)
    const shortcutKey = SHORTCUT_KEY_BY_LABEL[item.label]
    const tooltip = compact && !item.alwaysLabelled ? (shortcutKey ? `${item.label} · g ${shortcutKey}` : item.label) : undefined
    // #342 §3: Admin's row is always labelled, even in the collapsed rail — its label sets the
    // rail's collapsed minimum width (w-16), so it renders one step down the type scale
    // (text-[13px]) to fit that width; every other row keeps text-sm and hides under labelClass.
    const rowLabelClass = item.alwaysLabelled ? "" : labelClass
    return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} title={tooltip}
      {...(item.tourTarget ? { "data-tour-target": item.tourTarget } : {})}
      className={`relative flex items-center gap-2.5 rounded-md px-2.5 py-1.5 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${item.alwaysLabelled ? "text-[13px]" : "text-sm"} ${active ? "bg-white text-emerald-800 shadow-sm ring-1 ring-emerald-700/10" : "text-slate-600 hover:bg-slate-300/40 hover:text-slate-900"}`}>
      {active && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-emerald-700" />}
      <span className="relative shrink-0">
        <item.icon className="h-4 w-4" />
        {compact && !item.alwaysLabelled && item.badge != null && <span aria-hidden className="absolute -right-2 -top-1.5 flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-indigo-600 px-0.5 text-[10px] font-bold text-white tabular-nums group-hover/rail:hidden group-focus-within/rail:hidden group-has-[[aria-expanded=true]]/rail:hidden">{item.badge > 99 ? "99+" : item.badge}</span>}
      </span>
      <span className={`truncate ${rowLabelClass}`}>{item.label}</span>
      {item.badge != null && <span className={`ml-auto flex h-[19px] min-w-[19px] items-center justify-center rounded-full bg-indigo-600 px-1 text-[11px] font-bold text-white tabular-nums transition-[background-color] duration-200 ${rowLabelClass}`}>{item.badge > 99 ? "99+" : item.badge}</span>}
      {compact && !item.alwaysLabelled && item.badge != null && <span className="sr-only">{item.badge} waiting</span>}
    </Link>
  }

  // TODAY caption. Muted uppercase, small — a promise the badges keep. When totalToday is 0 the
  // caption goes one step quieter and the "caught up" line under the group carries the meaning.
  const todayLabel = <div className={`mb-1 px-2.5 pt-1 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-600 ${expandClasses("block")}`}>Today</div>

  // Compact: the aside holds a 56px slot in the flow; the panel inside it widens over the
  // content on hover/focus so the queue never reflows while the operator glances at a label.
  return <aside className={`group/rail relative hidden shrink-0 md:flex ${compact ? "w-16" : "w-[236px]"}`}>
  <div className={`flex flex-col gap-0.5 border-r border-slate-200 bg-slate-100 py-3.5 transition-shadow duration-150 ease-out ${compact ? `absolute inset-y-0 left-0 z-30 w-16 overflow-hidden px-2 ${expandsOnHover ? "group-hover/rail:w-[236px] group-hover/rail:px-3 group-hover/rail:shadow-[8px_0_24px_-16px_rgba(15,23,42,0.35)] group-focus-within/rail:w-[236px] group-focus-within/rail:px-3 group-focus-within/rail:shadow-[8px_0_24px_-16px_rgba(15,23,42,0.35)] group-has-[[aria-expanded=true]]/rail:w-[236px] group-has-[[aria-expanded=true]]/rail:px-3 group-has-[[aria-expanded=true]]/rail:shadow-[8px_0_24px_-16px_rgba(15,23,42,0.35)]" : ""}` : "w-full px-3"}`}>
    <Link href={home} className="flex items-center gap-2 px-1.5 py-1" aria-label="DocuBite home">
      <BiteMark className="h-7 w-7 shrink-0" />
      <span className={`truncate text-sm font-bold font-display text-slate-900 ${labelClass}`}>DocuBite</span>
    </Link>

    {/* Always rendered (never `hidden`) — see switcher.tsx's `compact` prop doc: the trigger
       must stay focusable so Escape/close focus-return has somewhere real to land (#287 F2). */}
    <div className="mb-1 mt-2"><WorkspaceSwitcher workspaces={workspaces} workspaceId={workspaceId} compact={compact} /></div>

    <nav className="mt-2 flex flex-1 flex-col" aria-label="Workspace">
      {isImmersive ? (
        // Immersive mode: the pulse card takes the primary column. Same three peers, but they
        // report status rather than list themselves — the destinations are still reachable, but
        // now they show a heartbeat too. Secondary items collapse to a small icon strip below the
        // pulse; bottom items stay in the same position on the rail.
        <>
          <div className="space-y-0.5">{navLink(searchItem)}</div>
          <WorkspacePulse
            workspaceId={workspaceId}
            documentsCount={pipelineReviewCount}
            financeCount={financePushableCount}
            accountingEnabled={accountingEnabled}
          />
        </>
      ) : (
        <>
          {todayLabel}
          <div className="space-y-1">
            <div className="space-y-0.5">{navLink(searchItem)}</div>
            {typedDestinationGroups.map((group, index) => (
              <div key={index} role="group" aria-label={index === 0 ? "Invoices and purchase orders" : "Receipts and bank statements"} className={index === 1 ? "border-t border-slate-200/80 pt-1" : "space-y-0.5"}>
                {group.map(navLink)}
              </div>
            ))}
            <div className="space-y-0.5">{primaryItems.map(navLink)}</div>
          </div>
          {todayTotal === 0 && <p className={`mt-1 px-2.5 text-[11px] font-medium text-slate-600 ${expandClasses("block")}`}>You&apos;re caught up.</p>}
        </>
      )}

      {secondaryItems.length > 0 && <>
        <div className="my-3 border-t border-slate-200/80" aria-hidden="true" />
        <div className="space-y-0.5">{secondaryItems.map(navLink)}</div>
      </>}

      <div className="mt-auto space-y-0.5">
        {bottomItems.map(navLink)}
      </div>
    </nav>

    <div className="mt-auto pt-3">
      <AccountMenu name={user.name} email={user.email} collapsed={compact} workspaceId={workspaceId} approvalEmails={user.approvalEmails ?? true} railWidth={railWidth} />
    </div>
  </div>
  <KeyboardShortcuts destinations={SHORTCUT_DESTINATIONS(workspaceId, adminPaths(workspaceId).configuration, accountingEnabled ? adminPaths(workspaceId).integrations : undefined)} />
  <HowItWorksDialog inboundAddress={inboundAddress} />
  <ApprovalEmailsDialog workspaceId={workspaceId} initial={user.approvalEmails ?? true} />
  </aside>
}
