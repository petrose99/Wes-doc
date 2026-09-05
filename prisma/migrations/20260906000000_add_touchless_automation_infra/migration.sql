-- Milestone 0: Touchless automation shared infrastructure

-- 1. Document readiness columns
ALTER TABLE "documents" ADD COLUMN "readiness_status" TEXT;
ALTER TABLE "documents" ADD COLUMN "readiness_detail" JSONB;
ALTER TABLE "documents" ADD COLUMN "ready_at" TIMESTAMP(3);

-- 2. AgentVerdict: cached LLM verdicts (policy, approval-context, match-explanation)
CREATE TABLE "agent_verdicts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "agent_kind" TEXT NOT NULL,
    "subject_type" TEXT NOT NULL,
    "subject_id" UUID NOT NULL,
    "document_id" UUID,
    "verdict" TEXT NOT NULL,
    "rationale" JSONB NOT NULL,
    "model" TEXT,
    "input_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_verdicts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "agent_verdicts_workspace_id_agent_kind_subject_id_input_hash_key"
    ON "agent_verdicts"("workspace_id", "agent_kind", "subject_id", "input_hash");
CREATE INDEX "agent_verdicts_workspace_id_agent_kind_idx"
    ON "agent_verdicts"("workspace_id", "agent_kind");
CREATE INDEX "agent_verdicts_document_id_idx"
    ON "agent_verdicts"("document_id");

ALTER TABLE "agent_verdicts"
    ADD CONSTRAINT "agent_verdicts_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. WorkspaceAutomationConfig: per-workspace touchless settings (1:1)
CREATE TABLE "workspace_automation_configs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "touchless_enabled" BOOLEAN NOT NULL DEFAULT false,
    "min_confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.85,
    "require_policy_pass" BOOLEAN NOT NULL DEFAULT false,
    "block_on_warn_checks" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_automation_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workspace_automation_configs_workspace_id_key"
    ON "workspace_automation_configs"("workspace_id");

ALTER TABLE "workspace_automation_configs"
    ADD CONSTRAINT "workspace_automation_configs_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. RLS policies for new tables (mirrors existing pattern from 20260819190000)
ALTER TABLE "agent_verdicts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "agent_verdicts" FORCE ROW LEVEL SECURITY;
CREATE POLICY "agent_verdicts_workspace_isolation" ON "agent_verdicts"
    USING ("workspace_id"::text = current_setting('app.workspace_id', true));

ALTER TABLE "workspace_automation_configs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workspace_automation_configs" FORCE ROW LEVEL SECURITY;
CREATE POLICY "workspace_automation_configs_workspace_isolation" ON "workspace_automation_configs"
    USING ("workspace_id"::text = current_setting('app.workspace_id', true));
