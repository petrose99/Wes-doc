-- #461 (ADR 0016): attaches the posted bill's Source file at the provider, as its own queue row
-- keyed 1:1 to the IntegrationPush that created the bill. Modelled directly on integration_pushes
-- (20260826010000): same claim/attempt/drain shape, drained by lib/integration-attach.ts.

CREATE TABLE "integration_attachments" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "push_id" UUID NOT NULL,
    "connection_id" UUID,
    "document_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lease_until" TIMESTAMP(3),
    "external_attachment_id" TEXT,
    "error_code" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    CONSTRAINT "integration_attachments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "integration_attachments_push_id_key" ON "integration_attachments"("push_id");
-- The drain's hot path: claim the oldest due pending attach.
CREATE INDEX "integration_attachments_status_next_attempt_at_idx" ON "integration_attachments"("status", "next_attempt_at");
-- The document page / settings "recent attaches" list, newest-first within a workspace.
CREATE INDEX "integration_attachments_workspace_id_created_at_idx" ON "integration_attachments"("workspace_id", "created_at");

ALTER TABLE "integration_attachments" ADD CONSTRAINT "integration_attachments_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "integration_attachments" ADD CONSTRAINT "integration_attachments_push_id_fkey" FOREIGN KEY ("push_id") REFERENCES "integration_pushes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "integration_attachments" ADD CONSTRAINT "integration_attachments_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "integration_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "integration_attachments" ADD CONSTRAINT "integration_attachments_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "integration_attachments" ADD CONSTRAINT "integration_attachments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
