import { describe, expect, it } from "vitest"
import { negativeTotalInvoicesCheck } from "@/lib/health/checks/negative-total-invoices"
import type { CheckContext, CheckDocumentSlice } from "@/lib/health/types"

const now = new Date("2026-09-02T00:00:00.000Z")

function doc(overrides: Partial<CheckDocumentSlice> = {}): CheckDocumentSlice {
  return {
    id: "d1", fileId: "f1", filename: "invoice.pdf", templateCode: "invoice", status: "extracted",
    receivedAt: now, supplierValue: "Acme", supplierConfidence: null, hasPush: true, hasRejectedReviewTask: false,
    extractedTotal: 100,
    ...overrides,
  }
}

function baseCtx(documents: CheckDocumentSlice[]): CheckContext {
  return {
    workspaceId: "ws1", dateRange: { from: now, to: now }, ledger: { transactions: [], accountingEntities: [], matchCandidateDocuments: [] },
    documents, reviewTasks: [], pushHistory: [], attachHistory: [], automationRules: [], checkResults: [],
    confidenceDrift: [], lowConfidenceFields: [], bankStatements: [],
  }
}

describe("negativeTotalInvoicesCheck", () => {
  it("passes an invoice with a positive total", () => {
    const result = negativeTotalInvoicesCheck.run(baseCtx([doc()]))
    expect(result.findings).toHaveLength(0)
    expect(result.applicableCount).toBe(1)
  })

  it("flags an invoice with a negative total", () => {
    const result = negativeTotalInvoicesCheck.run(baseCtx([doc({ id: "d2", extractedTotal: -50 })]))
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0].severity).toBe("warning")
    expect(result.findings[0].documentId).toBe("d2")
  })

  it("ignores a non-invoice document", () => {
    const result = negativeTotalInvoicesCheck.run(baseCtx([doc({ templateCode: "credit_note", extractedTotal: -50 })]))
    expect(result.applicableCount).toBe(0)
    expect(result.findings).toHaveLength(0)
  })

  it("never auto-fixes — no suggestedAction", () => {
    const result = negativeTotalInvoicesCheck.run(baseCtx([doc({ id: "d3", extractedTotal: -1 })]))
    expect(result.findings[0].suggestedAction).toBeNull()
  })
})
