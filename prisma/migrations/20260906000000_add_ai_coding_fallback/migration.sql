-- AI coding fallback: when no automation rule matches, an AI agent suggests the coding.

-- Document columns for tracking who/how coding was applied and the agent's confidence.
ALTER TABLE "documents" ADD COLUMN "coding_source" TEXT;
ALTER TABLE "documents" ADD COLUMN "coding_confidence" DOUBLE PRECISION;

-- Backfill: any document already coded by a rule gets source "rule".
UPDATE "documents" SET "coding_source" = 'rule' WHERE "applied_rule_id" IS NOT NULL;

-- Coding corrections: reviewer overrides of AI-suggested coding, fed back into future prompts.
CREATE TABLE "coding_corrections" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "template_code" TEXT NOT NULL,
    "supplier" TEXT,
    "coding_key" TEXT NOT NULL,
    "wrong_value" TEXT NOT NULL,
    "corrected_value" TEXT NOT NULL,
    "hit_count" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "coding_corrections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "coding_corrections_workspace_id_template_code_coding_key_key" ON "coding_corrections"("workspace_id", "template_code", "coding_key", "wrong_value", "corrected_value");
CREATE INDEX "coding_corrections_workspace_id_template_code_idx" ON "coding_corrections"("workspace_id", "template_code");

ALTER TABLE "coding_corrections" ADD CONSTRAINT "coding_corrections_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS for coding_corrections
ALTER TABLE "coding_corrections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "coding_corrections" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "coding_corrections_workspace_isolation" ON "coding_corrections";
CREATE POLICY "coding_corrections_workspace_isolation" ON "coding_corrections"
  USING ("workspace_id" = app_current_workspace()) WITH CHECK ("workspace_id" = app_current_workspace());

-- Agent verdicts: cached LLM results keyed by (document, agentKind, inputHash).
CREATE TABLE "agent_verdicts" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "agent_kind" TEXT NOT NULL,
    "input_hash" TEXT NOT NULL,
    "verdict" JSONB NOT NULL,
    "rationale" JSONB,
    "model" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "agent_verdicts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "agent_verdicts_document_id_agent_kind_input_hash_idx" ON "agent_verdicts"("document_id", "agent_kind", "input_hash");
CREATE INDEX "agent_verdicts_workspace_id_idx" ON "agent_verdicts"("workspace_id");

ALTER TABLE "agent_verdicts" ADD CONSTRAINT "agent_verdicts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_verdicts" ADD CONSTRAINT "agent_verdicts_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS for agent_verdicts
ALTER TABLE "agent_verdicts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "agent_verdicts" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "agent_verdicts_workspace_isolation" ON "agent_verdicts";
CREATE POLICY "agent_verdicts_workspace_isolation" ON "agent_verdicts"
  USING ("workspace_id" = app_current_workspace()) WITH CHECK ("workspace_id" = app_current_workspace());
