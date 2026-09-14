import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getCurrentUser } from "@/lib/auth"
import { listWorkspaceBills, type BillRow } from "@/models/bills"
import { requireWorkspaceRole } from "@/models/workspaces"
import type { AgingBucket } from "@/lib/bills/due-date"
import { preparePaymentRunAction } from "./actions"
import { redirect } from "next/navigation"
import { ListScreenShell, ListScreenBulkActionBar } from "@/components/list-screen/list-screen-shell"
import { SyncedStageHeader } from "@/components/pipeline/synced-stage-header"
import { InvoiceFilterChips } from "@/components/typed-destinations/invoice-filter-chips"

export const dynamic = "force-dynamic"

/** WP-AP2 / #211: AP aging / bills cockpit, rendered on the shared list-screen shell. One page a
 * controller can open to see every invoice this workspace has extracted, filterable by Status and
 * Invoice Approval, with payment status from the ledger sync and a "blocked by check" flag
 * surfaced on every row. Read-only for now — resolution actions (approve, push, pay) live on the
 * underlying document detail page; in-place row expansion is #213, not this ticket. */
export async function BillsPage({ params, searchParams, pathSegment = "invoices", title = "Invoices" }: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<{ blocked?: string; unpaid?: string; status?: string; approval?: string }>
  pathSegment?: string
  title?: string
}) {
  const { workspaceId } = await params
  const { blocked, unpaid, status, approval } = await searchParams
  const user = await getCurrentUser()
  const membership = await requireWorkspaceRole(workspaceId, user.id)
  const isOwner = membership.role === "owner"

  const onlyBlocked = blocked === "1"
  const onlyUnpaid = unpaid === "1"
  const statusFilter = status === "unreviewed" || status === "reviewed" || status === "paid" ? status : undefined
  const approvalFilter: BillRow["approvalStatus"] | undefined =
    approval === "not_started" || approval === "in_progress" || approval === "approved" || approval === "rejected" ? approval : undefined
  const basePath = `/workspaces/${workspaceId}/${pathSegment}`
  const { bills, summary } = await listWorkspaceBills({ workspaceId, onlyBlocked, onlyUnpaid, statusFilter, approvalFilter })
  // Only bills with a total AND an unblocked status are candidates for a payment run.
  const payableBills = bills.filter((b) => !b.blockedByCheck && b.total !== null && b.total > 0 && (!b.paymentStatus || !["paid", "reconciled"].includes(b.paymentStatus.toLowerCase())))
  const preparePaymentRunActionBound = preparePaymentRunAction.bind(null, workspaceId)
  const hasFilter = onlyBlocked || onlyUnpaid || !!statusFilter || !!approvalFilter

  return <ListScreenShell
    header={<div className="flex flex-wrap items-end justify-between gap-4 border-b px-6 py-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">Every extracted invoice, filterable by status and approval. Payment status is synced from your ledger.</p>
      </div>
      <div className="flex gap-2 text-sm">
        <FilterLink href={basePath} active={!onlyBlocked && !onlyUnpaid}>All</FilterLink>
        <FilterLink href={`${basePath}?unpaid=1`} active={onlyUnpaid && !onlyBlocked}>Unpaid</FilterLink>
        <FilterLink href={`${basePath}?blocked=1`} active={onlyBlocked && !onlyUnpaid}>Blocked by a check</FilterLink>
      </div>
    </div>}
    beforeToolbar={<SyncedStageHeader workspaceId={workspaceId} summary={summary} currency="USD" showLink={false} />}
    toolbar={<>
      <InvoiceFilterChips basePath={basePath} status={statusFilter} approval={approvalFilter}
        extraParams={{ blocked: onlyBlocked ? "1" : undefined, unpaid: onlyUnpaid ? "1" : undefined }} />
      {isOwner && payableBills.length > 0 && (
        <ListScreenBulkActionBar selectedCount={0}>
          <form action={preparePaymentRunActionBound} className="flex flex-wrap items-center gap-3">
            {payableBills.map((bill) => (
              <input key={bill.documentId} type="hidden" name="documentId" value={bill.documentId} />
            ))}
            <span className="font-medium text-slate-700">Prepare a payment run</span>
            <button type="submit" className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700">
              Generate ZA EFT CSV ({payableBills.length})
            </button>
            <span className="text-xs text-slate-500">Invoices without a supplier bank account are dropped — set it on the supplier record and re-run.</span>
          </form>
        </ListScreenBulkActionBar>
      )}
    </>}>
    <main className="p-6">
      <Card>
        <CardHeader>
          <CardTitle>{bills.length} invoice{bills.length === 1 ? "" : "s"}</CardTitle>
          <CardDescription>Newest first. Click a row to open its extraction detail.</CardDescription>
        </CardHeader>
        <CardContent>
          {bills.length === 0 ? (
            <p className="text-sm text-muted-foreground">
                {hasFilter
                ? "No invoices match the current filter."
                : "No invoices yet. Invoices appear here once an invoice is extracted and approved."}
            </p>
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
                    <BillTableRow key={bill.documentId} basePath={basePath} bill={bill} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  </ListScreenShell>
}

export default async function LegacyBillsPage({ params, searchParams }: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<{ blocked?: string; unpaid?: string }>
}) {
  const { workspaceId } = await params
  const { blocked, unpaid } = await searchParams
  const query = new URLSearchParams()
  if (blocked === "1") query.set("blocked", "1")
  if (unpaid === "1") query.set("unpaid", "1")
  const suffix = query.toString() ? `?${query.toString()}` : ""
  redirect(`/workspaces/${workspaceId}/invoices${suffix}`)
}

function BillTableRow({ basePath, bill }: { basePath: string; bill: BillRow }) {
  return (
    <tr className="border-b border-slate-100 transition-colors hover:bg-slate-50">
      <td className="px-4 py-2.5">
        <Link href={`${basePath}/${bill.documentId}`} className="text-slate-800 hover:text-emerald-700 hover:underline">
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

function formatMoney(amount: number, currency?: string | null): string {
  const currencyCode = currency && /^[A-Z]{3}$/.test(currency) ? currency : "USD"
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency: currencyCode, maximumFractionDigits: 0 }).format(amount)
  } catch {
    return `${amount.toFixed(0)} ${currency ?? ""}`.trim()
  }
}

