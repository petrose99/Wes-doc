import Link from "next/link"
import { ListScreenToolbar } from "@/components/list-screen/list-screen-shell"
import type { BillRow } from "@/models/bills"

/** #211's two independent filter-chip groups for Invoices: Status and Invoice Approval. Link-based
 * (not a client component) so the filtered view stays a plain, shareable, refreshable URL, matching
 * the rest of this route's filters.
 *
 * Status only has real backing for Unreviewed/Reviewed/Paid — the taxonomy's Closed values
 * (Posted/Exported/Transferred) have no matching model field (no push/ledger status of that shape
 * exists yet), so "Paid" stands in as the only real "closed" state; recorded as a finding on #211
 * rather than inventing the other three. Invoice Approval has no "Cancelled" state for the same
 * reason — ReviewTask only has open/in_review/approved/rejected. */
export function InvoiceFilterChips({ basePath, status, approval, extraParams }: {
  basePath: string
  status?: "unreviewed" | "reviewed" | "paid"
  approval?: BillRow["approvalStatus"]
  /** Other query params on this route (blocked/unpaid) to preserve across chip clicks. */
  extraParams?: Record<string, string | undefined>
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
    <ChipGroup label="Status">
      <Chip href={withParams({ status: undefined })} active={!status}>All</Chip>
      <Chip href={withParams({ status: "unreviewed" })} active={status === "unreviewed"}>Unreviewed</Chip>
      <Chip href={withParams({ status: "reviewed" })} active={status === "reviewed"}>Reviewed</Chip>
      <Chip href={withParams({ status: "paid" })} active={status === "paid"}>Paid</Chip>
    </ChipGroup>
    <ChipGroup label="Invoice Approval">
      <Chip href={withParams({ approval: undefined })} active={!approval}>All</Chip>
      <Chip href={withParams({ approval: "not_started" })} active={approval === "not_started"}>Not started</Chip>
      <Chip href={withParams({ approval: "in_progress" })} active={approval === "in_progress"}>In progress</Chip>
      <Chip href={withParams({ approval: "approved" })} active={approval === "approved"}>Approved</Chip>
      <Chip href={withParams({ approval: "rejected" })} active={approval === "rejected"}>Rejected</Chip>
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
