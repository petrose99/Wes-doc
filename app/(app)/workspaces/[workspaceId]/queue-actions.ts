"use server"

import { getCurrentUser } from "@/lib/auth"
import { DocumentDetailPage } from "./documents/[documentId]/page"
import { getSelectionAuditPanelDataAction } from "./actions"
import { requireMember } from "./action-helpers"

/** #225: the Queue screen's Detail pane content — the same split pane the standalone route
 * renders, in embedded mode, with the Approval / Audit / Checks history loaded alongside so the
 * pane's tab strip is one strip. Returns null (not a throw) for a member-less caller so the pane
 * can say so instead of the route error boundary taking the whole queue down.
 *
 * Its own module, with a *static* import of the page: a server action may return JSX, but every
 * client component in that JSX has to be reachable from the route's module graph for the RSC
 * bundler to list it in the client manifest. #215's `import()` inside actions.ts only worked
 * while some other compiled route happened to have pulled `SplitPane` in. */
export async function getQueueDetailAction(workspaceId: string, documentId: string) {
  const user = await getCurrentUser()
  if (!(await requireMember(workspaceId, user.id))) return null
  const history = await getSelectionAuditPanelDataAction(workspaceId, documentId)
  return DocumentDetailPage({
    params: Promise.resolve({ workspaceId, documentId }),
    searchParams: Promise.resolve({}),
    embedded: true,
    history,
  })
}
