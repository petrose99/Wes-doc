import { AdminPage } from "@/components/admin/admin-ui"
import { Panel } from "@/components/automation/automation-ui"
import { WorkspaceDangerZone } from "@/components/workspace/danger-zone"
import { InvitePanel } from "@/components/workspace/invite-panel"
import { MembersTable } from "@/components/workspace/members-table"
import { getAdminContext } from "@/lib/admin/context"
import { getWorkspaceMode, listWorkspaceInvitations } from "@/models/workspaces"

export const dynamic = "force-dynamic"

/** #231 Q14 (#252): Admin › Users — this company's members and invitations (the org-level list
 * on the Queue-screen shell is #254's; without an organization the same address shows this
 * company's people). The "firm / SMB mode" pill is gone: the fact it stood for is one sentence
 * under the title. */
export default async function UsersPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  const context = await getAdminContext(workspaceId)
  const { owner, members, membership, user, workspace } = context
  const [invitations, mode] = await Promise.all([owner ? listWorkspaceInvitations(workspaceId) : Promise.resolve([]), getWorkspaceMode(workspaceId)])
  const modeSentence = mode === "firm"
    ? "At least one reviewer is on the team, so close needs a reviewer's sign-off."
    : "No reviewer yet, so the owner signs off on close."

  return <AdminPage title="Users" intro={<>People with access to {workspace.name}. Owners manage access; reviewers sign off on close; members upload, review, search and export. {modeSentence}</>}>
    <Panel title="Members" note={`${members.length} ${members.length === 1 ? "person has" : "people have"} access.`}>
      <MembersTable
        workspaceId={workspaceId}
        workspaceKind={workspace.kind}
        viewerId={user.id}
        viewerRole={membership.role}
        members={members.map((member) => ({ userId: member.userId, name: member.user.name, email: member.user.email, role: member.role }))} />
    </Panel>

    {owner && <Panel title="Invitations" note="An invitation expires seven days after it is sent. Resending issues a fresh link and invalidates the previous one.">
      <InvitePanel workspaceId={workspaceId} invitations={invitations.map((invitation) => ({ id: invitation.id, email: invitation.email, role: invitation.role, expiresAt: invitation.expiresAt.toISOString() }))} />
    </Panel>}

    <WorkspaceDangerZone workspaceId={workspaceId} workspaceName={workspace.name} workspaceKind={workspace.kind} viewerRole={membership.role} />
  </AdminPage>
}
