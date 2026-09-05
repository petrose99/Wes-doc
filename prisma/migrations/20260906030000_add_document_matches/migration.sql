-- CreateTable
CREATE TABLE "document_matches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "target_id" UUID NOT NULL,
    "match_type" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "discrepancies" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "resolved_at" TIMESTAMP(3),
    "resolved_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_matches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "document_matches_source_id_target_id_key" ON "document_matches"("source_id", "target_id");

-- CreateIndex
CREATE INDEX "document_matches_workspace_id_match_type_idx" ON "document_matches"("workspace_id", "match_type");

-- CreateIndex
CREATE INDEX "document_matches_workspace_id_status_idx" ON "document_matches"("workspace_id", "status");

-- AddForeignKey
ALTER TABLE "document_matches" ADD CONSTRAINT "document_matches_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_matches" ADD CONSTRAINT "document_matches_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_matches" ADD CONSTRAINT "document_matches_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_matches" ADD CONSTRAINT "document_matches_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS
ALTER TABLE "document_matches" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_isolation" ON "document_matches"
  USING ("workspace_id" = current_setting('app.current_workspace_id', true)::uuid);
