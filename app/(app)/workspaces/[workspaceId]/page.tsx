import config from "@/lib/config"
import { redirect } from "next/navigation"

/** Workspace home (CONTEXT.md): opening a workspace lands on the Invoices queue — the work, not a
 * summary of it (#237, executed on #238). The old overview survives one release at /dashboard
 * behind DASHBOARD_LANDING=dashboard, which also makes it the landing for that deployment. */
export default async function WorkspaceHomePage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  redirect(`/workspaces/${workspaceId}/${config.workspace.dashboardLanding ? "dashboard" : "invoices"}`)
}
