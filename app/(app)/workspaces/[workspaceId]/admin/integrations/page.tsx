import { AdminPage, ReadOnlyBand } from "@/components/admin/admin-ui"
import { Panel } from "@/components/automation/automation-ui"
import { IntegrationsManager } from "@/components/integrations/integrations-manager"
import { CategoryAccountMappingTable } from "@/components/settings/category-account-mapping-table"
import { SupplierAccountsTable } from "@/components/settings/supplier-accounts-table"
import { getAdminContext } from "@/lib/admin/context"
import { resolveAccountOptions } from "@/lib/automation/account-options"
import config from "@/lib/config"
import { formatUnresolvedAccountId } from "@/lib/finance/line-account-resolution"
import { WEBHOOK_EVENT_TYPES } from "@/lib/webhooks"
import { getLastSyncedAt, listAccountingEntities, listAccountingEntitiesIncludingInactive } from "@/models/accounting-entities"
import { listCategoryAccountMappings } from "@/models/category-account-mappings"
import { countUnpostedDocuments, getCurrencyLock } from "@/models/company-currency"
import { findAccountCorrectionReminders } from "@/models/documents"
import { listWorkspaceApiKeys, listWorkspaceIntegrationConnections, listWorkspaceWebhookDeliveries, listWorkspaceWebhookEndpoints, resolveAccountNames } from "@/models/integrations"
import { listLibraryFacets } from "@/models/library-facets"
import { listSupplierAccountRules } from "@/models/supplier-account-rules"
import type { SupplierAccountReminder } from "@/components/settings/supplier-accounts-table"

export const dynamic = "force-dynamic"

// Same small map as lib/finance/actions.ts's push copy and models/documents.ts's provenance
// strings (#429) — every module that names a provider to a human keeps its own copy.
const PROVIDER_LABELS: Record<string, string> = { quickbooks: "QuickBooks", xero: "Xero", sage: "Sage" }

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

  const [apiKeys, endpoints, deliveries, connections, lock, unpostedCount] = await Promise.all([
    listWorkspaceApiKeys(workspaceId),
    listWorkspaceWebhookEndpoints(workspaceId),
    listWorkspaceWebhookDeliveries(workspaceId, 50),
    listWorkspaceIntegrationConnections(workspaceId),
    getCurrencyLock(workspaceId),
    countUnpostedDocuments(workspaceId),
  ])
  // #457 §5.4: the card compares the ledger's own currency with the Company currency.
  const company = {
    currency: context.workspace.baseCurrency,
    country: context.workspace.country,
    lock: lock.locked ? { ...lock, at: lock.at.toISOString() } : lock,
    unpostedCount,
  }
  const connectionsWithSync = await Promise.all(connections.map(async (connection) => ({ ...connection, lastSyncedAt: await getLastSyncedAt(workspaceId, connection.id) })))

  const activeConnection = connections.find((c) => c.status === "connected")
  const [mappings, entities, facets, allAccountEntities, supplierRules] = activeConnection
    ? await Promise.all([
        listCategoryAccountMappings(workspaceId, activeConnection.id),
        listAccountingEntities(workspaceId, "account"),
        listLibraryFacets(workspaceId),
        listAccountingEntitiesIncludingInactive(workspaceId, "account"),
        listSupplierAccountRules(workspaceId, activeConnection.id),
      ])
    : [[], [], null, [], []]
  const accountOptions = resolveAccountOptions(entities.map((e) => ({ code: e.externalId ?? e.code, name: e.name })))
  const categories = facets ? facets.categories.map((c) => c.value) : []
  const accountLabels = Object.fromEntries(
    allAccountEntities.map((e) => [e.externalId, { label: e.code ? `${e.code} — ${e.name}` : e.name, archived: !e.active }])
  )

  // #430 Screen 3 — one reminder per supplier still carrying posted/paid bills on an account other
  // than its rule's current one. Resolved to names here (server component, same pattern as
  // account-correction-actions.ts's `checkAffectedByRuleChangeAction`) so the table never fetches
  // just to render the line.
  let reminders: Record<string, SupplierAccountReminder> = {}
  if (activeConnection && supplierRules.length) {
    const byRule = await findAccountCorrectionReminders(workspaceId, activeConnection.id, supplierRules)
    const oldAccountIds = Array.from(new Set(Array.from(byRule.values()).map((r) => r.oldAccountExternalId)))
    const names = oldAccountIds.length ? await resolveAccountNames(activeConnection.id, oldAccountIds) : {}
    // #430 evaluate re-run finding (P2): when the provider name lookup can't resolve an id (dropped
    // from the synced chart), this used to fall back to the raw external id verbatim in the reminder
    // copy ("... still on sundry-expenses"). Format it the same way as the Screen 2 fallback option
    // (line-items-editor.tsx) rather than leaking the internal identifier.
    reminders = Object.fromEntries(
      Array.from(byRule.entries()).map(([supplierName, r]) => [supplierName, { ...r, oldAccountName: names[r.oldAccountExternalId] ?? formatUnresolvedAccountId(r.oldAccountExternalId) }])
    )
  }

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
      company={company}
    />

    <Panel title="Account mapping" note="Which expense or income account a document category posts to. A category with no row uses the connection's default expense account.">
      {activeConnection
        ? <CategoryAccountMappingTable workspaceId={workspaceId} connectionId={activeConnection.id} mappings={mappings} accountOptions={accountOptions} categories={categories} isOwner={owner} />
        : <p className="text-sm text-slate-600">Connect a ledger to map categories to its accounts.</p>}
    </Panel>

    <Panel title="Supplier accounts" note="Each supplier's usual account, learned from approved documents. Forget one to re-learn it fresh from the next approval.">
      {activeConnection
        ? <SupplierAccountsTable
            workspaceId={workspaceId}
            connectionId={activeConnection.id}
            rules={supplierRules}
            accountLabels={accountLabels}
            defaultAccountName={activeConnection.defaultExpenseAccountName}
            providerLabel={PROVIDER_LABELS[activeConnection.provider] ?? activeConnection.provider}
            isOwner={owner}
            reminders={reminders}
          />
        : <p className="text-sm text-slate-600">{"Connect a ledger to see suppliers' usual accounts."}</p>}
    </Panel>
  </AdminPage>
}
