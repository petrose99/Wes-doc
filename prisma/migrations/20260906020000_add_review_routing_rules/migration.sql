-- Review routing rules: auto-assign review tasks based on document attributes
CREATE TABLE "review_routing_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "matcher" JSONB NOT NULL,
    "assignee_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "review_routing_rules_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "review_routing_rules_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "review_routing_rules_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "review_routing_rules_workspace_id_is_active_idx" ON "review_routing_rules"("workspace_id", "is_active");

-- RLS
ALTER TABLE "review_routing_rules" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "review_routing_rules_workspace_isolation" ON "review_routing_rules"
    USING ("workspace_id" = current_setting('app.workspace_id', true)::uuid);
