-- #201: saved views (named, savable columns/filters/sort for a list screen). Separate table from
-- `user_list_preferences`, which stays the unwired per-user "current selection" state.
CREATE TABLE "saved_views" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "view_key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "owner_id" UUID,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "scope_to_current_user" BOOLEAN NOT NULL DEFAULT false,
    "columns" JSONB NOT NULL,
    "filters" JSONB NOT NULL,
    "sort" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "saved_views_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "saved_views_workspace_id_view_key_name_key"
  ON "saved_views" ("workspace_id", "view_key", "name");
CREATE INDEX "saved_views_workspace_id_view_key_idx" ON "saved_views" ("workspace_id", "view_key");

ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_owner_id_fkey"
  FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
