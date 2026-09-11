import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { CategoryNatureTable } from "@/components/settings/category-nature-table"
import { getCurrentUser } from "@/lib/auth"
import { listCategoryNatures } from "@/models/category-natures"
import { requireWorkspaceRole } from "@/models/workspaces"

/** #83: workspace-scoped goods-vs-services classification for bill categories. Feeds the LS
 * VAT-12 return-form workpaper (#85) through the projection layer — bills whose category has
 * no row (and no per-bill override) project as `isService = null` and silent-pass the return-
 * form columns. Owner-only edit; other members see read-only. */
export default async function CategoryNaturesPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>
}) {
  const { workspaceId } = await params
  const user = await getCurrentUser()
  const membership = await requireWorkspaceRole(workspaceId, user.id)
  const rows = await listCategoryNatures(workspaceId)
  const isOwner = membership.role === "owner"

  return (
    <main className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Categories</h1>
        <p className="mt-1 text-muted-foreground">
          Classify each bill category as goods or services. Used by return-form workpapers that
          split inputs by goods vs services (e.g. Lesotho VAT-12). Categories without a row are
          treated as unset — a bill in one of them silent-passes the goods/services columns.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Goods / services classification</CardTitle>
          <CardDescription>
            Leave a category unset if you don&apos;t need the split — packs that don&apos;t use it
            (ZA VAT201, GB VAT return) are unaffected.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CategoryNatureTable workspaceId={workspaceId} rows={rows} isOwner={isOwner} />
        </CardContent>
      </Card>
    </main>
  )
}
