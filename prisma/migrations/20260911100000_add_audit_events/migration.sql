-- Workflow audit trail for the touchless-AP gates (#40) and the close checklist (#42). Sits
-- alongside document_audit_events (HIPAA §164.312(b)) rather than extending it: the two answer
-- different questions and have different retention constraints. Restrict on workspace so
-- workspace deletion cannot destroy the evidence of what happened inside it.
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "actor_id" UUID,
    "type" TEXT NOT NULL,
    "subject_type" TEXT NOT NULL,
    "subject_id" UUID NOT NULL,
    "payload" JSONB,
    "payload_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- Idempotency key: same event, same subject, same payload collapses to one row. #42's
-- "computed logged only on value change" rule falls out of this constraint without callers
-- needing to remember to diff first.
CREATE UNIQUE INDEX "audit_events_type_subject_id_payload_hash_key"
    ON "audit_events"("type", "subject_id", "payload_hash");

CREATE INDEX "audit_events_workspace_id_created_at_idx"
    ON "audit_events"("workspace_id", "created_at");
CREATE INDEX "audit_events_subject_type_subject_id_created_at_idx"
    ON "audit_events"("subject_type", "subject_id", "created_at");
CREATE INDEX "audit_events_actor_id_created_at_idx"
    ON "audit_events"("actor_id", "created_at");

ALTER TABLE "audit_events"
    ADD CONSTRAINT "audit_events_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "audit_events"
    ADD CONSTRAINT "audit_events_actor_id_fkey"
    FOREIGN KEY ("actor_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
