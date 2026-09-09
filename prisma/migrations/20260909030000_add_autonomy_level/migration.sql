-- Real three-level autonomy. Previously touchlessEnabled alone was written, which meant
-- "suggest" and "auto" (both touchlessEnabled=false) round-tripped as the same thing.
-- Default "auto" for existing rows: they already had touchlessEnabled=false, and the ambient
-- behavior — rules + AI code with a review gate at the end — is "auto with approval".
ALTER TABLE "workspace_automation_configs"
  ADD COLUMN "autonomy_level" TEXT NOT NULL DEFAULT 'auto';

-- Existing rows where touchlessEnabled=true were already at the "touchless" behavior.
UPDATE "workspace_automation_configs" SET "autonomy_level" = 'touchless' WHERE "touchless_enabled" = TRUE;
