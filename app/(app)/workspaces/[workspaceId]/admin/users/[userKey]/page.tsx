import { UsersScreen } from "../page"

export const dynamic = "force-dynamic"

/** #286: a deep link to one person opens Admin › Users with that row selected and the pane open —
 * the same screen, not a separate page (the Queue-screen convention, #225). `userKey` is
 * `u:<userId>` or `inv:<invitationId>` for a pending invitation (spec §2: never the email in the URL). */
export default async function UserDeepLinkPage({ params }: { params: Promise<{ workspaceId: string; userKey: string }> }) {
  const { workspaceId, userKey } = await params
  return UsersScreen({ params: Promise.resolve({ workspaceId }), selectedId: decodeURIComponent(userKey) })
}
