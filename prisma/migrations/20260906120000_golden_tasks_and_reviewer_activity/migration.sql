-- A4.4 golden-task injection + A4.6 reviewer-quality analytics.
CREATE TABLE "golden_documents" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "document_id" UUID NOT NULL,
  "expected_values" JSONB NOT NULL,
  "planted_errors" JSONB NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "golden_documents_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "golden_documents_document_id_key" ON "golden_documents"("document_id");
CREATE INDEX "golden_documents_workspace_id_is_active_idx" ON "golden_documents"("workspace_id", "is_active");
ALTER TABLE "golden_documents" ADD CONSTRAINT "golden_documents_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "golden_documents" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_isolation" ON "golden_documents"
  USING ("workspace_id" = current_setting('app.current_workspace_id', true)::uuid);

CREATE TABLE "reviewer_activity" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "reviewer_id" UUID NOT NULL,
  "document_id" UUID,
  "golden_id" UUID,
  "outcome" TEXT NOT NULL,
  "field_count" INTEGER NOT NULL DEFAULT 0,
  "duration_ms" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reviewer_activity_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "reviewer_activity_workspace_id_reviewer_id_created_at_idx" ON "reviewer_activity"("workspace_id", "reviewer_id", "created_at");
CREATE INDEX "reviewer_activity_workspace_id_outcome_idx" ON "reviewer_activity"("workspace_id", "outcome");
ALTER TABLE "reviewer_activity" ADD CONSTRAINT "reviewer_activity_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reviewer_activity" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_isolation" ON "reviewer_activity"
  USING ("workspace_id" = current_setting('app.current_workspace_id', true)::uuid);
