// Deliberately NOT a "use server" module, matching the other models/*.ts helpers — trusts the
// workspaceId it is handed. Callers: the worker post-extraction (via recordSupplierObservation
// in lib/suppliers/alias.ts) and readiness/documents when a touchless outcome or reviewer
// correction lands.
import { prisma } from "@/lib/db"
import { resolveSupplier } from "@/lib/suppliers/alias"
import { SUPPLIER_FIELD_BY_TEMPLATE } from "@/lib/automation/rules"

/** A1.4: a document became touchless-ELIGIBLE for the resolved supplier — bump the cold-start
 * counter. Fire-and-forget; a missed increment is a lost trust signal, never a broken write.
 *
 * Deliberately does NOT touch consecutiveClean any more. That streak drives the confidence
 * step-down (0.98 → the workspace floor), and incrementing it here made it unearnable: eligibility
 * requires clearing 0.98, so a supplier had to pass ten documents at the strict bar to win the
 * right to a laxer one, and the step-down only ever rewarded suppliers that never needed it.
 * markSupplierCleanReview below moves that half onto the reviewer signal its own reset already
 * uses (resetSupplierStreak, on any real correction). */
export async function markSupplierTouchless(workspaceId: string, supplierName: string | null): Promise<void> {
  if (!supplierName?.trim()) return
  try {
    const resolution = await resolveSupplier(workspaceId, supplierName)
    if (!resolution.supplierId) return
    await prisma.supplier.update({
      where: { id: resolution.supplierId },
      data: { touchlessSeen: { increment: 1 } },
    })
  } catch (error) {
    console.error("[suppliers] failed to mark touchless:", error instanceof Error ? error.message : error)
  }
}

/** A1.1: a reviewer approved a document for this supplier and corrected nothing — the extraction
 * was right, so the streak grows. The exact mirror of resetSupplierStreak, which zeroes it on any
 * real correction, so both halves of the signal now read the same event: what a person did.
 *
 * Measurable at any confidence, which is the point — a supplier whose fields land at 0.95 can
 * still earn its way down to the workspace floor, instead of being locked at 0.98 forever. */
export async function markSupplierCleanReview(workspaceId: string, supplierName: string | null): Promise<void> {
  if (!supplierName?.trim()) return
  try {
    const resolution = await resolveSupplier(workspaceId, supplierName)
    if (!resolution.supplierId) return
    await prisma.supplier.update({
      where: { id: resolution.supplierId },
      data: { consecutiveClean: { increment: 1 } },
    })
  } catch (error) {
    console.error("[suppliers] failed to mark clean review:", error instanceof Error ? error.message : error)
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

/** Credits a supplier's clean streak for a document a reviewer just approved, but only when the
 * reviewer changed nothing. "Changed nothing" is read from the document's own audit trail — a
 * `document_field_edited` event is written for every field edit (models/documents.ts) — so this
 * needs no new column and cannot disagree with what the audit log shows a person did.
 *
 * Fire-and-forget, like its reset counterpart: a missed increment costs a slower step-down, never
 * the correctness of the approval it rode in on. */
export async function creditSupplierForCleanApproval(workspaceId: string, documentId: string): Promise<void> {
  try {
    const document = await prisma.document.findFirst({
      where: { id: documentId, workspaceId },
      select: { rawExtraction: true, reviewedData: true, template: { select: { code: true } } },
    })
    if (!document?.template?.code) return

    const edited = await prisma.documentAuditEvent.count({
      where: { workspaceId, documentId, type: "document_field_edited" },
    })
    if (edited > 0) return

    const supplierField = SUPPLIER_FIELD_BY_TEMPLATE[document.template.code]
    if (!supplierField) return
    const data = (document.reviewedData as Record<string, unknown> | null) ?? (document.rawExtraction as Record<string, unknown> | null) ?? {}
    const rawSupplier = data[supplierField]
    if (typeof rawSupplier !== "string" || !rawSupplier.trim()) return

    await markSupplierCleanReview(workspaceId, rawSupplier)
  } catch (error) {
    console.error("[suppliers] failed to credit clean approval:", error instanceof Error ? error.message : error)
  }
}
