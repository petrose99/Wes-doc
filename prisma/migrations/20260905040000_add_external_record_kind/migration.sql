-- Phase C: track whether an integration push created a bill or a sale invoice
ALTER TABLE integration_pushes ADD COLUMN external_record_kind TEXT;
