import { UsersQueue } from "@/components/admin/users-queue"
import { getAdminContext } from "@/lib/admin/context"
import { loadUsersPage } from "@/models/admin-users"

export const dynamic = "force-dynamic"

/** #286 (spec §2, §3.3): Admin › Users as a Queue screen. The current workspace decides the
 * page's state — (a) in an organization: every person in the companies the viewer is a member
 * of, plus pending invitations across the companies the viewer owns; (b) an ungrouped team
 * workspace: this company's members and invitations; (c) a personal workspace: the viewer alone.
 * Roles gate the controls, never the address. The incumbent `AdminPage` + `MembersTable` +
 * `InvitePanel` is replaced whole — its intent/confirm logic lives in the pane's Companies tab
 * (one save grammar per page, #252 P1 lesson). */
/** Also called directly by the `[userKey]` deep-link route (spec §5.4) with `selectedId` set, so
 * a link to one person (`<userId>` or `inv:<invitationId>`) opens this same screen with the pane
 * already open — the Queue-screen convention (#225), not a separate page. */
export async function UsersScreen({ params, selectedId }: { params: Promise<{ workspaceId: string }>; selectedId?: string }) {
  const { workspaceId } = await params
  const { workspace, user } = await getAdminContext(workspaceId)
  const data = await loadUsersPage(workspace, user)

  // Spec §5.4: a deep link outside the viewer's unfiltered rows (not a shared company, a revoked
  // invitation, garbage) gets the nameless notice — never a name that wasn't loaded. A row that
  // is present but hidden by the current filters is the shell's own case (it clears them).
  const selectedPresent = selectedId ? data.rows.some((row) => row.key === selectedId) : false
  const initialMissing = selectedId && !selectedPresent
    ? { text: "That person isn't in a company you're a member of." }
    : undefined
  return <UsersQueue workspaceId={workspaceId} data={data}
    initialSelectedId={selectedPresent ? selectedId : null} initialMissing={initialMissing} />
}

export default function UsersPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  return UsersScreen({ params })
}
