-- #207: institutions (bank/financial institution a person asserts a bank_statement belongs to)
-- + saved layout for drift detection, plus the assertion column on documents.
CREATE TABLE "institutions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "normalized_key" TEXT NOT NULL,
    "saved_layout" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "institutions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "institutions_workspace_id_idx" ON "institutions"("workspace_id");
CREATE UNIQUE INDEX "institutions_workspace_id_normalized_key_key" ON "institutions"("workspace_id", "normalized_key");

ALTER TABLE "institutions" ADD CONSTRAINT "institutions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "documents" ADD COLUMN "institution_id" UUID;
CREATE INDEX "documents_institution_id_idx" ON "documents"("institution_id");
ALTER TABLE "documents" ADD CONSTRAINT "documents_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
