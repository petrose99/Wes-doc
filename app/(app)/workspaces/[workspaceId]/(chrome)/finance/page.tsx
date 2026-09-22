import { LedgerConnectionPanel } from "@/components/accounting/accounting-dashboard"
import { AccountingErrorBanner } from "@/components/accounting/error-banner"
import { Panel } from "@/components/automation/automation-ui"
import { getCurrentUser } from "@/lib/auth"
import config from "@/lib/config"
import { getEntityCounts, getLastSyncedAt } from "@/models/accounting-entities"
import { getWorkspaceProvisionJob } from "@/models/bigcapital"
import { getWorkspaceIntegrationConnection } from "@/models/integrations"
import { requireWorkspaceRole } from "@/models/workspaces"
import { notFound } from "next/navigation"

/** Finance is the workspace's ledger surface — a first-class destination alongside Documents and
 * Worksheets, not a side "Accounting" utility. Named Finance rather than Accounting because the roadmap
 * is a hub: the in-house Bigcapital ledger today, external integrations (Xero, QuickBooks, banking,
 * tax) tomorrow. "Accounting" would sound like a lightweight duplicate of a category the vendors
 * own; Finance names the user's job. Route moved from /accounting; old URL redirects here.
 *
 * Per #248: Finance holds no rows and no work — pushing documents to the ledger happens at the
 * document (pane, row, bulk action), not here. Finance's job is the connection itself: status,
 * Sync now, entity counts, default account, plus the primary "Open ledger" action — all in the
 * reused Admin › Integrations panel (`LedgerConnectionPanel`'s `frame="panel"` already renders its
 * own "Open ledger" button top-right, per #248→#252; the page shell does not duplicate it — #281
 * close, a second copy in the page header was a real P2 caught by the confirm readers). */
export default async function FinancePage({ params, searchParams }: { params: Promise<{ workspaceId: string }>; searchParams: Promise<{ error?: string }> }) {
  if (!config.integrations.bigcapital.enabled) notFound()
  const { workspaceId } = await params
  const { error } = await searchParams
  const user = await getCurrentUser()
  const membership = await requireWorkspaceRole(workspaceId, user.id)

  const [connection, job] = await Promise.all([
    getWorkspaceIntegrationConnection(workspaceId, "bigcapital"),
    getWorkspaceProvisionJob(workspaceId),
  ])
  const [lastSyncedAt, entityCounts] = connection
    ? await Promise.all([getLastSyncedAt(workspaceId, connection.id), getEntityCounts(workspaceId, connection.id)])
    : [null, { accounts: 0, vendors: 0 }]

  return <main className="space-y-8">
    {error && <AccountingErrorBanner workspaceId={workspaceId} error={error} isOwner={membership.role === "owner"} />}
    <header>
      <h1 className="text-2xl font-bold text-slate-900">Finance</h1>
      <p className="mt-1 max-w-xl text-sm text-slate-500">Your workspace&apos;s ledger and integrations — coded accounts and vendors, ready for documents to push into. More integrations coming.</p>
      {membership.role !== "owner" && <p className="mt-2 text-xs text-slate-400">Only workspace owners can manage this connection.</p>}
    </header>
    <Panel title="Ledger connection">
      <LedgerConnectionPanel workspaceId={workspaceId} isOwner={membership.role === "owner"} connection={connection} job={job} lastSyncedAt={lastSyncedAt} entityCounts={entityCounts} />
    </Panel>
  </main>
}
