-- Ticket #54: supplier-trust gate 4/6 (#40).
--
-- Adds the verified-supplier signal (Supplier.verified_at + verified_by_id) and the
-- workspace-tunable trust threshold (WorkspaceAutomationConfig.supplier_trust_threshold).
-- Newcomers start unverified; a workspace admin verifies through the exception chip's
-- inline-verify affordance, or bulk-verify from the settings surface.

ALTER TABLE "suppliers"
  ADD COLUMN "verified_at" TIMESTAMP(3),
  ADD COLUMN "verified_by_id" UUID;

ALTER TABLE "suppliers"
  ADD CONSTRAINT "suppliers_verified_by_id_fkey"
  FOREIGN KEY ("verified_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "workspace_automation_configs"
  ADD COLUMN "supplier_trust_threshold" JSONB NOT NULL DEFAULT '{"amount":500}';
