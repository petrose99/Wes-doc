-- #83: workspace-scoped goods/services classification for bill categories. Feeds the LS VAT-12
-- return-form workpaper (#85) via WorkpaperBill.isService (#82). No back-fill: rows land only
-- as workspaces set them; bills whose category has no row project with isService = null.
CREATE TABLE "category_natures" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "category" TEXT NOT NULL,
  "nature" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "category_natures_workspace_id_fkey" FOREIGN KEY ("workspace_id")
    REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "category_natures_workspace_id_category_key"
  ON "category_natures"("workspace_id", "category");

CREATE INDEX "category_natures_workspace_id_idx"
  ON "category_natures"("workspace_id");
