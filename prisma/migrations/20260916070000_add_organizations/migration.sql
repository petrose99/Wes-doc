-- #254 (Wayfinder map #226): ADR 0002 — the Workspace is the Company; an Organization groups
-- Workspaces above it for the accountant running several clients. Additive only: Workspace gains
-- a nullable organization_id, and membership in an Organization never itself grants entity
-- access — WorkspaceMember stays the only access grant. WorkspaceInvitationGrant lets one
-- invitation seed WorkspaceMember rows in more than one workspace.
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "organization_members" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organization_members_organization_id_user_id_key" ON "organization_members"("organization_id", "user_id");
CREATE INDEX "organization_members_user_id_idx" ON "organization_members"("user_id");

ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workspaces" ADD COLUMN "organization_id" UUID;

ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "workspace_invitation_grants" (
    "id" UUID NOT NULL,
    "invitation_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',

    CONSTRAINT "workspace_invitation_grants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workspace_invitation_grants_invitation_id_workspace_id_key" ON "workspace_invitation_grants"("invitation_id", "workspace_id");
CREATE INDEX "workspace_invitation_grants_workspace_id_idx" ON "workspace_invitation_grants"("workspace_id");

ALTER TABLE "workspace_invitation_grants" ADD CONSTRAINT "workspace_invitation_grants_invitation_id_fkey" FOREIGN KEY ("invitation_id") REFERENCES "workspace_invitations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workspace_invitation_grants" ADD CONSTRAINT "workspace_invitation_grants_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
