import { describe, expect, it } from "vitest"
import { findMatches, scoreAmountMatch, scoreDateMatch, scorePoNumberMatch, scoreVendorMatch, type MatchableDocument } from "./engine"

describe("scoreVendorMatch", () => {
  it("exact match scores 1", () => expect(scoreVendorMatch("Acme Corp", "Acme Corp")).toBe(1))
  it("case insensitive", () => expect(scoreVendorMatch("acme corp", "ACME CORP")).toBe(1))
  // A5: "Corp" is a legal-form suffix the shared normalizer strips, so these are now the SAME
  // vendor (1); one name fully contained in the other is token_set_ratio's auto band (0.9),
  // slightly stronger than the old flat substring 0.8; partial-word overlap lands in the review
  // band (0.6).
  it("suffix-only difference scores 1", () => expect(scoreVendorMatch("Acme", "Acme Corp")).toBe(1))
  it("containment scores 0.9", () => expect(scoreVendorMatch("Acme", "Acme Europe")).toBe(0.9))
  it("close-but-not-identical names score in the review band", () =>
    expect(scoreVendorMatch("Acme Digital Trading", "Acme Digital Traders")).toBe(0.6))
  it("no match scores 0", () => expect(scoreVendorMatch("Acme", "Globex")).toBe(0))
  it("null scores 0", () => expect(scoreVendorMatch(null, "Acme")).toBe(0))
})

describe("scoreAmountMatch", () => {
  it("exact match scores 1", () => {
    const { score } = scoreAmountMatch(100, 100, 2)
    expect(score).toBe(1)
  })
  it("within tolerance scores 1", () => {
    const { score } = scoreAmountMatch(100, 101.5, 2)
    expect(score).toBe(1)
  })
  it("within 3x tolerance scores 0.5", () => {
    const { score, discrepancy } = scoreAmountMatch(100, 105, 2)
    expect(score).toBe(0.5)
    expect(discrepancy).not.toBeNull()
  })
  it("beyond 3x tolerance scores 0", () => {
    const { score } = scoreAmountMatch(100, 120, 2)
    expect(score).toBe(0)
  })
  it("null scores 0", () => {
    const { score } = scoreAmountMatch(null, 100, 2)
    expect(score).toBe(0)
  })
})

describe("scoreDateMatch", () => {
  it("same day scores 1", () => expect(scoreDateMatch("2026-01-15", "2026-01-15", 30)).toBe(1))
  it("within window scores 1", () => expect(scoreDateMatch("2026-01-01", "2026-01-25", 30)).toBe(1))
  it("within 2x window scores 0.5", () => expect(scoreDateMatch("2026-01-01", "2026-02-15", 30)).toBe(0.5))
  it("beyond 2x window scores 0", () => expect(scoreDateMatch("2026-01-01", "2026-07-01", 30)).toBe(0))
  it("invalid date scores 0", () => expect(scoreDateMatch("not-a-date", "2026-01-01", 30)).toBe(0))
  it("null scores 0", () => expect(scoreDateMatch(null, "2026-01-01", 30)).toBe(0))
})

describe("scorePoNumberMatch", () => {
  it("exact match scores 1", () => expect(scorePoNumberMatch("PO-1234", "PO-1234")).toBe(1))
  it("case insensitive", () => expect(scorePoNumberMatch("po-1234", "PO-1234")).toBe(1))
  it("no match scores 0", () => expect(scorePoNumberMatch("PO-1234", "PO-5678")).toBe(0))
  it("null scores 0", () => expect(scorePoNumberMatch(null, "PO-1234")).toBe(0))
})

describe("findMatches", () => {
  const po: MatchableDocument = { id: "po-1", templateCode: "purchase_order", vendor: "Acme Corp", amount: 1000, date: "2026-03-01", poNumber: "PO-001" }
  const invoice: MatchableDocument = { id: "inv-1", templateCode: "expense", vendor: "Acme Corp", amount: 1000, date: "2026-03-10", poNumber: "PO-001" }
  const receipt: MatchableDocument = { id: "rec-1", templateCode: "receipt", vendor: "Acme Corp", amount: 1000, date: "2026-03-12", poNumber: null }

  it("matches PO to invoice", () => {
    const results = findMatches(po, [invoice, receipt])
    const poInv = results.find((r) => r.matchType === "po_to_invoice")
    expect(poInv).toBeDefined()
    expect(poInv!.confidence).toBeGreaterThan(0.8)
  })

  it("matches PO to receipt", () => {
    const results = findMatches(po, [invoice, receipt])
    const poRec = results.find((r) => r.matchType === "po_to_receipt")
    expect(poRec).toBeDefined()
  })

  it("matches invoice to receipt", () => {
    const results = findMatches(invoice, [po, receipt])
    const invRec = results.find((r) => r.matchType === "invoice_to_receipt")
    expect(invRec).toBeDefined()
  })

  it("does not match same document", () => {
    const results = findMatches(po, [po])
    expect(results).toHaveLength(0)
  })

  it("does not match incompatible roles", () => {
    const results = findMatches(invoice, [{ ...invoice, id: "inv-2" }])
    expect(results).toHaveLength(0)
  })

  it("filters out low confidence matches", () => {
    const differentVendor: MatchableDocument = { id: "inv-2", templateCode: "expense", vendor: "Globex", amount: 5000, date: "2025-01-01", poNumber: null }
    const results = findMatches(po, [differentVendor])
    expect(results).toHaveLength(0)
  })

  it("reports amount discrepancies", () => {
    const invoiceWithDiff: MatchableDocument = { ...invoice, amount: 1050 }
    const results = findMatches(po, [invoiceWithDiff])
    expect(results).toHaveLength(1)
    expect(results[0].discrepancies.some((d) => d.field === "amount")).toBe(true)
  })

  it("returns results sorted by confidence descending", () => {
    const good: MatchableDocument = { id: "inv-good", templateCode: "expense", vendor: "Acme Corp", amount: 1000, date: "2026-03-05", poNumber: "PO-001" }
    const ok: MatchableDocument = { id: "inv-ok", templateCode: "expense", vendor: "Acme", amount: 980, date: "2026-04-01", poNumber: null }
    const results = findMatches(po, [ok, good])
    expect(results.length).toBeGreaterThanOrEqual(2)
    expect(results[0].confidence).toBeGreaterThanOrEqual(results[1].confidence)
  })

  it("returns empty for unknown template code", () => {
    const unknown: MatchableDocument = { id: "x", templateCode: "unknown", vendor: "Acme", amount: 1000, date: "2026-03-01", poNumber: null }
    expect(findMatches(unknown, [invoice])).toHaveLength(0)
  })
})
