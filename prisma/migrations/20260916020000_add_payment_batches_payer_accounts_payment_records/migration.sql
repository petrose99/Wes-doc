-- #229 / #251 (Wayfinder map #226): the Payments destination. Every change is additive and
-- reversible — new nullable columns on payment_runs (the Payment batch) and suppliers (early-
-- payment discount), and three new tables: payer_accounts (Pay From), invoice_payments (Payment
-- records, ADR 0001) and bill_pay_preferences (the row's Amount to pay / Pay From before batching).

-- Payment batch facts on payment_runs
ALTER TABLE "payment_runs" ADD COLUMN "name" TEXT;
ALTER TABLE "payment_runs" ADD COLUMN "comment" TEXT;
ALTER TABLE "payment_runs" ADD COLUMN "submitted_by_id" UUID;
ALTER TABLE "payment_runs" ADD COLUMN "approved_by_id" UUID;
ALTER TABLE "payment_runs" ADD COLUMN "approved_at" TIMESTAMP(3);
ALTER TABLE "payment_runs" ADD COLUMN "rejected_by_id" UUID;
ALTER TABLE "payment_runs" ADD COLUMN "rejected_at" TIMESTAMP(3);
ALTER TABLE "payment_runs" ADD COLUMN "rejected_reason" TEXT;
ALTER TABLE "payment_runs" ADD COLUMN "exported_at" TIMESTAMP(3);
ALTER TABLE "payment_runs" ADD COLUMN "exported_by_id" UUID;
ALTER TABLE "payment_runs" ADD COLUMN "paid_at" TIMESTAMP(3);
ALTER TABLE "payment_runs" ADD COLUMN "paid_by_id" UUID;
ALTER TABLE "payment_runs" ADD COLUMN "pay_from_account_id" UUID;
ALTER TABLE "payment_runs" ADD COLUMN "currency_code" TEXT;

-- Supplier early-payment discount beside the net terms
ALTER TABLE "suppliers" ADD COLUMN "early_payment_discount_percent" DECIMAL(5,2);
ALTER TABLE "suppliers" ADD COLUMN "early_payment_discount_days" INTEGER;

-- Payer accounts
CREATE TABLE "payer_accounts" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "bank_name" TEXT,
    "last_four" TEXT,
    "currency_code" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "payer_accounts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "payer_accounts_workspace_id_is_default_idx" ON "payer_accounts"("workspace_id", "is_default");
ALTER TABLE "payer_accounts" ADD CONSTRAINT "payer_accounts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Payment records
CREATE TABLE "invoice_payments" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
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
    CONSTRAINT "invoice_payments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "invoice_payments_workspace_id_document_id_idx" ON "invoice_payments"("workspace_id", "document_id");
CREATE INDEX "invoice_payments_workspace_id_batch_id_idx" ON "invoice_payments"("workspace_id", "batch_id");
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "payment_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_removed_by_id_fkey" FOREIGN KEY ("removed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Bill Pay row preferences
CREATE TABLE "bill_pay_preferences" (
    "document_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "amount_to_pay" DECIMAL(18,2),
    "pay_from_account_id" UUID,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "bill_pay_preferences_pkey" PRIMARY KEY ("document_id")
);
CREATE INDEX "bill_pay_preferences_workspace_id_idx" ON "bill_pay_preferences"("workspace_id");
ALTER TABLE "bill_pay_preferences" ADD CONSTRAINT "bill_pay_preferences_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bill_pay_preferences" ADD CONSTRAINT "bill_pay_preferences_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bill_pay_preferences" ADD CONSTRAINT "bill_pay_preferences_pay_from_account_id_fkey" FOREIGN KEY ("pay_from_account_id") REFERENCES "payer_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "bill_pay_preferences" ADD CONSTRAINT "bill_pay_preferences_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- payment_runs foreign keys for the new facts
ALTER TABLE "payment_runs" ADD CONSTRAINT "payment_runs_submitted_by_id_fkey" FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payment_runs" ADD CONSTRAINT "payment_runs_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payment_runs" ADD CONSTRAINT "payment_runs_rejected_by_id_fkey" FOREIGN KEY ("rejected_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payment_runs" ADD CONSTRAINT "payment_runs_exported_by_id_fkey" FOREIGN KEY ("exported_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payment_runs" ADD CONSTRAINT "payment_runs_paid_by_id_fkey" FOREIGN KEY ("paid_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payment_runs" ADD CONSTRAINT "payment_runs_pay_from_account_id_fkey" FOREIGN KEY ("pay_from_account_id") REFERENCES "payer_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
