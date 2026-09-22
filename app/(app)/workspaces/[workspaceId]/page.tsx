import config from "@/lib/config"
import { redirect } from "next/navigation"

/** Workspace home (CONTEXT.md): opening a workspace lands on the Invoices queue — the work, not a
 * summary of it (#237, executed on #238). The old overview survives one release at /dashboard
 * behind DASHBOARD_LANDING=dashboard, which also makes it the landing for that deployment. */
export default async function WorkspaceHomePage({ params, searchParams }: { params: Promise<{ workspaceId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { workspaceId } = await params
  const { notice, name } = await searchParams
  const noticeQuery = typeof notice === "string" && typeof name === "string" ? `?notice=${notice}&name=${encodeURIComponent(name)}` : ""
  redirect(`/workspaces/${workspaceId}/${config.workspace.dashboardLanding ? "dashboard" : "invoices"}${noticeQuery}`)
}
