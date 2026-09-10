-- WP-AP2: named approvers per approval stage + amount threshold. approver_ids empty and
-- min_amount NULL together reproduce the historic role-only, always-applicable behavior.
ALTER TABLE "approval_workflow_stages"
  ADD COLUMN "approver_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  ADD COLUMN "min_amount"   DECIMAL(18, 2);
