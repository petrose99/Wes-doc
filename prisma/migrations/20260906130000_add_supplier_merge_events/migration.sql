-- A5.6: reversible supplier merges.
CREATE TABLE "supplier_merge_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "winner_id" UUID NOT NULL,
  "loser_id" UUID NOT NULL,
  "loser_snapshot" JSONB NOT NULL,
  "reverted_at" TIMESTAMP(3),
  "created_by_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supplier_merge_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "supplier_merge_events_workspace_id_winner_id_idx" ON "supplier_merge_events"("workspace_id", "winner_id");
CREATE INDEX "supplier_merge_events_workspace_id_loser_id_idx" ON "supplier_merge_events"("workspace_id", "loser_id");
ALTER TABLE "supplier_merge_events" ADD CONSTRAINT "supplier_merge_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_merge_events" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_isolation" ON "supplier_merge_events"
  USING ("workspace_id" = current_setting('app.current_workspace_id', true)::uuid);
