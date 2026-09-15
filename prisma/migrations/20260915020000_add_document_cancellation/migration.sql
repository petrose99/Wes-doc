-- #220 (Wayfinder map 177): terminal manual invoice cancellation, independent of the ReviewTask
-- approval chain and the ledger sync. No un-cancel affordance, so no "uncancelled" state to model.
ALTER TABLE "documents" ADD COLUMN     "cancelled_at" TIMESTAMP(3),
ADD COLUMN     "cancelled_reason" TEXT,
ADD COLUMN     "cancelled_by_id" UUID;

ALTER TABLE "documents" ADD CONSTRAINT "documents_cancelled_by_id_fkey" FOREIGN KEY ("cancelled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
