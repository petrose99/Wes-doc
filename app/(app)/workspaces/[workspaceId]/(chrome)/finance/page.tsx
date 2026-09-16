import { AccountingDashboard } from "@/components/accounting/accounting-dashboard"
import { AccountingErrorBanner } from "@/components/accounting/error-banner"
import { getCurrentUser } from "@/lib/auth"
import config from "@/lib/config"
import { getEntityCounts, getLastSyncedAt } from "@/models/accounting-entities"
import { getWorkspaceProvisionJob } from "@/models/bigcapital"
import { listReadyToPushDocuments } from "@/models/documents"
import { listCategoryAccountMappings } from "@/models/category-account-mappings"
import { getCategoryAccountMap, getWorkspaceIntegrationConnection } from "@/models/integrations"
import { requireWorkspaceRole } from "@/models/workspaces"
import { notFound } from "next/navigation"

/** Finance is the workspace's ledger surface — a first-class destination alongside Documents and
 * Worksheets, not a side "Accounting" utility. Named Finance rather than Accounting because the roadmap
 * is a hub: the in-house Bigcapital ledger today, external integrations (Xero, QuickBooks, banking,
 * tax) tomorrow. "Accounting" would sound like a lightweight duplicate of a category the vendors
 * own; Finance names the user's job. Route moved from /accounting; old URL redirects here. */
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

  // Same "pushable" gate PushToAccountingCard uses on a single document: an active connection with
  // a default expense account chosen. No point loading the ready list otherwise — nothing could push.
  const pushable = connection?.status === "active" && !!connection.defaultExpenseAccountId
  const [readyResult, inferredMap, explicitMappings] = pushable
    ? await Promise.all([listReadyToPushDocuments(workspaceId, connection.id), getCategoryAccountMap(workspaceId, connection.id), listCategoryAccountMappings(workspaceId, connection.id)])
    : [{ documents: [], droppedCount: 0 }, {}, []]
  const { documents: readyToPush, droppedCount: notPushableCount } = readyResult
  const categoryAccountMap = { ...inferredMap }
  for (const m of explicitMappings) { categoryAccountMap[m.category] = m.accountExternalId }

  return <main className="space-y-8">
    {error && <AccountingErrorBanner workspaceId={workspaceId} error={error} isOwner={membership.role === "owner"} />}
    <header className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Finance</h1>
        <p className="mt-1 text-sm text-slate-500">Your workspace&apos;s ledger and integrations — coded accounts and vendors, ready for documents to push into. More integrations coming.</p>
        {membership.role !== "owner" && <p className="mt-2 text-xs text-slate-400">Only workspace owners can manage this connection.</p>}
      </div>
      {connection?.status === "active" && connection.externalTenantId && (
        <a
          href={`/api/accounting/session?workspaceId=${workspaceId}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
          Open ledger
        </a>
      )}
    </header>
    <AccountingDashboard
      workspaceId={workspaceId}
      isOwner={membership.role === "owner"}
      apiBase={config.integrations.bigcapital.apiBase}
      connection={connection}
      job={job}
      lastSyncedAt={lastSyncedAt}
      entityCounts={entityCounts}
      readyToPush={readyToPush}
      notPushableCount={notPushableCount}
      categoryAccountMap={categoryAccountMap}
    />
  </main>
}
