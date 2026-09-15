import Link from "next/link"

/** #236: the Approvals destination's own view picker — Invoices and PO Mismatches are two
 * separate queues on one destination, not two facets of one queue, so this switches between two
 * routes rather than two URL filters (contrast `FacetFilters`, which stays within one route).
 * Rendered in `QueueScreen`'s row-1 `views` slot, ahead of the saved-view picker on Invoices. */
export function ApprovalsQueuePicker({ workspaceId, active, invoiceCount, poMismatchCount }: {
  workspaceId: string
  active: "invoices" | "po-mismatches"
  invoiceCount: number
  poMismatchCount: number
}) {
  const base = `/workspaces/${workspaceId}/approvals`
  const items: Array<{ id: "invoices" | "po-mismatches"; href: string; label: string; count: number }> = [
    { id: "invoices", href: `${base}/invoices`, label: "Invoices", count: invoiceCount },
    { id: "po-mismatches", href: `${base}/po-mismatches`, label: "PO Mismatches", count: poMismatchCount },
  ]
  return <div role="group" aria-label="Approvals queue" className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white p-0.5">
    {items.map((item) => {
      const isActive = item.id === active
      return <Link key={item.id} href={item.href} aria-current={isActive ? "page" : undefined}
        className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${isActive ? "bg-emerald-50 text-emerald-800" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}>
        {item.label}
        <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${isActive ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>{item.count}</span>
      </Link>
    })}
  </div>
}
