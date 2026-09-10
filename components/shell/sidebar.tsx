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
 * components/shell/settings-nav.tsx instead, next to the settings pages they actually lead to.
 * The review-queue module's "Review" entry used to be filtered out here on the grounds that the
 * pipeline's Approvals tab had replaced it. That tab was never built — PIPELINE_STAGES is
 * ["inbox", "to_review", "ready"] — so the queue ended up with no navigation at all, reachable
 * only from a dashboard stat card or a link on a document. It is a rail entry again, positioned
 * after Extraction because that is where it falls in the work, and badged with its open-task
 * count. Expenses IS still filtered out — reachable at its own route, just not a standing entry. */
/** Every icon name a module declares in lib/modules/index.ts. Six of the nine used to be missing,
 * so Automation, Approvals, Rules, Tax, Expenses and Budgets all silently rendered the generic
 * Files icon — the declaration said one thing and the rail drew another. Keep this in step when a
 * module adds a nav item; an unmapped name still falls back to Files rather than breaking the rail. */
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

/** Lido's left rail. The repo had no sidebar component at all — the nav was inline in two
 * layout files — so this is the one place the app's top-level destinations are declared.
 *
 * It steps aside for the spreadsheet. Lido gives an open file the whole window and navigates
 * back out through the file bar's "← Files" rather than a persistent rail, and a grid is the
 * one screen where 224px of chrome costs real columns.
 *
 * Home, Files, module entries, then a single Settings link — the ~10 individual settings links
 * that used to sit here flat now live as tabs on the settings pages themselves (SettingsNav), so
 * this rail doesn't scroll. Module nav entries (Dictate) come from
 * `enabledModuleKeys` — the workspace's resolved capability set (lib/modules/capabilities.ts) —
 * rather than ad-hoc per-feature booleans. */
