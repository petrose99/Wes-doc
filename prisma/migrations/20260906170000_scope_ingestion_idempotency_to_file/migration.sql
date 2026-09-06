-- Widens the ingestion idempotency key from (workspace_id, idempotency_key) to
-- (workspace_id, file_id, idempotency_key).
--
-- The workspace-wide scope ran ahead of Document's own (file_id, sha256) constraint and
-- short-circuited on it, which made that per-file rule unreachable and silently blocked the case
-- it exists to allow: the same PDF deliberately extracted into two sheets with different columns.
-- Retry idempotency is unaffected — every automated intake path resolves to a fixed file_id (a
-- re-sent email always lands in the workspace's "Email intake" file), so provider retries still
-- collide on this key.
--
-- Widening a unique constraint can never conflict with existing rows: every pair unique under the
-- old two-column key remains unique under the three-column one.
-- Prisma creates @@unique as a plain unique index here, but drop it as a table constraint first
-- if some environment materialised it that way — DROP INDEX cannot remove a constraint-backed one.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ingestion_items_workspace_id_idempotency_key_key') THEN
    ALTER TABLE "ingestion_items" DROP CONSTRAINT "ingestion_items_workspace_id_idempotency_key_key";
  END IF;
END
$$;

DROP INDEX IF EXISTS "ingestion_items_workspace_id_idempotency_key_key";

CREATE UNIQUE INDEX "ingestion_items_workspace_id_file_id_idempotency_key_key"
  ON "ingestion_items" ("workspace_id", "file_id", "idempotency_key");
