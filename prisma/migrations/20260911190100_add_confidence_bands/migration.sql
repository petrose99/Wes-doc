-- Ticket #55: confidence-per-band gate 5/6 (#40).
--
-- Adds the workspace-tunable band table. A bill whose extraction confidence falls below
-- its band's `min` fires a soft gate. #40 fixed the seed at 0.85 / 0.92 / 1.00 across
-- 0–500 / 500–5k / 5k+; workspaces edit the JSON to tighten or widen it.

ALTER TABLE "workspace_automation_configs"
  ADD COLUMN "confidence_bands" JSONB NOT NULL DEFAULT '[{"upTo":500,"min":0.85},{"upTo":5000,"min":0.92},{"upTo":null,"min":1.0}]';
