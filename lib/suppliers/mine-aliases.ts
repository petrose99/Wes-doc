/** A5.4: alias mining from the correction memory. When a reviewer has overridden an extracted
 * supplier field the same way at least twice (FieldCorrection.hitCount ≥ 2 — one correction is a
 * typo fix, two identical ones are a fact), the wrong spelling is a confirmed alias of the
 * corrected supplier. Idempotent by construction (everything is upserts on unique keys), so it is
 * safe as both the nightly job and the one-off backfill (scripts/mine-supplier-aliases.ts). */
import { SUPPLIER_FIELD_BY_TEMPLATE } from "@/lib/automation/rules"
import { prisma } from "@/lib/db"
import { normalizeSupplierName } from "@/lib/suppliers/normalize"

const SUPPLIER_FIELD_KEYS = [...new Set(Object.values(SUPPLIER_FIELD_BY_TEMPLATE))]

export type MineAliasesResult = { suppliersCreated: number; aliasesCreated: number; skipped: number }

export async function mineSupplierAliases(workspaceId: string): Promise<MineAliasesResult> {
  const corrections = await prisma.fieldCorrection.findMany({
    where: { workspaceId, fieldKey: { in: SUPPLIER_FIELD_KEYS }, hitCount: { gte: 2 } },
    select: { wrongValue: true, correctedValue: true },
  })

  const result: MineAliasesResult = { suppliersCreated: 0, aliasesCreated: 0, skipped: 0 }
  for (const correction of corrections) {
    const canonicalKey = normalizeSupplierName(correction.correctedValue)
    const aliasKey = normalizeSupplierName(correction.wrongValue)
    // Same normalized form (a punctuation/suffix-only fix) carries no alias information; an empty
    // key on either side is unusable.
    if (!canonicalKey || !aliasKey || canonicalKey === aliasKey) { result.skipped++; continue }

    const supplier = await prisma.supplier.upsert({
      where: { workspaceId_normalizedKey: { workspaceId, normalizedKey: canonicalKey } },
      create: { workspaceId, canonicalName: correction.correctedValue.trim(), normalizedKey: canonicalKey },
      update: {},
    })
    if (supplier.createdAt.getTime() === supplier.updatedAt.getTime()) result.suppliersCreated++

    // Never let a mined alias shadow a real supplier's own key — if some other supplier IS the
    // wrong spelling, the "correction" was a reviewer picking a different vendor, not a respelling.
    const shadowed = await prisma.supplier.findUnique({
      where: { workspaceId_normalizedKey: { workspaceId, normalizedKey: aliasKey } },
      select: { id: true },
    })
    if (shadowed && shadowed.id !== supplier.id) { result.skipped++; continue }

    const alias = await prisma.supplierAlias.upsert({
      where: { workspaceId_aliasNormalized: { workspaceId, aliasNormalized: aliasKey } },
      create: { workspaceId, supplierId: supplier.id, aliasNormalized: aliasKey, source: "mined" },
      update: {},
    })
    if (alias.supplierId === supplier.id && alias.createdAt.getTime() > Date.now() - 5_000) result.aliasesCreated++
  }
  return result
}

/** All-workspace runner for the nightly job / backfill script. */
export async function mineSupplierAliasesForAllWorkspaces(): Promise<Record<string, MineAliasesResult>> {
  const workspaces = await prisma.workspace.findMany({ select: { id: true } })
  const results: Record<string, MineAliasesResult> = {}
  for (const workspace of workspaces) {
    results[workspace.id] = await mineSupplierAliases(workspace.id)
  }
  return results
}
