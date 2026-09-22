-- Wayfinder map #226, ticket #295: expense-claim payments. Mirrors invoice_payments
-- (see its own migration/comment) but against expense_claims. Additive and reversible:
-- one new table plus a nullable expenseClaimId column on payment_run_items so a claim
-- can be batched the same way a bill is.

-- payment_run_items: allow a claim row alongside the existing document row
ALTER TABLE "payment_run_items" ADD COLUMN "expense_claim_id" UUID;
ALTER TABLE "payment_run_items" ADD CONSTRAINT "payment_run_items_expense_claim_id_fkey" FOREIGN KEY ("expense_claim_id") REFERENCES "expense_claims"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "payment_run_items_workspace_id_expense_claim_id_active_key" ON "payment_run_items"("workspace_id", "expense_claim_id", "active");

-- Expense claim payment records
CREATE TABLE "expense_claim_payments" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "claim_id" UUID NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency_code" TEXT NOT NULL,
    "paid_on" DATE NOT NULL,
    "method" TEXT NOT NULL,
    "batch_id" UUID,
    "reference" TEXT,
    "recorded_by_id" UUID,
    "removed_at" TIMESTAMP(3),
    "removed_by_id" UUID,
    "removed_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "expense_claim_payments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "expense_claim_payments_workspace_id_claim_id_idx" ON "expense_claim_payments"("workspace_id", "claim_id");
CREATE INDEX "expense_claim_payments_workspace_id_batch_id_idx" ON "expense_claim_payments"("workspace_id", "batch_id");
ALTER TABLE "expense_claim_payments" ADD CONSTRAINT "expense_claim_payments_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "expense_claim_payments" ADD CONSTRAINT "expense_claim_payments_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "expense_claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "expense_claim_payments" ADD CONSTRAINT "expense_claim_payments_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "payment_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "expense_claim_payments" ADD CONSTRAINT "expense_claim_payments_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "expense_claim_payments" ADD CONSTRAINT "expense_claim_payments_removed_by_id_fkey" FOREIGN KEY ("removed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
