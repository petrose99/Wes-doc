-- Ticket #95: Close lifecycle — Close/CloseItem models + open/lock/reopen actions.
-- Part of map #35 (Touchless AP + accounting worksheets), executing decision #42 "Close
-- checklist worksheet v1 contents". Persistence + lifecycle only; the item-set descriptors
-- live in lib/close/item-sets.ts as data, and item-state computation is #96.

-- Close = one monthly close for one workspace. Period identity is (year, month); the
-- vatPeriodEnd flag is stamped at open time from the jurisdiction pack's `filings` topic
-- (see lib/close/actions.ts::openClose). packCode + packVersion + lockSnapshot are the
-- lock-time snapshot the ticket asks for; #79 will extend `lockSnapshot` with
-- workspaceModeAtLock + reviewerOfRecord — the JSON column is the extension point.
CREATE TABLE "closes" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "period_year" INTEGER NOT NULL,
    "period_month" INTEGER NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'open',
    "vat_period_end" BOOLEAN NOT NULL DEFAULT false,
    "pack_code" TEXT,
    "pack_version" TEXT,
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "opened_by_id" UUID,
    "locked_at" TIMESTAMP(3),
    "locked_by_id" UUID,
    "last_reopened_at" TIMESTAMP(3),
    "last_reopened_by_id" UUID,
    "reopen_reason" TEXT,
    "lock_snapshot" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "closes_pkey" PRIMARY KEY ("id")
);

-- One close per (workspace, year, month). Reopen doesn't create a new row, it flips state
-- back to 'open'; the audit trail (audit_events) is the sequence-of-events source of truth.
CREATE UNIQUE INDEX "closes_workspace_id_period_year_period_month_key"
    ON "closes"("workspace_id", "period_year", "period_month");
CREATE INDEX "closes_workspace_id_state_idx"
    ON "closes"("workspace_id", "state");

ALTER TABLE "closes"
    ADD CONSTRAINT "closes_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "closes"
    ADD CONSTRAINT "closes_opened_by_id_fkey"
    FOREIGN KEY ("opened_by_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "closes"
    ADD CONSTRAINT "closes_locked_by_id_fkey"
    FOREIGN KEY ("locked_by_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "closes"
    ADD CONSTRAINT "closes_last_reopened_by_id_fkey"
    FOREIGN KEY ("last_reopened_by_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- One CloseItem = one line on the close checklist for that period. `kind` selects the
-- descriptor from lib/close/item-sets.ts (bank-recon, ap-aging, unposted-bill-accruals,
-- vat-workpaper, cross-border-review). Computation of `computed_value` is #96;
-- signed_by/signed_at is #97 (this ticket persists the columns so the sign-off surface has
-- somewhere to write). `re_sign_required` is flipped on reopenClose so #97 can force a
-- fresh sign-off.
CREATE TABLE "close_items" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "close_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "soft_delta" BOOLEAN NOT NULL DEFAULT false,
    "state" TEXT NOT NULL DEFAULT 'pending',
    "re_sign_required" BOOLEAN NOT NULL DEFAULT false,
    "computed_at" TIMESTAMP(3),
    "computed_value" JSONB,
    "signed_at" TIMESTAMP(3),
    "signed_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "close_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "close_items_close_id_kind_key"
    ON "close_items"("close_id", "kind");
CREATE INDEX "close_items_workspace_id_idx"
    ON "close_items"("workspace_id");

ALTER TABLE "close_items"
    ADD CONSTRAINT "close_items_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "close_items"
    ADD CONSTRAINT "close_items_close_id_fkey"
    FOREIGN KEY ("close_id") REFERENCES "closes"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "close_items"
    ADD CONSTRAINT "close_items_signed_by_id_fkey"
    FOREIGN KEY ("signed_by_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS: workspace isolation, mirroring the warn_checks / gates pattern. FORCE so the app
-- role (also the table owner) doesn't bypass — see 20260906150000_force_rls_on_new_tables.
ALTER TABLE "closes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "closes" FORCE ROW LEVEL SECURITY;
CREATE POLICY "closes_workspace_isolation" ON "closes"
    USING ("workspace_id" = app_current_workspace())
    WITH CHECK ("workspace_id" = app_current_workspace());

ALTER TABLE "close_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "close_items" FORCE ROW LEVEL SECURITY;
CREATE POLICY "close_items_workspace_isolation" ON "close_items"
    USING ("workspace_id" = app_current_workspace())
    WITH CHECK ("workspace_id" = app_current_workspace());
