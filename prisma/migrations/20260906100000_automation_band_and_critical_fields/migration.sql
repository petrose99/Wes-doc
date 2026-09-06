-- A1.2 amount-band routing + A1.6 per-template critical fields
ALTER TABLE "workspace_automation_configs" ADD COLUMN "amount_bands" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "workspace_automation_configs" ADD COLUMN "critical_fields_by_template" JSONB NOT NULL DEFAULT '{}';
