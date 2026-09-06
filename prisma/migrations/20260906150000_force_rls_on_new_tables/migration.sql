-- A9.1: FORCE ROW LEVEL SECURITY on every workspace-scoped table added since the original
-- 20260822010000 rollout. Without FORCE, the table owner (the DB role Prisma connects as)
-- bypasses the policy — a superuser session sees every row across every workspace. FORCE
-- makes the policy apply to the owner too. Idempotent (ENABLE + FORCE are both no-ops when
-- already on).
DO $$
DECLARE
  target text;
  tables text[] := ARRAY[
    'bank_match_memory',
    'document_matches',
    'golden_documents',
    'inbound_email_intakes',
    'review_routing_rules',
    'reviewer_activity',
    'supplier_aliases',
    'supplier_merge_events',
    'suppliers',
    'workspace_budgets'
  ];
BEGIN
  FOREACH target IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', target);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', target);
  END LOOP;
END $$;
