import Link from "next/link"
import { ListScreenToolbar } from "@/components/list-screen/list-screen-shell"
import type { BillRow } from "@/models/bills"

/** #211's two independent filter-chip groups for Invoices: Status and Invoice Approval. Link-based
 * (not a client component) so the filtered view stays a plain, shareable, refreshable URL, matching
 * the rest of this route's filters.
 *
 * Status has real backing for Unreviewed/Reviewed/Synced/Paid (#220 adds Synced: pushed but not
 * yet confirmed paid by the ledger) — the taxonomy's remaining Closed values (Posted/Exported/
 * Transferred) still have no matching model field, so "Paid" stays the only other real "closed"
 * state; recorded as a finding on #211 rather than inventing the other two. Invoice Approval's
 * Cancelled (#220) is backed by Document.cancelledAt, independent of ReviewTask. */
export function InvoiceFilterChips({ basePath, status, approval, extraParams, leading }: {
  basePath: string
  status?: "unreviewed" | "reviewed" | "synced" | "paid"
  approval?: BillRow["approvalStatus"]
  /** Other query params on this route (blocked/unpaid) to preserve across chip clicks. */
  extraParams?: Record<string, string | undefined>
  /** #201's saved-view picker: sits leftmost in this same toolbar row, ahead of both chip groups —
   * "left of the search box" in the ticket's language, and there is no search box on this route
   * yet, so leftmost is the whole of it. */
  leading?: React.ReactNode
}) {
  const withParams = (params: Record<string, string | undefined>) => {
    const search = new URLSearchParams()
    for (const [key, value] of Object.entries({ ...extraParams, ...params })) {
      if (value) search.set(key, value)
    }
    const qs = search.toString()
    return qs ? `${basePath}?${qs}` : basePath
  }

  return <ListScreenToolbar>
    {leading}
    <ChipGroup label="Status">
      <Chip href={withParams({ status: undefined })} active={!status}>All</Chip>
      <Chip href={withParams({ status: "unreviewed" })} active={status === "unreviewed"}>Unreviewed</Chip>
      <Chip href={withParams({ status: "reviewed" })} active={status === "reviewed"}>Reviewed</Chip>
      <Chip href={withParams({ status: "synced" })} active={status === "synced"}>Synced</Chip>
      <Chip href={withParams({ status: "paid" })} active={status === "paid"}>Paid</Chip>
    </ChipGroup>
    <ChipGroup label="Invoice Approval">
      <Chip href={withParams({ approval: undefined })} active={!approval}>All</Chip>
      <Chip href={withParams({ approval: "not_started" })} active={approval === "not_started"}>Not started</Chip>
      <Chip href={withParams({ approval: "in_progress" })} active={approval === "in_progress"}>In progress</Chip>
      <Chip href={withParams({ approval: "approved" })} active={approval === "approved"}>Approved</Chip>
      <Chip href={withParams({ approval: "rejected" })} active={approval === "rejected"}>Rejected</Chip>
      <Chip href={withParams({ approval: "cancelled" })} active={approval === "cancelled"}>Cancelled</Chip>
    </ChipGroup>
  </ListScreenToolbar>
}

function ChipGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={label}>
    <span className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</span>
    {children}
  </div>
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return <Link href={href} aria-current={active ? "true" : undefined}
    className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${active ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
    {children}
  </Link>
}
