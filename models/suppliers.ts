// Deliberately NOT a "use server" module, matching the other models/*.ts helpers — trusts the
// workspaceId it is handed. Callers: the worker post-extraction (via recordSupplierObservation
// in lib/suppliers/alias.ts) and readiness/documents when a touchless outcome or reviewer
// correction lands.
import { prisma } from "@/lib/db"
import { resolveSupplier } from "@/lib/suppliers/alias"

/** A1.1: a touchless-eligible document just reached "ready" for the resolved supplier — bump
 * both touchlessSeen (cold-start counter) and the consecutive-clean streak. Fire-and-forget;
 * a missed increment is a lost trust signal, never a broken write. */
export async function markSupplierTouchless(workspaceId: string, supplierName: string | null): Promise<void> {
  if (!supplierName?.trim()) return
  try {
    const resolution = await resolveSupplier(workspaceId, supplierName)
    if (!resolution.supplierId) return
    await prisma.supplier.update({
      where: { id: resolution.supplierId },
      data: { touchlessSeen: { increment: 1 }, consecutiveClean: { increment: 1 } },
    })
  } catch (error) {
    console.error("[suppliers] failed to mark touchless:", error instanceof Error ? error.message : error)
  }
}

/** A1.1: any reviewer correction on a document for this supplier resets the streak to 0 —
 * one bad extraction proves the current threshold isn't safe yet for this vendor. */
export async function resetSupplierStreak(workspaceId: string, supplierName: string | null): Promise<void> {
  if (!supplierName?.trim()) return
  try {
    const resolution = await resolveSupplier(workspaceId, supplierName)
    if (!resolution.supplierId) return
    await prisma.supplier.update({
      where: { id: resolution.supplierId },
      data: { consecutiveClean: 0 },
    })
  } catch (error) {
    console.error("[suppliers] failed to reset streak:", error instanceof Error ? error.message : error)
  }
}
