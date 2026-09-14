import Link from "next/link"
import { Plus } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getCurrentUser } from "@/lib/auth"
import { listWorkspaceReceipts } from "@/models/receipts"
import { requireWorkspaceRole } from "@/models/workspaces"
import { ListScreenShell } from "@/components/list-screen/list-screen-shell"
import { ReceiptFilterChips } from "@/components/typed-destinations/receipt-filter-chips"
import { ReceiptTable } from "@/components/typed-destinations/receipt-table"
import { ExpenseClaimsPage } from "../expenses/page"

export const dynamic = "force-dynamic"

/** #212: Receipts, rendered on the shared list-screen shell (part 2 of #197's split, after #211's
 * Invoices). No aging or payment run, since a receipt is already paid at purchase — filterable by
 * Status and Claim state. #213 adds row selection and the Approve/Export/Delete bulk bar; opening
 * a row still navigates to the standalone detail page — in-place split-pane row expansion is
 * #214, split off from #213. "Create expense claim" stays the one row action into the
 * expense-claims workflow (unchanged, absorbed per #195). */
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
            <ReceiptTable workspaceId={workspaceId} basePath={basePath} receipts={receipts} />
          )}
        </CardContent>
      </Card>
    </main>
  </ListScreenShell>
}

