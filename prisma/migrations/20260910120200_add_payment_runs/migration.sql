-- WP-AP2: PaymentRun tracks one batch of bill payments prepared for the workspace's bank; not
-- moved by DocuBite itself. draft → sent → reconciled as the bank uploads it and ledger sync
-- matches back via the existing bank-match pipeline.
CREATE TABLE "payment_runs" (
  "id"           UUID PRIMARY KEY,
  "workspace_id" UUID NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "created_by_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "format"       TEXT NOT NULL DEFAULT 'za_eft_csv',
  "status"       TEXT NOT NULL DEFAULT 'draft',
  "item_count"   INTEGER NOT NULL DEFAULT 0,
  "totals_json"  JSONB,
  "filename"     TEXT,
  "sent_at"      TIMESTAMP(3),
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"   TIMESTAMP(3) NOT NULL
);
CREATE INDEX "payment_runs_workspace_id_status_idx" ON "payment_runs"("workspace_id", "status");
CREATE INDEX "payment_runs_workspace_id_created_at_idx" ON "payment_runs"("workspace_id", "created_at");

CREATE TABLE "payment_run_items" (
  "id"            UUID PRIMARY KEY,
  "workspace_id"  UUID NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "run_id"        UUID NOT NULL REFERENCES "payment_runs"("id") ON DELETE CASCADE,
  "document_id"   UUID REFERENCES "documents"("id") ON DELETE SET NULL,
  "supplier"      TEXT NOT NULL,
  "amount"        DECIMAL(18, 2) NOT NULL,
  "currency_code" TEXT NOT NULL,
  "reference"     TEXT NOT NULL,
  "active"        BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "payment_run_items_workspace_id_run_id_idx" ON "payment_run_items"("workspace_id", "run_id");
CREATE INDEX "payment_run_items_workspace_id_document_id_active_idx" ON "payment_run_items"("workspace_id", "document_id", "active");
