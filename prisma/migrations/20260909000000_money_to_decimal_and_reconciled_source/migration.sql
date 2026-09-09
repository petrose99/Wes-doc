-- Phase 1: money columns → numeric(18,2). Chained Float arithmetic drifts on reconciliation.
-- The USING clause rounds to 2 decimal places in the same expression Prisma would emit for a
-- Float → Decimal(18,2) migration.

ALTER TABLE "ledger_transactions"
  ALTER COLUMN "amount" TYPE numeric(18, 2) USING ROUND("amount"::numeric, 2),
  ALTER COLUMN "tax_amount" TYPE numeric(18, 2) USING ROUND("tax_amount"::numeric, 2),
  ALTER COLUMN "due_amount" TYPE numeric(18, 2) USING ROUND("due_amount"::numeric, 2),
  ALTER COLUMN "paid_amount" TYPE numeric(18, 2) USING ROUND("paid_amount"::numeric, 2);

ALTER TABLE "expense_claims"
  ALTER COLUMN "total" TYPE numeric(18, 2) USING ROUND("total"::numeric, 2);

ALTER TABLE "workspace_budgets"
  ALTER COLUMN "amount" TYPE numeric(18, 2) USING ROUND("amount"::numeric, 2);

-- Phase 5 companion column: recorded which side reconciled a ledger row. Set together with the
-- money migration so we don't churn `ALTER TABLE ledger_transactions` twice.
-- "docubite" | "provider" | NULL (never reconciled).
ALTER TABLE "ledger_transactions"
  ADD COLUMN "reconciled_source" TEXT;
