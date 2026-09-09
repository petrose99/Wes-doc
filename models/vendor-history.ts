// Deliberately NOT a "use server" module: trusts the workspaceId it is handed.
import { prisma } from "@/lib/db"
import type { CodedDocumentSlice } from "@/lib/automation/vendor-history"

const HISTORY_CAP = 500

/** Load the confirmed coding history for a workspace + templateCode.
 *
 * "Confirmed" means:
 *  - codingSource === "manual" (a person coded directly), OR
 *  - codingSource === "rule" (a rule the workspace explicitly authored — trusted), OR
 *  - codingSource === "history" (a previously-applied history bucket — always trusted, since
 *    it descends from prior manual/rule coding), OR
 *  - codingSource === "ai" AND the document has been reviewed (status "reviewed"/"approved"
 *    with a resolved ReviewTask). Otherwise we don't count the AI's own opinion.
 */
export async function loadVendorCodingHistory(
  workspaceId: string,
  templateCode: string,
  supplierField: string,
): Promise<CodedDocumentSlice[]> {
  const rows = await prisma.document.findMany({
    where: {
      workspaceId,
      template: { code: templateCode },
      codingSource: { in: ["manual", "rule", "history"] },
      // Filter down here so we don't pull the whole document table.
      NOT: { codingData: { equals: {} } },
    },
    select: {
      id: true,
      reviewedData: true,
      codingData: true,
      codingSource: true,
      template: { select: { code: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: HISTORY_CAP,
  })

  const result: CodedDocumentSlice[] = []
  for (const row of rows) {
    const values = (row.reviewedData ?? {}) as Record<string, unknown>
    const supplier = typeof values[supplierField] === "string" ? (values[supplierField] as string) : null
    if (!supplier) continue
    const coding = (row.codingData ?? {}) as Record<string, unknown>
    // Coerce to string-valued map — anything non-string in codingData is skipped.
    const codingData: Record<string, string> = {}
    for (const [key, value] of Object.entries(coding)) {
      if (typeof value === "string" && value.trim()) codingData[key] = value
    }
    if (!Object.keys(codingData).length) continue
    result.push({
      documentId: row.id,
      supplier,
      templateCode: row.template?.code ?? templateCode,
      codingData,
      codingSource: (row.codingSource as CodedDocumentSlice["codingSource"]) ?? "manual",
    })
  }
  return result
}
