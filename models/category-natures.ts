/** #83: workspace-scoped goods/services classification for the free-form category strings on
 * bills. Feeds the LS VAT-12 return-form workpaper (#85) through the projection layer
 * (`lib/jurisdictions/_shared/project-bill.ts`), which reads a `getCategoryNature(category)`
 * lookup off `WorkspaceContext`. No back-fill: a category with no row projects as
 * `isService = null` (silent-pass on return-form columns), so packs that don't split by
 * goods/services (ZA VAT201, GB VAT return v1) are unaffected.
 *
 * `nature` is a string column (mirroring how Workspace.role and Category.kind are stored) not
 * an enum, so the closed set can grow by data if a future pack needs a third bucket. The API
 * boundary narrows it back to the CategoryNature type before returning. */
import { prisma } from "@/lib/db"

export type CategoryNature = "goods" | "services"

export type CategoryNatureRow = {
  id: string
  category: string
  nature: CategoryNature
}

const NATURES: readonly string[] = ["goods", "services"] as const

function coerceNature(v: string): CategoryNature | null {
  return v === "goods" || v === "services" ? v : null
}

export async function listCategoryNatures(workspaceId: string): Promise<CategoryNatureRow[]> {
  const rows = await prisma.categoryNature.findMany({
    where: { workspaceId },
    select: { id: true, category: true, nature: true },
    orderBy: { category: "asc" },
  })
  // A row whose nature was written outside the API (manual SQL, older migration) drops out
  // rather than misclassifying a bill; the admin surface will show only the coerced rows.
  return rows.flatMap((r) => {
    const n = coerceNature(r.nature)
    return n ? [{ id: r.id, category: r.category, nature: n }] : []
  })
}

export async function upsertCategoryNature(
  workspaceId: string,
  category: string,
  nature: CategoryNature,
): Promise<CategoryNatureRow> {
  if (!NATURES.includes(nature)) {
    throw new Error(`Invalid category nature: ${nature}`)
  }
  const trimmed = category.trim()
  if (!trimmed) throw new Error("Category is required")
  const row = await prisma.categoryNature.upsert({
    where: { workspaceId_category: { workspaceId, category: trimmed } },
    create: { workspaceId, category: trimmed, nature },
    update: { nature },
    select: { id: true, category: true, nature: true },
  })
  return { id: row.id, category: row.category, nature: nature }
}

export async function deleteCategoryNature(workspaceId: string, id: string): Promise<void> {
  await prisma.categoryNature.deleteMany({ where: { id, workspaceId } })
}

/** Build a synchronous `(category) => nature | null` lookup for the projection layer. Called
 * once per workpaper run rather than per bill so a run over N bills hits the DB once. Callers
 * that already hold rows (a re-run inside a request that just fetched them) can build the
 * lookup directly with `categoryNatureLookup(rows)` and skip the query. */
export async function buildCategoryNatureLookup(
  workspaceId: string,
): Promise<(category: string) => CategoryNature | null> {
  const rows = await listCategoryNatures(workspaceId)
  return categoryNatureLookup(rows)
}

export function categoryNatureLookup(
  rows: readonly CategoryNatureRow[],
): (category: string) => CategoryNature | null {
  const byCategory = new Map<string, CategoryNature>()
  for (const r of rows) byCategory.set(r.category, r.nature)
  return (category: string) => byCategory.get(category) ?? null
}
