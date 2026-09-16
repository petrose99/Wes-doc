import { AdminPage, ReadOnlyBand } from "@/components/admin/admin-ui"
import { LedgerConnectionPanel } from "@/components/accounting/accounting-dashboard"
import { AccountingErrorBanner } from "@/components/accounting/error-banner"
import { Panel } from "@/components/automation/automation-ui"
import { IntegrationsManager } from "@/components/integrations/integrations-manager"
import { CategoryAccountMappingTable } from "@/components/settings/category-account-mapping-table"
import { getAdminContext } from "@/lib/admin/context"
import { resolveAccountOptions } from "@/lib/automation/account-options"
import config from "@/lib/config"
import { WEBHOOK_EVENT_TYPES } from "@/lib/webhooks"
import { getEntityCounts, getLastSyncedAt, listAccountingEntities } from "@/models/accounting-entities"
import { getWorkspaceProvisionJob } from "@/models/bigcapital"
import { listCategoryAccountMappings } from "@/models/category-account-mappings"
import { getWorkspaceIntegrationConnection, listWorkspaceApiKeys, listWorkspaceIntegrationConnections, listWorkspaceWebhookDeliveries, listWorkspaceWebhookEndpoints } from "@/models/integrations"
import { listLibraryFacets } from "@/models/library-facets"

export const dynamic = "force-dynamic"

/** #231 Q10 (#252): Admin › Integrations — the ledger connection (Finance's ConnectionCard
 * behaviour, per #248's input), API keys and webhooks, and account mapping. Absent from the nav
 * when the deployment has integrations off; a direct hit says so rather than 404. */
export default async function IntegrationsPage({ params, searchParams }: { params: Promise<{ workspaceId: string }>; searchParams: Promise<{ error?: string }> }) {
  const { workspaceId } = await params
  const { error } = await searchParams
  const context = await getAdminContext(workspaceId)
  const owner = context.owner

  if (!context.integrationsEnabled) {
    return <AdminPage title="Integrations"><p className="text-sm text-slate-600">Integrations are off on this deployment.</p></AdminPage>
  }

  const ledgerEnabled = config.integrations.bigcapital.enabled
  const [apiKeys, endpoints, deliveries, connections, ledger, job] = await Promise.all([
    listWorkspaceApiKeys(workspaceId),
    listWorkspaceWebhookEndpoints(workspaceId),
    listWorkspaceWebhookDeliveries(workspaceId, 50),
    listWorkspaceIntegrationConnections(workspaceId),
    ledgerEnabled ? getWorkspaceIntegrationConnection(workspaceId, "bigcapital") : Promise.resolve(null),
    ledgerEnabled ? getWorkspaceProvisionJob(workspaceId) : Promise.resolve(null),
  ])
  const [ledgerSyncedAt, entityCounts] = ledger
    ? await Promise.all([getLastSyncedAt(workspaceId, ledger.id), getEntityCounts(workspaceId, ledger.id)])
    : [null, { accounts: 0, vendors: 0 }]
  const connectionsWithSync = await Promise.all(connections.map(async (connection) => ({ ...connection, lastSyncedAt: await getLastSyncedAt(workspaceId, connection.id) })))

  const activeConnection = connections.find((c) => c.status === "active")
  const [mappings, entities, facets] = activeConnection
    ? await Promise.all([listCategoryAccountMappings(workspaceId, activeConnection.id), listAccountingEntities(workspaceId, "account"), listLibraryFacets(workspaceId)])
    : [[], [], null]
  const accountOptions = resolveAccountOptions(entities.map((e) => ({ code: e.externalId ?? e.code, name: e.name })))
  const categories = facets ? facets.categories.map((c) => c.value) : []

  return <AdminPage title="Integrations" intro="The ledger this company posts to, the API keys and webhooks that push document data into other tools, and which account each category lands in.">
    {error && <AccountingErrorBanner workspaceId={workspaceId} error={error} isOwner={owner} />}
    {!owner && <ReadOnlyBand owners={context.owners} />}

    {ledgerEnabled && <Panel title="Ledger connection" note="Every company gets its own isolated ledger organization, created automatically — nothing to connect by hand.">
      <LedgerConnectionPanel workspaceId={workspaceId} isOwner={owner} connection={ledger} job={job} lastSyncedAt={ledgerSyncedAt} entityCounts={entityCounts} />
    </Panel>}

    <IntegrationsManager
      workspaceId={workspaceId}
      isOwner={owner}
      eventTypes={[...WEBHOOK_EVENT_TYPES]}
      apiKeys={apiKeys}
      endpoints={endpoints}
      deliveries={deliveries}
      accountingProviders={{ quickbooks: config.integrations.quickbooks.enabled, xero: config.integrations.xero.enabled }}
      connections={connectionsWithSync}
    />

    <Panel title="Account mapping" note="Which expense or income account a document category posts to. A category with no row uses the connection's default expense account.">
      {activeConnection
        ? <CategoryAccountMappingTable workspaceId={workspaceId} connectionId={activeConnection.id} mappings={mappings} accountOptions={accountOptions} categories={categories} isOwner={owner} />
        : <p className="text-sm text-slate-600">Connect a ledger to map categories to its accounts.</p>}
    </Panel>
  </AdminPage>
}
