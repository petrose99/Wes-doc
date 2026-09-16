import { AdminPage, ModuleOff, ReadOnlyBand } from "@/components/admin/admin-ui"
import { WarnChecksAdmin } from "@/components/settings/warn-checks-admin"
import { getAdminContext } from "@/lib/admin/context"
import { adminPaths } from "@/lib/admin/paths"
import { listWarnChecks } from "@/models/warn-checks"

export const dynamic = "force-dynamic"

/** #231 Q10/Q25 (#252): Admin › Configuration › Checks — the workspace's own warn checks (#56),
 * reachable from the nav at last (the old page was URL-only, critique H6). */
export default async function ChecksPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  const context = await getAdminContext(workspaceId)
  if (!context.capabilities.has("touchless-automation")) {
    return <AdminPage title="Checks"><ModuleOff what="Touchless automation" href={adminPaths(workspaceId).whatsOn} /></AdminPage>
  }
  const checks = await listWarnChecks(workspaceId)

  return <AdminPage title="Checks" intro="Your own soft rules. A check that fires never blocks a document — it holds it in Exceptions with the wording you give it.">
    {!context.owner && <ReadOnlyBand owners={context.owners} />}
    <WarnChecksAdmin
      workspaceId={workspaceId}
      readOnly={!context.owner}
      initial={checks.map((c) => ({
        id: c.id,
        name: c.name,
        whenExpr: c.whenExpr,
        message: c.message,
        enabled: c.enabled,
        createdAt: c.createdAt.toISOString(),
        author: c.createdBy?.name ?? c.createdBy?.email ?? "Unknown",
      }))}
    />
  </AdminPage>
}
