import Link from "next/link"
import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

/**
 * The shared list-screen topology. Each route owns its content and domain-specific controls;
 * this component owns the stable order that makes an operator queue feel like one product:
 * context, view navigation, status, optional summary, toolbar, then the work list.
 *
 * `before` is intentionally a slot rather than a side effect so route-specific pollers can keep
 * their existing lifecycle while the visible shell remains reusable. `beforeToolbar` is the seam
 * for route-specific summaries and banners. The migration ticket wires the in-place detail pane;
 * this extraction leaves the existing pipeline content behavior unchanged until then.
 */
export function ListScreenShell({ before, header, navigation, status, beforeToolbar, toolbar, children }: {
  before?: ReactNode
  header?: ReactNode
  navigation?: ReactNode
  status?: ReactNode
  beforeToolbar?: ReactNode
  toolbar?: ReactNode
  children: ReactNode
}) {
  return <div className="flex min-h-0 flex-1 flex-col">
    {before}
    {header}
    {navigation}
    {status}
    {beforeToolbar}
    {toolbar}
    {children}
  </div>
}

export type ListScreenNavigationItem = {
  id: string
  href: string
  label: ReactNode
  active: boolean
  icon?: LucideIcon
  count?: number
  trailing?: ReactNode
}

/** A link-based view switcher that works in server-rendered list routes. */
export function ListScreenNavigation({ items, ariaLabel }: {
  items: readonly ListScreenNavigationItem[]
  ariaLabel: string
}) {
  return <nav className="flex flex-wrap gap-1 border-b px-6" aria-label={ariaLabel}>
    {items.map((item) => {
      const Icon = item.icon
      return <Link key={item.id} href={item.href}
        aria-current={item.active ? "page" : undefined}
        className={`flex items-center gap-1.5 rounded-t-md border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${item.active ? "border-emerald-700 text-emerald-800" : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800"}`}>
        {Icon && <Icon className="h-4 w-4 shrink-0" />}
        {item.label}
        {typeof item.count === "number" && <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums ${item.active ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>{item.count}</span>}
        {item.trailing}
      </Link>
    })}
  </nav>
}

/** The shared toolbar surface for search, sort, view, and filter controls. */
export function ListScreenToolbar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3 border-b bg-slate-50/60 px-6 py-3">{children}</div>
}

/** Shared selection-bar chrome; routes supply their own domain actions and confirmation UI. */
export function ListScreenBulkActionBar({ selectedCount, children }: { selectedCount: number; children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2 border-b bg-slate-50 px-6 py-2.5 text-sm">
    {selectedCount > 0 && <span className="font-medium text-slate-700">{selectedCount} selected</span>}
    {children}
  </div>
}
