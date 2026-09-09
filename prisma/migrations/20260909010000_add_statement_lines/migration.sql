-- Phase 2: durable identity for one line in a bank/supplier statement so accepted BankMatches
-- survive re-extraction (the source array can reshuffle; `contentHash` is stable over the
-- normalized line content).
CREATE TABLE "statement_lines" (
  "id"             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id"   UUID NOT NULL REFERENCES "workspaces" ("id") ON DELETE CASCADE,
  "document_id"    UUID NOT NULL REFERENCES "documents" ("id") ON DELETE CASCADE,
  "line_index"     INTEGER NOT NULL,
  "content_hash"   TEXT NOT NULL,
  "txn_date"       DATE,
  "amount"         NUMERIC(18, 2),
  "currency_code"  TEXT,
  "description"    TEXT,
  "counterparty"   TEXT,
  "direction"      TEXT,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "statement_lines_document_id_content_hash_key"
  ON "statement_lines" ("document_id", "content_hash");
CREATE INDEX "statement_lines_workspace_id_txn_date_idx"
  ON "statement_lines" ("workspace_id", "txn_date");
CREATE INDEX "statement_lines_workspace_id_amount_idx"
  ON "statement_lines" ("workspace_id", "amount");

-- Match the other workspace-scoped tables' RLS posture (see 20260822010000 and the follow-ups).
DROP POLICY IF EXISTS "statement_lines_workspace_isolation" ON "statement_lines";
CREATE POLICY "statement_lines_workspace_isolation" ON "statement_lines"
  USING ("workspace_id" = app_current_workspace())
  WITH CHECK ("workspace_id" = app_current_workspace());
ALTER TABLE "statement_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "statement_lines" FORCE ROW LEVEL SECURITY;

-- Companion column on bank_matches (nullable during the transition; back-filled once
-- projectStatementLines has run on every statement).
ALTER TABLE "bank_matches" ADD COLUMN "statement_line_id" UUID;
ALTER TABLE "bank_matches" ADD CONSTRAINT "bank_matches_statement_line_id_fkey"
  FOREIGN KEY ("statement_line_id") REFERENCES "statement_lines" ("id") ON DELETE SET NULL;
CREATE INDEX "bank_matches_workspace_id_statement_line_id_idx"
  ON "bank_matches" ("workspace_id", "statement_line_id");
