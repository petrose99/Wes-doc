-- AlterTable
ALTER TABLE "integration_connections" ADD COLUMN     "default_expense_account_guessed" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "supplier_account_rules" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "supplier_name" TEXT NOT NULL,
    "account_external_id" TEXT NOT NULL,
    "last_used_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_account_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "supplier_account_rules_workspace_id_idx" ON "supplier_account_rules"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_account_rules_connection_id_supplier_name_key" ON "supplier_account_rules"("connection_id", "supplier_name");

-- AddForeignKey
ALTER TABLE "supplier_account_rules" ADD CONSTRAINT "supplier_account_rules_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_account_rules" ADD CONSTRAINT "supplier_account_rules_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "integration_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
