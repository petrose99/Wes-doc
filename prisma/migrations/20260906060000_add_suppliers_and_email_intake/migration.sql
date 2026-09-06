-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "canonical_name" TEXT NOT NULL,
    "normalized_key" TEXT NOT NULL,
    "bank_details" JSONB,
    "domain" TEXT,
    "vat_number" TEXT,
    "iban" TEXT,
    "document_count" INTEGER NOT NULL DEFAULT 0,
    "last_seen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_aliases" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "alias_normalized" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'mined',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbound_email_intakes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "from_address" TEXT NOT NULL,
    "subject" TEXT,
    "body_preview" TEXT,
    "attachment_count" INTEGER NOT NULL DEFAULT 0,
    "accepted_count" INTEGER NOT NULL DEFAULT 0,
    "rejected_count" INTEGER NOT NULL DEFAULT 0,
    "outcome" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inbound_email_intakes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_workspace_id_normalized_key_key" ON "suppliers"("workspace_id", "normalized_key");
CREATE INDEX "suppliers_workspace_id_iban_idx" ON "suppliers"("workspace_id", "iban");
CREATE UNIQUE INDEX "supplier_aliases_workspace_id_alias_normalized_key" ON "supplier_aliases"("workspace_id", "alias_normalized");
CREATE INDEX "supplier_aliases_supplier_id_idx" ON "supplier_aliases"("supplier_id");
CREATE INDEX "inbound_email_intakes_workspace_id_created_at_idx" ON "inbound_email_intakes"("workspace_id", "created_at");
CREATE INDEX "inbound_email_intakes_workspace_id_outcome_idx" ON "inbound_email_intakes"("workspace_id", "outcome");

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_aliases" ADD CONSTRAINT "supplier_aliases_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_aliases" ADD CONSTRAINT "supplier_aliases_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inbound_email_intakes" ADD CONSTRAINT "inbound_email_intakes_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS
ALTER TABLE "suppliers" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_isolation" ON "suppliers"
  USING ("workspace_id" = current_setting('app.current_workspace_id', true)::uuid);
ALTER TABLE "supplier_aliases" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_isolation" ON "supplier_aliases"
  USING ("workspace_id" = current_setting('app.current_workspace_id', true)::uuid);
ALTER TABLE "inbound_email_intakes" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_isolation" ON "inbound_email_intakes"
  USING ("workspace_id" = current_setting('app.current_workspace_id', true)::uuid);
