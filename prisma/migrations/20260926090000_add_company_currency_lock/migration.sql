-- #457 (ADR 0013): Company currency. New companies default to South Africa / ZAR; existing rows are
-- untouched here and moved by scripts/migrate-company-currency.ts. The lock is recorded, not
-- derived (see models/company-currency.ts); the ledger's own currency is read from the provider.
ALTER TABLE "workspaces" ALTER COLUMN "country" SET DEFAULT 'ZA';
ALTER TABLE "workspaces" ALTER COLUMN "base_currency" SET DEFAULT 'ZAR';
ALTER TABLE "workspaces" ADD COLUMN "currency_locked_at" TIMESTAMP(3);
ALTER TABLE "workspaces" ADD COLUMN "currency_lock_cause" TEXT;
ALTER TABLE "workspaces" ADD COLUMN "currency_lock_provider" TEXT;
ALTER TABLE "integration_connections" ADD COLUMN "ledger_currency" TEXT;
ALTER TABLE "integration_connections" ADD COLUMN "ledger_currency_read_at" TIMESTAMP(3);
