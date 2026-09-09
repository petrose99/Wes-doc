-- Phase 4: composite indexes powering Ditto-style blocking in lib/matching/blocking.ts.
-- Each block queries `document_field_values` by (workspace_id, field_key, value_*), so a per-column
-- composite is what actually gets used by the planner.
CREATE INDEX IF NOT EXISTS "document_field_values_workspace_id_field_key_value_number_idx"
  ON "document_field_values" ("workspace_id", "field_key", "value_number");
CREATE INDEX IF NOT EXISTS "document_field_values_workspace_id_field_key_value_date_idx"
  ON "document_field_values" ("workspace_id", "field_key", "value_date");
CREATE INDEX IF NOT EXISTS "document_field_values_workspace_id_field_key_value_text_idx"
  ON "document_field_values" ("workspace_id", "field_key", "value_text");
