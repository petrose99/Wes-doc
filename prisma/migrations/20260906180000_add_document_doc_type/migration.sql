-- AlterTable: add doc_type column for LLM classification
ALTER TABLE "documents" ADD COLUMN "doc_type" TEXT;

-- CreateIndex: workspace + doc_type for sheet routing and analytics queries
CREATE INDEX "documents_workspace_id_doc_type_idx" ON "documents"("workspace_id", "doc_type");
