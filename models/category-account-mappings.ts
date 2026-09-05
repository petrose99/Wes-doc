import { prisma } from "@/lib/db"

export type CategoryAccountMappingRow = {
  id: string
  category: string
  kind: string
  accountExternalId: string
}

export async function listCategoryAccountMappings(connectionId: string): Promise<CategoryAccountMappingRow[]> {
  return prisma.categoryAccountMapping.findMany({
    where: { connectionId },
    select: { id: true, category: true, kind: true, accountExternalId: true },
    orderBy: { category: "asc" },
  })
}

export async function upsertCategoryAccountMapping(
  workspaceId: string,
  connectionId: string,
  category: string,
  kind: string,
  accountExternalId: string,
): Promise<CategoryAccountMappingRow> {
  return prisma.categoryAccountMapping.upsert({
    where: { connectionId_category_kind: { connectionId, category, kind } },
    create: { workspaceId, connectionId, category, kind, accountExternalId },
    update: { accountExternalId },
    select: { id: true, category: true, kind: true, accountExternalId: true },
  })
}

export async function deleteCategoryAccountMapping(connectionId: string, mappingId: string): Promise<void> {
  await prisma.categoryAccountMapping.deleteMany({ where: { id: mappingId, connectionId } })
}

export function resolveCategoryAccount(
  mappings: CategoryAccountMappingRow[],
  category: string | null,
  inferredMap: Record<string, string>,
  defaultAccountId: string,
  kind: string = "expense",
): string {
  if (category) {
    const explicit = mappings.find((m) => m.category === category && m.kind === kind)
    if (explicit) return explicit.accountExternalId
    if (category in inferredMap) return inferredMap[category]
  }
  return defaultAccountId
}
