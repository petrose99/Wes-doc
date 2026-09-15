-- #210 (Wayfinder map 177): Exceptions queue lifecycle for an escalated check. Not a Gate row —
-- Gate is unique per (documentId, gateType), one row per document per runner, which can't express
-- "one row per escalated check" when a document has several escalated checks at once.
ALTER TABLE "document_check_results" ADD COLUMN     "escalation_assignee_id" UUID,
ADD COLUMN     "escalation_resolution" TEXT,
ADD COLUMN     "escalation_resolution_note" TEXT,
ADD COLUMN     "escalation_resolved_at" TIMESTAMP(3),
ADD COLUMN     "escalation_resolved_by_id" UUID,
ADD COLUMN     "escalation_status" TEXT;

CREATE INDEX "document_check_results_workspace_id_escalation_status_idx" ON "document_check_results"("workspace_id", "escalation_status");

ALTER TABLE "document_check_results" ADD CONSTRAINT "document_check_results_escalation_assignee_id_fkey" FOREIGN KEY ("escalation_assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "document_check_results" ADD CONSTRAINT "document_check_results_escalation_resolved_by_id_fkey" FOREIGN KEY ("escalation_resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
