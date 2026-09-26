-- #459 (ADR 0015): item entity sync + item lines. Additive and nullable.
ALTER TABLE "accounting_entities" ADD COLUMN "item_type" TEXT;
ALTER TABLE "accounting_entities" ADD COLUMN "tracked_inventory" BOOLEAN;
ALTER TABLE "accounting_entities" ADD COLUMN "purchase_account_external_id" TEXT;

CREATE TABLE "supplier_item_pairings" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "supplier_name" TEXT NOT NULL,
    "match_key" TEXT NOT NULL,
    "item_external_id" TEXT NOT NULL,
    "last_used_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_item_pairings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "supplier_item_pairings_connection_id_supplier_name_match_k_key" ON "supplier_item_pairings"("connection_id", "supplier_name", "match_key");
CREATE INDEX "supplier_item_pairings_workspace_id_idx" ON "supplier_item_pairings"("workspace_id");

ALTER TABLE "supplier_item_pairings" ADD CONSTRAINT "supplier_item_pairings_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_item_pairings" ADD CONSTRAINT "supplier_item_pairings_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "integration_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
