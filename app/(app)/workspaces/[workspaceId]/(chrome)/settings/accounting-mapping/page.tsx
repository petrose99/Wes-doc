import { CategoryAccountMappingTable } from "@/components/settings/category-account-mapping-table"
import { getCurrentUser } from "@/lib/auth"
import config from "@/lib/config"
import { listCategoryAccountMappings } from "@/models/category-account-mappings"
import { listWorkspaceIntegrationConnections } from "@/models/integrations"
import { listAccountingEntities } from "@/models/accounting-entities"
import { listLibraryFacets } from "@/models/library-facets"
import { resolveAccountOptions } from "@/lib/automation/account-options"
import { requireWorkspaceRole } from "@/models/workspaces"
import { notFound } from "next/navigation"

export default async function AccountingMappingPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  if (!config.integrations.enabled) notFound()
  const { workspaceId } = await params
  const user = await getCurrentUser()
  const membership = await requireWorkspaceRole(workspaceId, user.id)

  const connections = await listWorkspaceIntegrationConnections(workspaceId)
  const activeConnection = connections.find((c) => c.status === "active")
  if (!activeConnection) notFound()

  const [mappings, entities, facets] = await Promise.all([
    listCategoryAccountMappings(activeConnection.id),
    listAccountingEntities(workspaceId, "account"),
    listLibraryFacets(workspaceId),
  ])

  const accountOptions = resolveAccountOptions(entities.map((e) => ({ code: e.externalId ?? e.code, name: e.name })))
  const categories = facets.categories.map((c) => c.value)

  return <main className="space-y-6">
    <header>
      <h1 className="text-3xl font-bold">Account mapping</h1>
      <p className="mt-1 text-muted-foreground">Map document categories to specific expense or income accounts in your accounting system.</p>
      {membership.role !== "owner" && <p className="mt-2 text-sm text-muted-foreground">Only workspace owners can change these.</p>}
    </header>
    <CategoryAccountMappingTable
      workspaceId={workspaceId}
      connectionId={activeConnection.id}
      mappings={mappings}
      accountOptions={accountOptions}
      categories={categories}
      isOwner={membership.role === "owner"}
    />
  </main>
}
