-- Per-member Bigcapital credentials within the workspace's shared organization.
-- Each member gets their own Bigcapital user so the SSO bridge signs them in under
-- their own identity (audit trail, permissions) rather than the workspace-level admin.
CREATE TABLE IF NOT EXISTS "bigcapital_member_accounts" (
    "id"                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    "workspace_id"        UUID NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
    "user_id"             UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "bigcapital_user_id"  TEXT,
    "email"               TEXT NOT NULL,
    "password_enc"        TEXT NOT NULL,
    "status"              TEXT NOT NULL DEFAULT 'active',
    "created_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE ("workspace_id", "user_id")
);
