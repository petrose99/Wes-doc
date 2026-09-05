-- Add policy_text column to workspace_automation_configs
ALTER TABLE "workspace_automation_configs" ADD COLUMN "policy_text" TEXT;
