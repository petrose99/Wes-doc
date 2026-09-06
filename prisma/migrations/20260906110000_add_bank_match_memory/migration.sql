-- A3.7: descriptor-pattern -> supplier/coding memory for bank matching.
CREATE TABLE "bank_match_memory" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "descriptor_key" TEXT NOT NULL,
  "supplier_id" UUID,
  "coding_hint" JSONB,
  "hit_count" INTEGER NOT NULL DEFAULT 1,
  "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bank_match_memory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "bank_match_memory_workspace_id_descriptor_key_key" ON "bank_match_memory"("workspace_id", "descriptor_key");
CREATE INDEX "bank_match_memory_workspace_id_hit_count_idx" ON "bank_match_memory"("workspace_id", "hit_count");
ALTER TABLE "bank_match_memory" ADD CONSTRAINT "bank_match_memory_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bank_match_memory" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_isolation" ON "bank_match_memory"
  USING ("workspace_id" = current_setting('app.current_workspace_id', true)::uuid);
