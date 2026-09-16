-- #271 (Wayfinder map #226): the Approval notice — email when a stage reaches an approver, is
-- nudged, or is sent back for review. Additive only.
ALTER TABLE "users" ADD COLUMN "approval_notice_emails" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "workspace_members" ADD COLUMN "notice_last_sent_at" TIMESTAMP(3);

ALTER TABLE "review_tasks" ADD COLUMN "stage_reached_at" TIMESTAMP(3);

CREATE TABLE "approval_notices" (
    "id" UUID NOT NULL,
    "review_task_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stage_index" INTEGER NOT NULL,
    "stage_reached_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_notices_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "approval_notices_review_task_id_user_id_stage_reached_at_idx" ON "approval_notices"("review_task_id", "user_id", "stage_reached_at");

CREATE INDEX "approval_notices_workspace_id_idx" ON "approval_notices"("workspace_id");

ALTER TABLE "approval_notices" ADD CONSTRAINT "approval_notices_review_task_id_fkey" FOREIGN KEY ("review_task_id") REFERENCES "review_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "approval_notices" ADD CONSTRAINT "approval_notices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every open, workflow-attached task's stage_reached_at starts at its createdAt so the
-- sender has a clock immediately, instead of waiting for the next stage advance.
UPDATE "review_tasks" SET "stage_reached_at" = "created_at" WHERE "workflow_id" IS NOT NULL AND "current_stage_index" IS NOT NULL AND "stage_reached_at" IS NULL;
