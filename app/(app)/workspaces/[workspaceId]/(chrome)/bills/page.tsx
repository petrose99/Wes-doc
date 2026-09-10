import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getCurrentUser } from "@/lib/auth"
import { listWorkspaceBills, type BillRow, type BillsSummary } from "@/models/bills"
import { requireWorkspaceRole } from "@/models/workspaces"
import type { AgingBucket } from "@/lib/bills/due-date"

export const dynamic = "force-dynamic"

/** WP-AP2: AP aging / bills cockpit. One page a controller can open to see every invoice this
 * workspace has extracted, grouped by aging bucket, with payment status from the ledger sync
 * and a "blocked by check" flag surfaced on every row. Read-only for now — resolution actions
 * (approve, push, pay) live on the underlying document detail page. */
export default async function BillsPage({ params, searchParams }: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<{ blocked?: string; unpaid?: string }>
}) {
  const { workspaceId } = await params
  const { blocked, unpaid } = await searchParams
  const user = await getCurrentUser()
  await requireWorkspaceRole(workspaceId, user.id)

  const onlyBlocked = blocked === "1"
  const onlyUnpaid = unpaid === "1"
  const { bills, summary } = await listWorkspaceBills({ workspaceId, onlyBlocked, onlyUnpaid })

  const buckets: (AgingBucket | "unknown")[] = ["current", "1-30", "31-60", "61-90", "90+", "unknown"]

  return (
    <main className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Bills</h1>
          <p className="mt-1 text-muted-foreground">Every extracted invoice, grouped by aging bucket. Payment status is synced from your ledger.</p>
        </div>
        <div className="flex gap-2 text-sm">
          <FilterLink href={`/workspaces/${workspaceId}/bills`} active={!onlyBlocked && !onlyUnpaid}>All</FilterLink>
          <FilterLink href={`/workspaces/${workspaceId}/bills?unpaid=1`} active={onlyUnpaid && !onlyBlocked}>Unpaid</FilterLink>
          <FilterLink href={`/workspaces/${workspaceId}/bills?blocked=1`} active={onlyBlocked && !onlyUnpaid}>Blocked by a check</FilterLink>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        {buckets.map((bucket) => (
          <SummaryCard key={bucket} label={bucketLabel(bucket)} data={summary[bucket]} />
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{bills.length} bill{bills.length === 1 ? "" : "s"}</CardTitle>
          <CardDescription>Newest first. Click a row to open its extraction detail.</CardDescription>
        </CardHeader>
        <CardContent>
          {bills.length === 0 ? (
            <p className="text-sm text-muted-foreground">No bills match the current filter.</p>
          ) : (
            <div className="-mx-6 overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-2 font-medium">Supplier</th>
                    <th className="px-4 py-2 font-medium">Invoice #</th>
                    <th className="px-4 py-2 font-medium">Amount</th>
                    <th className="px-4 py-2 font-medium">Due</th>
                    <th className="px-4 py-2 font-medium">Aging</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {bills.map((bill) => (
                    <BillTableRow key={bill.documentId} workspaceId={workspaceId} bill={bill} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  )
}

function SummaryCard({ label, data }: { label: string; data: { count: number; total: number } }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
        <div className="mt-1 text-2xl font-bold text-slate-900">{data.count}</div>
        <div className="text-xs text-slate-500">{data.total ? `${formatMoney(data.total)} total` : "—"}</div>
      </CardContent>
    </Card>
  )
}

function BillTableRow({ workspaceId, bill }: { workspaceId: string; bill: BillRow }) {
  return (
    <tr className="border-b border-slate-100 transition-colors hover:bg-slate-50">
      <td className="px-4 py-2.5">
        <Link href={`/workspaces/${workspaceId}/documents/${bill.documentId}`} className="text-slate-800 hover:text-emerald-700 hover:underline">
          {bill.supplier ?? <span className="italic text-slate-400">unknown supplier</span>}
        </Link>
        <div className="text-xs text-slate-500 truncate max-w-[240px]">{bill.filename}</div>
      </td>
      <td className="px-4 py-2.5 text-slate-600">{bill.invoiceNumber ?? "—"}</td>
      <td className="px-4 py-2.5 tabular-nums text-slate-800">{bill.total !== null ? formatMoney(bill.total, bill.currencyCode) : "—"}</td>
      <td className="px-4 py-2.5 tabular-nums text-slate-600">
        {bill.dueDate ? bill.dueDate.toISOString().slice(0, 10) : "—"}
        {bill.dueDate && !bill.extractedDueDate && <span className="ml-1 text-[10px] uppercase tracking-wide text-slate-400">inferred</span>}
      </td>
      <td className="px-4 py-2.5">
        <BucketPill bucket={bill.agingBucket} />
      </td>
      <td className="px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {bill.paymentStatus && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">{bill.paymentStatus}</span>
          )}
          {bill.blockedByCheck && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800" title={bill.openCheckCodes.join(", ")}>
              blocked ({bill.openCheckCodes.length})
            </span>
          )}
          {!bill.paymentStatus && !bill.blockedByCheck && (
            <span className="text-xs text-slate-400">—</span>
          )}
        </div>
      </td>
    </tr>
  )
}

function BucketPill({ bucket }: { bucket: AgingBucket | null }) {
  if (!bucket) return <span className="text-xs text-slate-400">—</span>
  const cls =
    bucket === "current" ? "bg-emerald-50 text-emerald-700" :
    bucket === "1-30" ? "bg-yellow-50 text-yellow-800" :
    bucket === "31-60" ? "bg-orange-50 text-orange-800" :
    "bg-red-50 text-red-800"
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>{bucket === "current" ? "Current" : `${bucket}d`}</span>
}

function FilterLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${active ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
      {children}
    </Link>
  )
}

function bucketLabel(bucket: AgingBucket | "unknown"): string {
  switch (bucket) {
    case "current": return "Current"
    case "1-30": return "1–30d"
    case "31-60": return "31–60d"
    case "61-90": return "61–90d"
    case "90+": return "90+ days"
    case "unknown": return "No due date"
  }
}

function formatMoney(amount: number, currency?: string | null): string {
  const currencyCode = currency && /^[A-Z]{3}$/.test(currency) ? currency : "USD"
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency: currencyCode, maximumFractionDigits: 0 }).format(amount)
  } catch {
    return `${amount.toFixed(0)} ${currency ?? ""}`.trim()
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _Summary = BillsSummary
