import Link from "next/link"
import { Plus } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getCurrentUser } from "@/lib/auth"
import { listWorkspaceReceipts, type ReceiptRow } from "@/models/receipts"
import { requireWorkspaceRole } from "@/models/workspaces"
import { ListScreenShell } from "@/components/list-screen/list-screen-shell"
import { ReceiptFilterChips } from "@/components/typed-destinations/receipt-filter-chips"
import { ExpenseClaimsPage } from "../expenses/page"

export const dynamic = "force-dynamic"

/** #212: Receipts, rendered on the shared list-screen shell (part 2 of #197's split, after #211's
 * Invoices). Read-only cockpit over extracted receipts — no aging or payment run, since a receipt
 * is already paid at purchase — filterable by Status and Claim state. "Create expense claim" stays
 * the one row action into the expense-claims workflow (unchanged, absorbed per #195). */
export default async function ReceiptsPage({ params, searchParams }: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<{ mode?: string; status?: string; claim?: string }>
}) {
  const { workspaceId } = await params
  const { mode, status, claim } = await searchParams
  if (mode === "claims") return ExpenseClaimsPage({ params: Promise.resolve({ workspaceId }) })

  await getCurrentUser().then((user) => requireWorkspaceRole(workspaceId, user.id))
  const basePath = `/workspaces/${workspaceId}/receipts`
  const statusFilter = status === "unreviewed" || status === "reviewed" ? status : undefined
  const claimFilter = claim === "unclaimed" || claim === "claimed" ? claim : undefined
  const { receipts } = await listWorkspaceReceipts({ workspaceId, statusFilter, claimFilter })
  const hasFilter = !!statusFilter || !!claimFilter

  return <ListScreenShell
    header={<div className="flex flex-wrap items-end justify-between gap-4 border-b px-6 py-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Receipts</h1>
        <p className="mt-1 text-sm text-slate-500">Every extracted receipt, filterable by status and expense-claim state.</p>
      </div>
      <Link href={`${basePath}?mode=claims`} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2">
        <Plus className="h-4 w-4" />
        Create expense claim
      </Link>
    </div>}
    toolbar={<ReceiptFilterChips basePath={basePath} status={statusFilter} claim={claimFilter} />}>
    <main className="p-6">
      <Card>
        <CardHeader>
          <CardTitle>{receipts.length} receipt{receipts.length === 1 ? "" : "s"}</CardTitle>
          <CardDescription>Newest first. Click a row to open its extraction detail.</CardDescription>
        </CardHeader>
        <CardContent>
          {receipts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {hasFilter
                ? "No receipts match the current filter."
                : "No receipts yet. Receipts appear here once a receipt is extracted."}
            </p>
          ) : (
            <div className="-mx-6 overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-2 font-medium">Merchant</th>
                    <th className="px-4 py-2 font-medium">Receipt #</th>
                    <th className="px-4 py-2 font-medium">Amount</th>
                    <th className="px-4 py-2 font-medium">Purchase date</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Claim</th>
                  </tr>
                </thead>
                <tbody>
                  {receipts.map((receipt) => (
                    <ReceiptTableRow key={receipt.documentId} basePath={basePath} receipt={receipt} />
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

function ReceiptTableRow({ basePath, receipt }: { basePath: string; receipt: ReceiptRow }) {
  return (
    <tr className="border-b border-slate-100 transition-colors hover:bg-slate-50">
      <td className="px-4 py-2.5">
        <Link href={`${basePath}/${receipt.documentId}`} className="text-slate-800 hover:text-emerald-700 hover:underline">
          {receipt.merchant ?? <span className="italic text-slate-400">unknown merchant</span>}
        </Link>
        <div className="text-xs text-slate-500 truncate max-w-[240px]">{receipt.filename}</div>
      </td>
      <td className="px-4 py-2.5 text-slate-600">{receipt.receiptNumber ?? "—"}</td>
      <td className="px-4 py-2.5 tabular-nums text-slate-800">{receipt.total !== null ? formatMoney(receipt.total, receipt.currencyCode) : "—"}</td>
      <td className="px-4 py-2.5 tabular-nums text-slate-600">{receipt.purchaseDate ? receipt.purchaseDate.toISOString().slice(0, 10) : "—"}</td>
      <td className="px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium capitalize text-slate-700">{receipt.status.replaceAll("_", " ")}</span>
          {receipt.blockedByCheck && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800" title={receipt.openCheckCodes.join(", ")}>
              blocked ({receipt.openCheckCodes.length})
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-2.5">
        <ClaimPill status={receipt.claimStatus} />
      </td>
    </tr>
  )
}

function ClaimPill({ status }: { status: ReceiptRow["claimStatus"] }) {
  if (!status) return <span className="text-xs text-slate-400">Unclaimed</span>
  const cls =
    status === "approved" ? "bg-emerald-50 text-emerald-700" :
    status === "rejected" ? "bg-red-50 text-red-800" :
    status === "submitted" ? "bg-blue-50 text-blue-700" :
    "bg-slate-100 text-slate-700"
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${cls}`}>{status}</span>
}

function formatMoney(amount: number, currency?: string | null): string {
  const currencyCode = currency && /^[A-Z]{3}$/.test(currency) ? currency : "USD"
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency: currencyCode, maximumFractionDigits: 0 }).format(amount)
  } catch {
    return `${amount.toFixed(0)} ${currency ?? ""}`.trim()
  }
}
