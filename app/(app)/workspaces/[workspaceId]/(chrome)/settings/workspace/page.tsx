import { ResetTourButton } from "@/components/onboarding/reset-tour-button"
import { WorkspaceAiToggle } from "@/components/workspace/ai-toggle"
import { WorkspaceDangerZone } from "@/components/workspace/danger-zone"
import { PoQuantityTolerance } from "@/components/workspace/po-quantity-tolerance"
import { InvitePanel } from "@/components/workspace/invite-panel"
import { MembersTable } from "@/components/workspace/members-table"
import { TeamWorkspaceForm } from "@/components/workspace/team-workspace-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getCurrentUser } from "@/lib/auth"
import { getWorkspaceMembers, getWorkspaceMode, listWorkspaceInvitations, requireWorkspaceRole } from "@/models/workspaces"

export default async function WorkspaceSettingsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  const user = await getCurrentUser()
  const membership = await requireWorkspaceRole(workspaceId, user.id)
  const members = await getWorkspaceMembers(workspaceId)
  const owner = membership.role === "owner"
  const invitations = owner ? await listWorkspaceInvitations(workspaceId) : []
  // Derived, not stored (decision #41): firm when at least one member holds reviewer role, else
  // smb. The card here is descriptive — the ceiling gate itself lives on the automation surface
  // once #76 ships.
  const mode = await getWorkspaceMode(workspaceId)

  return <main className="space-y-6">
    <header>
      <h1 className="text-3xl font-bold">Workspace</h1>
      <p className="mt-1 text-muted-foreground">{membership.workspace.name} · {membership.workspace.kind === "team" ? "Team workspace" : "Personal workspace"}</p>
    </header>

    <Card>
      <CardHeader>
        <CardTitle>Privacy</CardTitle>
        <CardDescription>Uploaded sources and reviewed data are stored for this workspace&apos;s members.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {owner ? <WorkspaceAiToggle workspaceId={workspaceId} enabled={membership.workspace.aiEnabled} /> : <p className="text-sm">AI extraction is {membership.workspace.aiEnabled ? "enabled" : "disabled"} by the workspace owner.</p>}
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Members
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide ${mode === "firm" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`} title={mode === "firm" ? "At least one member holds the reviewer role" : "No members hold the reviewer role"}>{mode} mode</span>
        </CardTitle>
        <CardDescription>Owners manage access. Reviewers sign off on close and hold the workspace in firm mode. Members can upload, review, search, and export documents. {members.length} {members.length === 1 ? "member" : "members"}.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <MembersTable
          workspaceId={workspaceId}
          workspaceKind={membership.workspace.kind}
          viewerId={user.id}
          viewerRole={membership.role}
          members={members.map((member) => ({ userId: member.userId, name: member.user.name, email: member.user.email, role: member.role }))} />
      </CardContent>
    </Card>

    {owner && <Card>
      <CardHeader>
        <CardTitle>Invitations</CardTitle>
        <CardDescription>Invitations expire seven days after they are sent. Resending issues a fresh link and invalidates the previous one.</CardDescription>
      </CardHeader>
      <CardContent>
        <InvitePanel workspaceId={workspaceId} invitations={invitations.map((invitation) => ({ id: invitation.id, email: invitation.email, role: invitation.role, expiresAt: invitation.expiresAt.toISOString() }))} />
      </CardContent>
    </Card>}

    <Card>
      <CardHeader>
        <CardTitle>Matching</CardTitle>
        <CardDescription>Controls for automated PO/invoice/receipt matching checks.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <PoQuantityTolerance workspaceId={workspaceId} percent={membership.workspace.poQuantityTolerancePercent} />
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Create a team workspace</CardTitle>
        <CardDescription>A separate workspace with its own files, members, and usage.</CardDescription>
      </CardHeader>
      <CardContent><TeamWorkspaceForm /></CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Onboarding</CardTitle>
        <CardDescription>The welcome tour introduces new users to the workspace layout.</CardDescription>
      </CardHeader>
      <CardContent>
        <ResetTourButton workspaceId={workspaceId} />
      </CardContent>
    </Card>

    <WorkspaceDangerZone workspaceId={workspaceId} workspaceName={membership.workspace.name} workspaceKind={membership.workspace.kind} viewerRole={membership.role} />
  </main>
}
