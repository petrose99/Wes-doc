-- #458 (ADR 0014): line Tax code, Tax basis and Tracking. Additive and nullable; holds every column
-- the ticket adds. New AccountingEntity.entity_type values (tracking_option, location, customer)
-- need no DDL — the column is a plain string.
ALTER TABLE "integration_connections" ADD COLUMN "ledger_capabilities" JSONB;
ALTER TABLE "integration_connections" ADD COLUMN "ledger_capabilities_read_at" TIMESTAMP(3);

ALTER TABLE "accounting_entities" ADD COLUMN "parent_external_id" TEXT;
ALTER TABLE "accounting_entities" ADD COLUMN "parent_name" TEXT;
ALTER TABLE "accounting_entities" ADD COLUMN "tax_rate_percent" DECIMAL(7,4);
ALTER TABLE "accounting_entities" ADD COLUMN "for_purchases" BOOLEAN;
ALTER TABLE "accounting_entities" ADD COLUMN "default_tax_code" TEXT;

ALTER TABLE "supplier_account_rules" ADD COLUMN "tax_code_external_id" TEXT;
ALTER TABLE "supplier_account_rules" ADD COLUMN "tracking" JSONB;
ALTER TABLE "supplier_account_rules" ADD COLUMN "location_external_id" TEXT;
