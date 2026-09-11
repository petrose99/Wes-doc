-- Workspace-authored soft gate rules ("warn checks") — gate 6/6 from decision ticket #40 and
-- ticket #56. Each row is one rule the workspace declared: a predicate over a fixed field set
-- (parsed by lib/gates/warn-checks-evaluator.ts) plus a message. The warn-checks runner
-- (lib/gates/warn-checks.ts) evaluates every enabled rule on arrival and upserts a Gate row
-- per match; the Gate carries this row's id in its payload so the exception queue can render
-- the workspace's own wording. Predicates are NOT arbitrary JS — that keeps this from becoming
-- a code-injection surface and lets us reject unknown fields at save time.
CREATE TABLE "warn_checks" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "when_expr" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warn_checks_pkey" PRIMARY KEY ("id")
);

-- Admin list + runner read: "every enabled rule for this workspace".
CREATE INDEX "warn_checks_workspace_id_enabled_idx"
    ON "warn_checks"("workspace_id", "enabled");

ALTER TABLE "warn_checks"
    ADD CONSTRAINT "warn_checks_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- RESTRICT on the author: a warn check outlives its author's membership churn; deleting a user
-- who ever wrote a rule requires reassigning or deleting the rules first, so the admin console
-- can never orphan a rule whose provenance is lost.
ALTER TABLE "warn_checks"
    ADD CONSTRAINT "warn_checks_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row-Level Security via the standard app_current_workspace() helper (see the
-- add_row_level_security migration). Every workspace-scoped table shares this shape and reads
-- the app.workspace_id session var that lib/db-rls.ts's withWorkspace() SETs.
ALTER TABLE "warn_checks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "warn_checks" FORCE ROW LEVEL SECURITY;

CREATE POLICY "warn_checks_workspace_isolation" ON "warn_checks"
    USING ("workspace_id" = app_current_workspace())
    WITH CHECK ("workspace_id" = app_current_workspace());
