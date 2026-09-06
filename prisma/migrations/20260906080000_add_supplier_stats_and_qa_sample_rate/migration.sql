-- AlterTable: A1.1 rolling stats for per-supplier confidence step-down / cold-start
ALTER TABLE "suppliers" ADD COLUMN "consecutive_clean" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "suppliers" ADD COLUMN "touchless_seen" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: A1.3 QA sample rate on the workspace automation config
ALTER TABLE "workspace_automation_configs" ADD COLUMN "qa_sample_rate" DOUBLE PRECISION NOT NULL DEFAULT 0.05;
