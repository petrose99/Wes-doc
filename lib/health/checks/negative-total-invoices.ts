/** Q19: an invoice whose extracted total is negative and was never converted to a credit note —
 * `models/document-checks.ts`'s `invoice_negative_total` check already fails this at review time
 * (offering Move), but a document that slipped through before that check existed, or whose fail
 * was overridden, stays negative-total indefinitely. This is the standing health signal for it:
 * reported, never auto-fixed (there is no safe automatic conversion — a Move is a reviewer
 * decision). Modelled on missing-tax.ts. */
import type { CheckDefinition, CheckRunResult } from "@/lib/health/types"

export const negativeTotalInvoicesCheck: CheckDefinition = {
  code: "negative_total_invoices",
  name: "Invoice has a negative total",
  category: "cleanup",
  defaultWeight: 1,
  requiresLedger: false,
  run: (ctx): CheckRunResult => {
    const candidates = ctx.documents.filter((document) => document.templateCode === "invoice")
    const applicableCount = candidates.length
    if (!applicableCount) return { findings: [], applicableCount }

    const negative = candidates.filter((document) => document.extractedTotal !== null && document.extractedTotal !== undefined && document.extractedTotal < 0)
    const findings = negative.map((document) => ({
      checkCode: "negative_total_invoices",
      category: "cleanup" as const,
      severity: "warning" as const,
      title: `${document.filename} has a negative total`,
      description: "This invoice has a negative total and was never converted to a credit note — move it to a credit note to clear this.",
      documentId: document.id,
      suggestedAction: null,
      suggestedActionPayload: null,
      affectedCount: 1,
    }))

    return { findings, applicableCount }
  },
}
