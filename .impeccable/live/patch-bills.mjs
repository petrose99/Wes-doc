import fs from 'node:fs'
const p = '/home/ubuntu/Dev/Wes-doc/models/bills.ts'
let s = fs.readFileSync(p, 'utf8')
const rep = (a, b) => { if (!s.includes(a)) throw new Error('missing: ' + a.slice(0, 80)); s = s.replace(a, b) }
rep(`  escalated: boolean
}

export type BillsSummary`, `  escalated: boolean
  /** #228 Q5/Q6/Q11 (#250): the invoice's Purchase Order link for the Purchase Orders column —
   * the compared PO's number carrying the number of red glyphs the pane will show, or a dashed
   * suggestion the matcher made that compares nothing until confirmed, or "PO removed". */
  po: BillPoLink
}

export type BillPoLink = {
  kind: PoLinkKind | null
  poNumber: string | null
  poDocumentId: string | null
  mismatchCount: number
  confidence: number | null
  suggestionCount: number
  removed: boolean
}

export type BillsSummary`)
rep(`  /** #201's "Touchless" system saved view: rows that went out with no human review. */
  onlyTouchless?: boolean
}): Promise<{ bills: BillRow[]; summary: BillsSummary }> {`, `  /** #201's "Touchless" system saved view: rows that went out with no human review. */
  onlyTouchless?: boolean
  /** #228 Q6: the Purchase Orders facet — Matched (a compared PO, clean), No PO (nothing
   * compared: none, suggested only, or removed), Mismatch (a compared PO with red glyphs). */
  poFilter?: "matched" | "none" | "mismatch"
}): Promise<{ bills: BillRow[]; summary: BillsSummary }> {`)
rep(`  const touchlessDocIds = new Set(touchlessEvents.map((e) => e.documentId))`, `  const poSummaries = await summarizeInvoicePoLinks(input.workspaceId, documentIds)
  const touchlessDocIds = new Set(touchlessEvents.map((e) => e.documentId))`)
rep(`      touchless: touchlessDocIds.has(doc.id),
      escalated: escalatedDocIds.has(doc.id),
    })`, `      touchless: touchlessDocIds.has(doc.id),
      escalated: escalatedDocIds.has(doc.id),
      po: toBillPoLink(poSummaries.get(doc.id)),
    })`)
rep(`    if (input.onlyTouchless && !bill.touchless) return false
    return true`, `    if (input.onlyTouchless && !bill.touchless) return false
    if (input.poFilter === "matched" && !(bill.po.kind && bill.po.kind !== "suggested" && bill.po.mismatchCount === 0)) return false
    if (input.poFilter === "mismatch" && !(bill.po.kind && bill.po.kind !== "suggested" && bill.po.mismatchCount > 0)) return false
    if (input.poFilter === "none" && bill.po.kind && bill.po.kind !== "suggested") return false
    return true`)
rep(`/** Loads bills for a workspace.`, `function toBillPoLink(summary: InvoicePoSummary | undefined): BillPoLink {
  if (!summary) return { kind: null, poNumber: null, poDocumentId: null, mismatchCount: 0, confidence: null, suggestionCount: 0, removed: false }
  if (summary.link) return { kind: summary.link.kind, poNumber: summary.link.poNumber, poDocumentId: summary.link.poDocumentId, mismatchCount: summary.mismatchCount, confidence: summary.link.confidence, suggestionCount: 0, removed: false }
  const first = summary.suggestions[0]
  return { kind: first ? "suggested" : null, poNumber: first?.poNumber ?? null, poDocumentId: first?.poDocumentId ?? null, mismatchCount: 0, confidence: first?.confidence ?? null, suggestionCount: summary.suggestions.length, removed: summary.removed }
}

/** Loads bills for a workspace.`)
fs.writeFileSync(p, s)
console.log('ok')
