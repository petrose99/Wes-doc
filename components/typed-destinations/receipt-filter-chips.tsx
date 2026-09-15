import Link from "next/link"
import { ListScreenToolbar } from "@/components/list-screen/list-screen-shell"

/** #212's two independent filter-chip groups for Receipts, mirroring #211's InvoiceFilterChips
 * pattern: Status (unreviewed/reviewed) and Claim (unclaimed/claimed — whether the receipt has
 * been absorbed into an expense claim). Link-based so the filtered view stays a plain, shareable,
 * refreshable URL, matching the rest of this route's filters. */
export function ReceiptFilterChips({ basePath, status, claim, extraParams, leading }: {
  basePath: string
  status?: "unreviewed" | "reviewed"
  claim?: "unclaimed" | "claimed"
  /** Other query params on this route (touchless) to preserve across chip clicks. */
  extraParams?: Record<string, string | undefined>
  /** #201's saved-view picker: leftmost in this toolbar row. */
  leading?: React.ReactNode
}) {
  const withParams = (params: Record<string, string | undefined>) => {
    const search = new URLSearchParams()
    for (const [key, value] of Object.entries({ status, claim, ...extraParams, ...params })) {
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
    </ChipGroup>
    <ChipGroup label="Claim">
      <Chip href={withParams({ claim: undefined })} active={!claim}>All</Chip>
      <Chip href={withParams({ claim: "unclaimed" })} active={claim === "unclaimed"}>Unclaimed</Chip>
      <Chip href={withParams({ claim: "claimed" })} active={claim === "claimed"}>Claimed</Chip>
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
