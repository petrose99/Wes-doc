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

-- Pre-existing bug fix: agent_verdicts.verdict was TEXT but every agent writes a structured
-- object into it (policy stores {decision, reasons}, coding stores {codingData, confidence}).
-- Convert to JSONB, keeping any row that already holds valid JSON and wrapping anything else
-- as a JSON string.
ALTER TABLE "agent_verdicts" ALTER COLUMN "verdict" TYPE JSONB USING (
  CASE
    WHEN "verdict" ~ '^\s*[\[{"]' THEN "verdict"::jsonb
    ELSE to_jsonb("verdict")
  END
);
