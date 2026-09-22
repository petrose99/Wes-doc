-- ADR 0005 (map #376, ticket #396): Nango owns the Ledger connection's auth; DocuBite stores no
-- provider token. Every pre-Nango IntegrationConnection row is Bigcapital-era demo/test data (no
-- pilot firm exists yet — see the ADR's "Cutover" section), so this migration deletes them rather
-- than migrating tokens: there is no real customer grant to preserve continuity for.

-- Drop dependent rows first so the FK changes below have nothing to violate.
DELETE FROM "integration_pushes";
DELETE FROM "ledger_transactions";
DELETE FROM "category_account_mappings" WHERE "connection_id" IS NOT NULL;
DELETE FROM "accounting_entities" WHERE "connection_id" IS NOT NULL;
DELETE FROM "integration_connections";

-- IntegrationConnection: drop the token/expiry/scope columns Nango now owns; add providerConfigKey.
ALTER TABLE "integration_connections"
  DROP COLUMN "access_token_enc",
  DROP COLUMN "refresh_token_enc",
  DROP COLUMN "access_token_expires_at",
  DROP COLUMN "refresh_token_expires_at",
  DROP COLUMN "scope",
  ADD COLUMN "provider_config_key" TEXT NOT NULL DEFAULT 'quickbooks';

ALTER TABLE "integration_connections" ALTER COLUMN "provider_config_key" DROP DEFAULT;
ALTER TABLE "integration_connections" ALTER COLUMN "status" SET DEFAULT 'connected';

-- IntegrationPush / LedgerTransaction: connection_id becomes nullable so a disconnect leaves the
-- push/audit-trail row behind instead of cascading it away (ADR 0005, "Disconnect while a post is
-- queued"). Drop and recreate the FK with onDelete SetNull.
ALTER TABLE "integration_pushes" DROP CONSTRAINT "integration_pushes_connection_id_fkey";
ALTER TABLE "integration_pushes" ALTER COLUMN "connection_id" DROP NOT NULL;
ALTER TABLE "integration_pushes"
  ADD CONSTRAINT "integration_pushes_connection_id_fkey"
  FOREIGN KEY ("connection_id") REFERENCES "integration_connections"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ledger_transactions" DROP CONSTRAINT "ledger_transactions_connection_id_fkey";
ALTER TABLE "ledger_transactions" ALTER COLUMN "connection_id" DROP NOT NULL;
ALTER TABLE "ledger_transactions"
  ADD CONSTRAINT "ledger_transactions_connection_id_fkey"
  FOREIGN KEY ("connection_id") REFERENCES "integration_connections"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
