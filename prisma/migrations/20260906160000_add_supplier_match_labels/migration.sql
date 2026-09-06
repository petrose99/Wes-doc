-- A5.9 active-learning: reviewer labels for supplier resolution.
CREATE TABLE "supplier_match_labels" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "pair_id" TEXT NOT NULL,
  "same_supplier" BOOLEAN NOT NULL,
  "score" DOUBLE PRECISION NOT NULL,
  "labelled_by_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "supplier_match_labels_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "supplier_match_labels_workspace_id_pair_id_key" ON "supplier_match_labels"("workspace_id", "pair_id");
CREATE INDEX "supplier_match_labels_workspace_id_same_supplier_idx" ON "supplier_match_labels"("workspace_id", "same_supplier");
ALTER TABLE "supplier_match_labels" ADD CONSTRAINT "supplier_match_labels_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_match_labels" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "supplier_match_labels" FORCE ROW LEVEL SECURITY;
CREATE POLICY "supplier_match_labels_workspace_isolation" ON "supplier_match_labels"
  USING ("workspace_id" = app_current_workspace()) WITH CHECK ("workspace_id" = app_current_workspace());
