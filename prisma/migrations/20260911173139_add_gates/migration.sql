-- Shared scaffolding for the six touchless-AP gates from decision ticket #40 (duplicate,
-- jurisdiction validity, 2/3-way match, supplier trust, confidence-per-band, warn-checks). No
-- rule lives in the DB; each gate is a runner in lib/gates/ and this table records what it
-- found for one document. See lib/gates/registry.ts for the run loop.
CREATE TABLE "gates" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "gate_type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'blocked',
    "fired_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "resolved_by" UUID,
    "override_reason" TEXT,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gates_pkey" PRIMARY KEY ("id")
);

-- One row per (document, gateType) — a re-firing gate upserts rather than stacking. The
-- registry uses this constraint as the upsert key so a re-processed bill collapses to the
-- current finding without leaving stale history.
CREATE UNIQUE INDEX "gates_document_id_gate_type_key"
    ON "gates"("document_id", "gate_type");

-- Exception-queue read for the Overview panel: "every open gate in this workspace".
CREATE INDEX "gates_workspace_id_state_idx"
    ON "gates"("workspace_id", "state");

ALTER TABLE "gates"
    ADD CONSTRAINT "gates_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "gates"
    ADD CONSTRAINT "gates_document_id_fkey"
    FOREIGN KEY ("document_id") REFERENCES "documents"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "gates"
    ADD CONSTRAINT "gates_resolved_by_fkey"
    FOREIGN KEY ("resolved_by") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
