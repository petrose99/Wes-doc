// Deliberately NOT a "use server" module, matching every other models/*.ts read helper: this
// trusts the workspaceId/documentId it is handed. Callers (the document detail server
// component) have already authorised the document by construction.
import { prisma } from "@/lib/db"
import type { DocumentMatchRow } from "@/components/matching/document-matches-panel"

/** Loads every DocumentMatch involving this document — as source (PO/invoice/etc.) OR target
 * (matched-against) — for the review UI. Returns the shape the panel expects. Bounded (up to 50
 * rows) so a runaway matcher can't drown the page. */
export async function listDocumentMatchesForDocument(workspaceId: string, documentId: string): Promise<DocumentMatchRow[]> {
  const rows = await prisma.documentMatch.findMany({
    where: { workspaceId, OR: [{ sourceId: documentId }, { targetId: documentId }] },
    select: {
      id: true, sourceId: true, targetId: true, matchType: true, confidence: true, status: true, discrepancies: true,
      source: { select: { id: true, filename: true } },
      target: { select: { id: true, filename: true } },
    },
    orderBy: [{ confidence: "desc" }, { createdAt: "desc" }],
    take: 50,
  })
  return rows.map((row) => {
    const isSource = row.sourceId === documentId
    const other = isSource ? row.target : row.source
    const discrepancies = Array.isArray(row.discrepancies)
      ? (row.discrepancies as unknown[])
          .filter((d): d is Record<string, unknown> => typeof d === "object" && d !== null)
          .map((d) => ({
            field: typeof d.field === "string" ? d.field : "",
            expected: typeof d.expected === "string" ? d.expected : String(d.expected ?? ""),
            actual: typeof d.actual === "string" ? d.actual : String(d.actual ?? ""),
          }))
      : []
    return {
      id: row.id,
      role: isSource ? "source" : "target",
      otherDocumentId: other.id,
      otherFilename: other.filename ?? null,
      matchType: row.matchType,
      confidence: row.confidence,
      status: row.status,
      discrepancies,
    }
  })
}
