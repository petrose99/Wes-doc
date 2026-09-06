-- A9.1 unification: every workspace-scoped policy MUST read the same session variable
-- (app.workspace_id) that lib/db-rls.ts's withWorkspace() SETs. Six recent migrations wrote
-- policies against app.current_workspace_id by mistake — those tables were never actually
-- enforced by withWorkspace. This drops and re-creates each affected policy against
-- app.workspace_id via the shared app_current_workspace() helper.
DO $$
DECLARE
  target text;
  tables text[] := ARRAY[
    'document_matches',
    'workspace_budgets',
    'suppliers', 'supplier_aliases', 'inbound_email_intakes',
    'bank_match_memory',
    'golden_documents', 'reviewer_activity',
    'supplier_merge_events'
  ];
BEGIN
  FOREACH target IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS "workspace_isolation" ON %I', target);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', target || '_workspace_isolation', target);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING ("workspace_id" = app_current_workspace()) WITH CHECK ("workspace_id" = app_current_workspace())',
      target || '_workspace_isolation', target
    );
  END LOOP;
END $$;
