-- WP-AP2: per-supplier net payment terms (days). Feeds AP aging's due-date inference when the
-- extracted invoice has no explicit due_date. Null = no default.
ALTER TABLE "suppliers"
  ADD COLUMN "payment_terms_days" INTEGER;
