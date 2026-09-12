-- Workspace jurisdiction picker (#49): adds nullable jurisdiction_code + jurisdiction_pack_version
-- and renames the always-on `tax-profiles` finance module to `jurisdiction` in-place (existing
-- WorkspaceModule rows are re-keyed so runtime capability resolution keeps working).

ALTER TABLE "workspaces"
  ADD COLUMN "jurisdiction_code"         TEXT,
  ADD COLUMN "jurisdiction_pack_version" TEXT;

-- Re-key the module for any workspace that had an explicit row (kind="always" modules usually
-- resolve capabilities without a row, but existing installs may carry one). Idempotent.
UPDATE "workspace_modules" SET "module_key" = 'jurisdiction' WHERE "module_key" = 'tax-profiles';
