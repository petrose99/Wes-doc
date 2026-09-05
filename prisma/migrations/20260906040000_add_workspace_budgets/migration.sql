-- CreateTable
CREATE TABLE "workspace_budgets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "vendor" TEXT,
    "template_code" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "period_type" TEXT NOT NULL DEFAULT 'monthly',
    "warn_at_percent" INTEGER NOT NULL DEFAULT 80,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_budgets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workspace_budgets_workspace_id_is_active_idx" ON "workspace_budgets"("workspace_id", "is_active");

-- AddForeignKey
ALTER TABLE "workspace_budgets" ADD CONSTRAINT "workspace_budgets_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS
ALTER TABLE "workspace_budgets" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_isolation" ON "workspace_budgets"
  USING ("workspace_id" = current_setting('app.current_workspace_id', true)::uuid);
