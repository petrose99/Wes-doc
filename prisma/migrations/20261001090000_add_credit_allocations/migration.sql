-- #463 (Wayfinder map #445): a credit note applied against an invoice — soft-removable, reasoned,
-- modelled directly on invoice_payments (2799 in schema.prisma) since it shares the same
-- create/void/reason/audit shape, but never touches a Payment line or record.

CREATE TABLE "credit_allocations" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "credit_note_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "created_by_id" UUID,
    "removed_at" TIMESTAMP(3),
    "removed_by_id" UUID,
    "removed_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "credit_allocations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "credit_allocations_workspace_id_invoice_id_idx" ON "credit_allocations"("workspace_id", "invoice_id");
CREATE INDEX "credit_allocations_workspace_id_credit_note_id_idx" ON "credit_allocations"("workspace_id", "credit_note_id");

ALTER TABLE "credit_allocations" ADD CONSTRAINT "credit_allocations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "credit_allocations" ADD CONSTRAINT "credit_allocations_credit_note_id_fkey" FOREIGN KEY ("credit_note_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "credit_allocations" ADD CONSTRAINT "credit_allocations_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "credit_allocations" ADD CONSTRAINT "credit_allocations_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "credit_allocations" ADD CONSTRAINT "credit_allocations_removed_by_id_fkey" FOREIGN KEY ("removed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
