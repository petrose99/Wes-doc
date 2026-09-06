import { SUPPLIER_FIELD_BY_TEMPLATE } from "@/lib/automation/rules"
import { prisma } from "@/lib/db"
import { recordSupplierObservation } from "@/lib/suppliers/alias"
import { mineSupplierAliasesForAllWorkspaces } from "@/lib/suppliers/mine-aliases"

/** One-off backfill (A5, sprint 1): seeds the Supplier table from every already-extracted
 * document's supplier field (oldest first, so documentCount/lastSeenAt come out the same as if
 * the registry had existed all along), then mines confirmed correction pairs into aliases.
 * Idempotent per run only in the alias/supplier-key sense — documentCount increments on every
 * run, so run it once (it exists for the cutover, not as a cron). */
async function main() {
  const documents = await prisma.document.findMany({
    where: { status: { notIn: ["received", "queued", "processing"] }, template: { code: { in: Object.keys(SUPPLIER_FIELD_BY_TEMPLATE) } } },
    select: { workspaceId: true, reviewedData: true, createdAt: true, template: { select: { code: true } } },
    orderBy: { createdAt: "asc" },
  })

  let observed = 0
  for (const document of documents) {
    const supplierField = document.template ? SUPPLIER_FIELD_BY_TEMPLATE[document.template.code] : undefined
    if (!supplierField) continue
    const values = (document.reviewedData ?? {}) as Record<string, unknown>
    const rawName = values[supplierField]
    if (typeof rawName !== "string" || !rawName.trim()) continue
    const vat = values["supplier_vat_number"]
    const result = await recordSupplierObservation({
      workspaceId: document.workspaceId,
      rawName,
      vatNumber: typeof vat === "string" && vat.trim() ? vat.trim() : null,
      observedAt: document.createdAt,
    })
    if (result) observed++
  }

  const mining = await mineSupplierAliasesForAllWorkspaces()
  const mined = Object.values(mining).reduce((sum, r) => sum + r.aliasesCreated, 0)
  console.log(`backfill-suppliers: ${observed} observations from ${documents.length} documents; ${mined} aliases mined`)
}

main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1) })
