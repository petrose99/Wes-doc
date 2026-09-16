-- #253: the workspace's default approval flow, and the people who may override a mismatch.
--
-- Both columns are additive and default to "off": a NULL default_approval_workflow_id means
-- approvals still start by hand (the behaviour every existing workspace has today), and an empty
-- po_mismatch_approver_ids means "the current stage's approver", which is the any-member rule
-- overrideGateAction already applied. No existing row changes behaviour on deploy.

ALTER TABLE "workspaces"
  ADD COLUMN "default_approval_workflow_id" UUID,
  ADD COLUMN "po_mismatch_approver_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];

-- SET NULL, not CASCADE: deleting the flow turns auto-start off. Cascading would delete the
-- workspace, which is catastrophically wrong for a settings pointer.
ALTER TABLE "workspaces"
  ADD CONSTRAINT "workspaces_default_approval_workflow_id_fkey"
  FOREIGN KEY ("default_approval_workflow_id") REFERENCES "approval_workflows"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "workspaces_default_approval_workflow_id_idx"
  ON "workspaces"("default_approval_workflow_id");
