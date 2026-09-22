-- #231 / #252 (Wayfinder map #226): Admin › Configuration › Fields. Additive: one overlay table
-- keyed on (workspace, document type, field key); absent rows mean "as the code defaulted".
CREATE TABLE "workspace_field_configs" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "doc_type" TEXT NOT NULL,
    "field_key" TEXT NOT NULL,
    "editable" BOOLEAN NOT NULL DEFAULT true,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "width" TEXT NOT NULL DEFAULT 'normal',
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_field_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workspace_field_configs_workspace_id_doc_type_field_key_key" ON "workspace_field_configs"("workspace_id", "doc_type", "field_key");

ALTER TABLE "workspace_field_configs" ADD CONSTRAINT "workspace_field_configs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
