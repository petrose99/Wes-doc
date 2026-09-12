-- #53: match-variance gate (soft) needs a workspace-tunable tolerance. Lives on
-- WorkspaceAutomationConfig next to the other automation knobs (minConfidence,
-- amountBands, criticalFieldsByTemplate). JSON shape { percent, floor: { amount, currency? } }
-- with the #40-fixed seed of 2% / 500 (currency read live off workspace.baseCurrency when
-- absent, so a base-currency change carries over without a data backfill).
ALTER TABLE "workspace_automation_configs"
    ADD COLUMN "match_tolerance" JSONB NOT NULL
    DEFAULT '{"percent":0.02,"floor":{"amount":500}}';
