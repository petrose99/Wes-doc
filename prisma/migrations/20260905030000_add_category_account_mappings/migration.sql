-- Phase B: explicit category-to-account mappings for accounting push
CREATE TABLE category_account_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES integration_connections(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'expense',
  account_external_id TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (connection_id, category, kind)
);

CREATE INDEX idx_category_account_mappings_workspace ON category_account_mappings(workspace_id);
