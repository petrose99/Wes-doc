ALTER TABLE "workspaces" ADD COLUMN "country" TEXT NOT NULL DEFAULT 'US';
ALTER TABLE "workspaces" ADD COLUMN "base_currency" TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE "workspaces" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'UTC';
ALTER TABLE "workspaces" ADD COLUMN "fiscal_year_start" TEXT NOT NULL DEFAULT 'january';
