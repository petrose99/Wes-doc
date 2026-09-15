import { getCurrentUser } from "@/lib/auth"
import { requireWorkspaceRole } from "@/models/workspaces"
import { DocumentDetailPage } from "@/app/(app)/workspaces/[workspaceId]/documents/[documentId]/page"

/** The Detail pane's content arrives from a server action (`getQueueDetailAction`) as JSX. The
 * RSC bundler only lists a client component in a route's client manifest when a server component
 * on that route's graph imports it — an action module's own imports don't count — so this layout
 * pulls the document detail page (and with it SplitPane, MatchPanel, FxConversionBadge, …) into
 * every Queue screen's graph. Referenced, never rendered here. */
const CLIENT_MANIFEST_ANCHORS = [DocumentDetailPage]

/** #225: the Queue screens (Invoices, Purchase Orders, Receipts, Bank Statements, Exceptions)
 * opt out of the (chrome) group's `max-w-4xl` reading column — that column is right for
 * settings and the standalone document page and wrong for a work queue, which fills the work
 * area beside the rail. Same membership check as (chrome); no settings tabs, no padding. */
export default async function WorkspaceQueueLayout({ children, params }: { children: React.ReactNode; params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  const user = await getCurrentUser()
  await requireWorkspaceRole(workspaceId, user.id)
  void CLIENT_MANIFEST_ANCHORS
  return <div className="flex min-h-0 flex-1 flex-col bg-white">{children}</div>
}
