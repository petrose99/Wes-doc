"use client"

import { AlertTriangle, ClipboardCheck, ListChecks, UserRound } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

/** Mobile bottom tab bar (#257 — #232's shape): Approvals · Invoices · Exceptions · Account.
 * Approvals is the Approver's landing (#236, badged with their own Ready-to-Approve count, never
 * the workspace total); Invoices is the workspace home (CONTEXT.md) and carries no badge — it is
 * not a second waiting-on-you signal (#232 §2); Exceptions keeps the rail's badge; Account is the
 * person (#231 Q18, #252: Admin is a desktop area) and, below `md`, also the door to every other
 * queue via "Also in this workspace" (`account/page.tsx`) — Accounting included, Payments excluded
 * (#251 is owner-decided on desktop only).
 *
 * Hidden on /sheet and /documents/ — those surfaces get their full viewport on a phone; users
 * navigate back through the surface's own header. */
export function MobileTabBar({ workspaceId, approvalsReadyCount = 0, openExceptionsCount = 0, approvalsEnabled = false }: {
  workspaceId: string
  /** #236's countReadyToApprove — the signed-in person's own count, shared with the rail badge. */
  approvalsReadyCount?: number
  /** #210 / #238: countOpenExceptions — the same badge the rail's Exceptions entry carries. */
  openExceptionsCount?: number
  /** review-queue capability gate — a workspace without it has no Approvals destination to link. */
  approvalsEnabled?: boolean
  accountingEnabled?: boolean
}) {
  const pathname = usePathname()
  if (pathname.endsWith("/sheet") || pathname.includes("/documents/")) return null

  const base = `/workspaces/${workspaceId}`
  const tabs = [
    ...(approvalsEnabled ? [{ href: `${base}/approvals/invoices`, label: "Approvals", icon: ClipboardCheck, badge: approvalsReadyCount > 0 ? approvalsReadyCount : undefined }] : []),
    { href: `${base}/invoices`, label: "Invoices", icon: ListChecks, badge: undefined as number | undefined },
    { href: `${base}/exceptions`, label: "Exceptions", icon: AlertTriangle, badge: openExceptionsCount > 0 ? openExceptionsCount : undefined },
    { href: `${base}/account`, label: "Account", icon: UserRound, badge: undefined as number | undefined },
  ]

  return <nav aria-label="Primary workspace navigation" className="fixed inset-x-0 bottom-0 z-40 grid items-center border-t border-[#eef2f6] bg-[rgba(255,255,255,0.94)] px-2 pb-5 pt-2 backdrop-blur-[10px] md:hidden" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
    {tabs.map((tab) => {
      const active = pathname === tab.href
        || pathname.startsWith(`${tab.href}/`)
        || (tab.label === "Approvals" && pathname.startsWith(`${base}/approvals`))
        || (tab.label === "Account" && (pathname.startsWith(`${base}/settings`) || pathname.startsWith(`${base}/admin`)
          || pathname.startsWith(`${base}/purchase-orders`) || pathname.startsWith(`${base}/receipts`) || pathname.startsWith(`${base}/bank-statements`)
          || pathname.startsWith(`${base}/library`) || pathname.startsWith(`${base}/accounting`) || pathname.startsWith(`${base}/payments`)))
        || (tab.label === "Invoices" && (pathname.startsWith(`${base}/pipeline`) || pathname.startsWith(`${base}/documents`) || pathname.startsWith(`${base}/review`) || pathname.startsWith(`${base}/bills`)))
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