export function Sidebar({ workspaceId, workspaces, user, enabledModuleKeys, accountingEnabled = false, pipelineReviewCount = 0, reviewTaskCount = 0 }: {
  workspaceId: string
  workspaces: SwitchableWorkspace[]
  user: { name: string; email: string }
  /** Every module key currently enabled for this workspace (getWorkspaceCapabilities(...).enabled),
   * used to build the nav entries each module registers via ModuleDefinition.navItems. */
  enabledModuleKeys: string[]
  /** config.integrations.bigcapital.enabled — a deployment-level gate, not a per-workspace module,
   * since it depends on the encryption key being configured at all rather than anything a workspace
   * owner toggles. */
  accountingEnabled?: boolean
  /** counts.to_review from countDocumentsByStage — how many documents are waiting on a person right
   * now. Surfaced as a badge on the Pipeline entry so "something needs you" is visible from every
   * page, not just after clicking into Pipeline's own To review tab. */
  pipelineReviewCount?: number
  /** countOpenReviewTasks — retained on the prop signature for API stability; no longer surfaced
   * as its own sidebar badge, since pipelineReviewCount already carries that signal on the
   * Documents entry. */
  reviewTaskCount?: number
}) {
  void reviewTaskCount
  const pathname = usePathname()
  if (pathname.endsWith("/sheet") || pathname.includes("/documents/")) return null

  const base = `/workspaces/${workspaceId}`
  const enabled = new Set(enabledModuleKeys)
  const moduleWorkItems = MODULES
    .filter((module) => enabled.has(module.key))
    .flatMap((module) => module.navItems ?? [])
    .filter((item) => !item.href.startsWith("settings/") && item.href !== "expenses" && item.href !== "dictation" && item.href !== "health")
    .map((item) => ({ href: `${base}/${item.href}`, label: item.label, icon: ICONS[item.icon] ?? Files, exact: false }))

  // Review queue is a stage on the Documents lifecycle, not a standalone sidebar entry —
  // pipelineReviewCount is what the Documents badge advertises. The review-queue module's
  // /review page still exists as the approval-queue detail (a document's ReviewTask), reached
  // from a document row rather than a rail slot.
  const otherModuleItems = moduleWorkItems
    .filter((item) => item.href !== `${base}/review`)

  // Home is every workspace's unconditional first entry — exact-matched so it doesn't stay lit on
  // every page under it, unlike Files (which stays lit through a file's hub and sheet too).
  // Pipeline is the new primary upload→review surface (replacing folder-scoped navigation as the
  // main destination); Files is demoted below it — still available for the rare case someone
  // wants the underlying spreadsheet/ingestion-container view, but no longer where the app points
  // first. See the pipeline redesign plan, Phases 2 & 6.
  //
  // The audit's proposed structure (docs/ux/ux-audit-2026-09-10.html, "Proposed structure"):
  // one lifecycle spine (Dashboard + Documents) and a separate Tools section for the secondary
  // surfaces — Sheets, Docu Library, Accounting, Automation. The spine is where the work is;
  // Tools is where you go on purpose. Module-declared entries (Dictation etc.) land in Tools
  // too, since they come and go per workspace.
  const workItems = [
    { href: base, label: "Dashboard", icon: BarChart3, exact: true },
    { href: `${base}/pipeline`, label: "Documents", icon: ListChecks, exact: false, badge: pipelineReviewCount > 0 ? pipelineReviewCount : undefined, tourTarget: "extraction" as const },
  ]
  const toolItems = [
    { href: `${base}/files`, label: "Sheets", icon: Table2, exact: false, tourTarget: "sheets" as const },
    { href: `${base}/library`, label: "Docu Library", icon: Library, exact: false, tourTarget: "library" as const },
    ...(accountingEnabled ? [{ href: `${base}/accounting`, label: "Accounting", icon: Landmark, exact: false }] : []),
    ...otherModuleItems,
  ]
  const bottomItems = [
    { href: `${base}/settings/workspace`, label: "Settings", icon: Settings, exact: false },
    { href: `${base}/activity`, label: "Activity", icon: History, exact: false },
    { href: `${base}/health`, label: "Health Checks", icon: HeartPulse, exact: false },
  ]

  const navLink = (item: { href: string; label: string; icon: typeof Files; exact: boolean; badge?: number; tourTarget?: string }) => {
    // Non-exact entries stay lit while you're inside a page under them — Settings while you're on
    // any settings leaf, a module item while you're on its own sub-pages.
    const active = item.exact
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(`${item.href}/`)
        || (item.label === "Settings" && pathname.startsWith(`${base}/settings`))
        // Documents is the parent for /pipeline, /documents/<id>, /review and /bills — every
        // page along the lifecycle should light up the same rail entry.
        || (item.label === "Documents" && (pathname.startsWith(`${base}/pipeline`) || pathname.startsWith(`${base}/documents`) || pathname.startsWith(`${base}/review`) || pathname.startsWith(`${base}/bills`)))
    return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}
      {...(item.tourTarget ? { "data-tour-target": item.tourTarget } : {})}
      className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${active ? "relative bg-white text-emerald-800 shadow-[0_1px_2px_rgba(15,23,42,0.07),inset_0_0_0_1px_rgba(4,120,87,0.10)]" : "text-slate-600 hover:bg-[rgba(148,163,184,0.16)] hover:text-slate-900"}`}>
      {active && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-emerald-700" />}
      <item.icon className="h-4 w-4 shrink-0" />{item.label}
      {item.badge != null && <span className="ml-auto flex h-[19px] min-w-[19px] items-center justify-center rounded-full bg-indigo-600 px-1 text-[11px] font-bold text-white">{item.badge}</span>}
    </Link>
  }

  const sectionLabel = (label: string) => <div className="px-2.5 pb-1 pt-3 text-[10.5px] font-bold uppercase tracking-[0.06em] text-slate-400 first:pt-0">{label}</div>

  return <aside className="hidden w-[236px] shrink-0 flex-col gap-0.5 border-r border-[#e6ebf1] bg-[#f1f5f8] px-3 py-3.5 md:flex">
    <Link href={base} className="flex items-center gap-2 px-1.5 py-1">
      <BiteMark className="h-7 w-7 shrink-0" />
      <span className="truncate text-sm font-bold font-display text-slate-900">DocuBite</span>
    </Link>

    <div className="mb-1 mt-2"><WorkspaceSwitcher workspaces={workspaces} workspaceId={workspaceId} /></div>

    <nav className="mt-2 flex flex-1 flex-col">
      {sectionLabel("Workspace")}
      <div className="space-y-0.5">{workItems.map(navLink)}</div>

      {sectionLabel("Tools")}
      <div className="space-y-0.5">{toolItems.map(navLink)}</div>

      <div className="mt-auto space-y-0.5">{bottomItems.map(navLink)}</div>
    </nav>

    <div className="mt-auto pt-3">
      <AccountMenu name={user.name} email={user.email} />
    </div>
  </aside>
}
