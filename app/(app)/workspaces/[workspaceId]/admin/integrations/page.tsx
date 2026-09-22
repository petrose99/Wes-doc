import { AdminPage, ReadOnlyBand } from "@/components/admin/admin-ui"
import { Panel } from "@/components/automation/automation-ui"
import { IntegrationsManager } from "@/components/integrations/integrations-manager"
import { CategoryAccountMappingTable } from "@/components/settings/category-account-mapping-table"
import { getAdminContext } from "@/lib/admin/context"
import { resolveAccountOptions } from "@/lib/automation/account-options"
import config from "@/lib/config"
import { WEBHOOK_EVENT_TYPES } from "@/lib/webhooks"
import { getLastSyncedAt, listAccountingEntities } from "@/models/accounting-entities"
import { listCategoryAccountMappings } from "@/models/category-account-mappings"
import { listWorkspaceApiKeys, listWorkspaceIntegrationConnections, listWorkspaceWebhookDeliveries, listWorkspaceWebhookEndpoints } from "@/models/integrations"
import { listLibraryFacets } from "@/models/library-facets"

export const dynamic = "force-dynamic"

/** #231 Q10 (#252): Admin › Integrations — the ledger connection (Finance's ConnectionCard
 * behaviour, per #248's input), API keys and webhooks, and account mapping. Absent from the nav
 * when the deployment has integrations off; a direct hit says so rather than 404. */
export default async function IntegrationsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  const context = await getAdminContext(workspaceId)
  const owner = context.owner

  if (!context.integrationsEnabled) {
    return <AdminPage title="Integrations"><p className="text-sm text-slate-600">Integrations are off on this deployment.</p></AdminPage>
  }

  const [apiKeys, endpoints, deliveries, connections] = await Promise.all([
    listWorkspaceApiKeys(workspaceId),
    listWorkspaceWebhookEndpoints(workspaceId),
    listWorkspaceWebhookDeliveries(workspaceId, 50),
    listWorkspaceIntegrationConnections(workspaceId),
  ])
  const connectionsWithSync = await Promise.all(connections.map(async (connection) => ({ ...connection, lastSyncedAt: await getLastSyncedAt(workspaceId, connection.id) })))

  const activeConnection = connections.find((c) => c.status === "connected")
  const [mappings, entities, facets] = activeConnection
    ? await Promise.all([listCategoryAccountMappings(workspaceId, activeConnection.id), listAccountingEntities(workspaceId, "account"), listLibraryFacets(workspaceId)])
    : [[], [], null]
  const accountOptions = resolveAccountOptions(entities.map((e) => ({ code: e.externalId ?? e.code, name: e.name })))
  const categories = facets ? facets.categories.map((c) => c.value) : []

  return <AdminPage title="Integrations" intro="Connect an accounting provider, manage API keys and webhooks, and map categories to accounts.">
    {!owner && <ReadOnlyBand owners={context.owners} />}

    <IntegrationsManager
      workspaceId={workspaceId}
      isOwner={owner}
      eventTypes={[...WEBHOOK_EVENT_TYPES]}
      apiKeys={apiKeys}
      endpoints={endpoints}
      deliveries={deliveries}
      nangoEnabled={config.integrations.nango.enabled}
      connections={connectionsWithSync}
    />

    <Panel title="Account mapping" note="Which expense or income account a document category posts to. A category with no row uses the connection's default expense account.">
      {activeConnection
        ? <CategoryAccountMappingTable workspaceId={workspaceId} connectionId={activeConnection.id} mappings={mappings} accountOptions={accountOptions} categories={categories} isOwner={owner} />
        : <p className="text-sm text-slate-600">Connect a ledger to map categories to its accounts.</p>}
    </Panel>
  </AdminPage>
}
