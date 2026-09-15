"use client"

import { ClipboardCheck, Landmark, Receipt, type LucideIcon } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

/** The workspace pulse card. Rendered inside the sidebar in place of the compact icon strip when a
 * person is inside a sheet or a document detail — a room they used to enter with the door closing
 * behind them. The pulse card is the mini-map: typed intake rows plus the main outcome surfaces, each
 * carrying the same "something is waiting on you" count the full rail's badges do.
 *
 * The point is not just reachability (the compact icon strip already did that); the point is that
 * the workspace's living state stays visible. If two documents just landed in review while you were
 * inside a document, the Invoices row goes from muted to lit without you leaving it.
 *
 * Row weight (muted vs lit) is the signal, not the count text alone — a screen at a glance still
 * reads "nothing waiting" or "three surfaces want you" without parsing numbers. Zero rows stay
 * present but muted so the workspace shape is constant; only urgency varies.
 *
 * Finance row is only rendered when the ledger integration is enabled deployment-wide. When it
 * isn't, the pulse card omits Finance rather than leaving a placeholder — the workspace
 * genuinely does not have a Finance surface in that deployment. */
export function WorkspacePulse({ workspaceId, documentsCount, financeCount, accountingEnabled }: {
  workspaceId: string
  /** pipelineCounts.review — documents waiting for a person to sign off on the extracted fields. */
  documentsCount: number
  /** pipelineCounts.approved — documents past review, not yet pushed to the ledger. Only meaningful
   * when accountingEnabled; ignored otherwise. */
  financeCount: number
  accountingEnabled: boolean
}) {
  const pathname = usePathname()
  const base = `/workspaces/${workspaceId}`

  const rows: { href: string; label: string; icon: LucideIcon; count: number; matches: string[] }[] = [
    { href: `${base}/invoices`, label: "Invoices", icon: Receipt, count: documentsCount, matches: [`${base}/pipeline`, `${base}/documents`, `${base}/review`, `${base}/bills`, `${base}/invoices`] },
    { href: `${base}/purchase-orders`, label: "Purchase Orders", icon: ClipboardCheck, count: 0, matches: [`${base}/purchase-orders`] },
    { href: `${base}/receipts`, label: "Receipts", icon: Receipt, count: 0, matches: [`${base}/receipts`] },
    { href: `${base}/bank-statements`, label: "Bank Statements", icon: Landmark, count: 0, matches: [`${base}/bank-statements`] },
    ...(accountingEnabled ? [{ href: `${base}/finance`, label: "Finance", icon: Landmark, count: financeCount, matches: [`${base}/finance`, `${base}/accounting`] }] : []),
  ]

  const total = rows.reduce((sum, row) => sum + row.count, 0)

  return <div className="w-full">
    {/* Back-link out of document mode, to the workspace home (the Invoices queue, #238). Its own
        affordance so exit never depends on remembering which rail entry corresponds to "back" —
        the way it did when the rail disappeared entirely. */}
    <Link
      href={`${base}/invoices`}
      className="mb-2 flex items-center gap-1.5 rounded-md px-2 py-1 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-slate-500 hover:bg-slate-200/50 hover:text-slate-800"
    >
      <span aria-hidden="true">←</span>
      <span>Workspace</span>
    </Link>

    <nav aria-label="Workspace pulse" className="rounded-lg border border-slate-200/70 bg-white/60 p-1.5 shadow-[0_1px_0_rgba(15,23,42,0.03)]">
      {rows.map((row) => {
        const active = row.matches.some((match) => pathname === match || pathname.startsWith(`${match}/`))
        const hot = row.count > 0
        return <Link
          key={row.href}
          href={row.href}
          aria-current={active ? "page" : undefined}
          aria-label={hot ? `${row.label}, ${row.count} waiting` : `${row.label}, nothing waiting`}
          className={`group relative flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors ${active ? "bg-emerald-50/70 text-emerald-800" : hot ? "text-slate-800 hover:bg-slate-100" : "text-slate-400 hover:bg-slate-100 hover:text-slate-600"}`}
        >
          {active && <span aria-hidden="true" className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-emerald-700" />}
          <row.icon className={`h-[15px] w-[15px] shrink-0 transition-opacity ${hot || active ? "opacity-100" : "opacity-60"}`} />
          <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{row.label}</span>
          {/* Count pill — indigo when hot to match the main rail's badge, hairline outline when
              muted so the row height stays constant and the eye still lands on the right column. */}
          {hot ? (
            <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10.5px] font-bold tabular-nums ${active ? "bg-emerald-700 text-white" : "bg-indigo-600 text-white"}`}>{row.count > 99 ? "99+" : row.count}</span>
          ) : (
            <span aria-hidden="true" className="shrink-0 text-[10.5px] font-medium tabular-nums text-slate-300">·</span>
          )}
        </Link>
      })}
    </nav>

    {/* The reward line. When every primary is quiet, the card carries a single line of prose that
        turns the empty state into an outcome — "you're caught up" — rather than a vacuum. When
        anything is waiting, the counts already carry the meaning and the line is not rendered. */}
    {total === 0 && <p className="mt-1.5 px-2 text-[11px] font-medium text-slate-400">You&apos;re caught up.</p>}
  </div>
}
