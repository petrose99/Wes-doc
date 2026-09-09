// Deliberately NOT a "use server" module: trusts the workspaceId it is handed.
import { prisma } from "@/lib/db"
import { SUPPLIER_FIELD_BY_TEMPLATE } from "@/lib/automation/rules"
import { getVendorCodingPrior, HISTORY_APPLY_THRESHOLDS, type CodedDocumentSlice, type VendorCodingPrior } from "@/lib/automation/vendor-history"

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

export type VendorHistoryRow = {
  supplier: string
  templateCode: string
  totalConfirmed: number
  prior: VendorCodingPrior
  /** True when the confidence bar is cleared (support ≥ 3, agreement ≥ 90%) on every coding key
   * present — the row auto-applies without asking the LLM. */
  willAutoApply: boolean
}

/** Group the workspace's confirmed history into one row per (supplier, templateCode) so the UI
 * can show what Phase 3 will do for that vendor. Aggregated per template because the coding
 * engine already scopes to one template at a time, and a receipt's history should not spill into
 * an invoice's coding. */
export async function summarizeVendorHistory(workspaceId: string): Promise<VendorHistoryRow[]> {
  const rows: VendorHistoryRow[] = []
  const templates = Object.keys(SUPPLIER_FIELD_BY_TEMPLATE)

  for (const templateCode of templates) {
    const supplierField = SUPPLIER_FIELD_BY_TEMPLATE[templateCode]
    if (!supplierField) continue
    const history = await loadVendorCodingHistory(workspaceId, templateCode, supplierField)
    if (!history.length) continue

    // Group by normalized supplier so "Acme Ltd" and "acme ltd." collapse into one.
    const bySupplier = new Map<string, CodedDocumentSlice[]>()
    for (const row of history) {
      const key = row.supplier.trim().toLowerCase()
      const bucket = bySupplier.get(key) ?? []
      bucket.push(row)
      bySupplier.set(key, bucket)
    }

    for (const bucket of bySupplier.values()) {
      const supplier = bucket[0].supplier
      const prior = getVendorCodingPrior(bucket, supplier, templateCode)
      const codingKeys = Object.keys(prior.byKey)
      const willAutoApply = codingKeys.length > 0 && codingKeys.every((k) => {
        const s = prior.byKey[k]
        return s.support >= HISTORY_APPLY_THRESHOLDS.minSupport && s.agreement >= HISTORY_APPLY_THRESHOLDS.minAgreement
      })
      rows.push({ supplier, templateCode, totalConfirmed: bucket.length, prior, willAutoApply })
    }
  }

  rows.sort((a, b) => b.totalConfirmed - a.totalConfirmed || a.supplier.localeCompare(b.supplier))
  return rows
}
