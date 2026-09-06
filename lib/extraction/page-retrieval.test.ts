import { describe, expect, it } from "vitest"
import type { DocumentFieldDefinition } from "@/lib/document-templates"
import type { PageContent } from "@/lib/document-processing"
import { bm25RankPages, buildFieldQuery, looksLikeTablePage, selectRelevantPages, tokenize } from "./page-retrieval"

const TOTAL_FIELD: DocumentFieldDefinition = {
  key: "total", label: "Total", type: "number", instruction: "Amount payable including taxes", required: true,
  mergeStrategy: "last", retrievalHints: ["total", "amount due", "balance due", "grand total"],
}
const SUPPLIER_FIELD: DocumentFieldDefinition = {
  key: "vendor", label: "Supplier", type: "string", instruction: "Seller or supplier name", required: true,
  retrievalHints: ["supplier", "vendor", "seller"],
}
const LINE_ITEMS_FIELD: DocumentFieldDefinition = {
  key: "line_items", label: "Line items", type: "array", instruction: "Each billed line item", required: false,
  itemFields: [
    { key: "description", label: "Description", type: "string", instruction: "", required: false },
    { key: "amount", label: "Amount", type: "number", instruction: "", required: false },
  ],
}

function page(n: number, text: string): PageContent { return { page: n, text } }

describe("tokenize", () => {
  it("lowercases, splits on non-alphanumeric, drops one-char tokens", () => {
    expect(tokenize("Hello, World! 42 x")).toEqual(["hello", "world", "42"])
  })
  it("handles empty input", () => {
    expect(tokenize("")).toEqual([])
  })
})

describe("bm25RankPages", () => {
  it("ranks the page containing the query term higher than unrelated pages", () => {
    const pages = ["nothing relevant here", "the total amount due is 500", "some other content"]
    const scores = bm25RankPages(pages, "total amount due")
    expect(scores[1]).toBeGreaterThan(scores[0])
    expect(scores[1]).toBeGreaterThan(scores[2])
  })
  it("returns zero score when no query terms match", () => {
    expect(bm25RankPages(["hello world"], "xyzzy plugh")).toEqual([0])
  })
  it("saturates term frequency (k1 bounds)", () => {
    const single = bm25RankPages(["total"], "total")[0]
    const many = bm25RankPages(["total total total total total total total total total total"], "total")[0]
    expect(many).toBeGreaterThan(single)
    expect(many).toBeLessThan(single * 3)
  })
  it("handles empty corpus", () => {
    expect(bm25RankPages([], "hi")).toEqual([])
  })
})

describe("buildFieldQuery", () => {
  it("composes label, first-sentence instruction, hints, and template name", () => {
    const q = buildFieldQuery(TOTAL_FIELD, "Invoice")
    expect(q).toContain("Total")
    expect(q).toContain("Amount payable including taxes")
    expect(q).toContain("balance due")
    expect(q).toContain("Invoice")
  })
  it("adds item column labels for array fields", () => {
    const q = buildFieldQuery(LINE_ITEMS_FIELD, "Invoice")
    expect(q).toContain("Description")
    expect(q).toContain("Amount")
  })
})

describe("looksLikeTablePage", () => {
  it("detects markdown pipe tables", () => {
    expect(looksLikeTablePage("| a | b |\n|---|---|\n| 1 | 2 |")).toBe(true)
  })
  it("detects HTML tables", () => {
    expect(looksLikeTablePage("<table><tr><td>x</td></tr></table>")).toBe(true)
  })
  it("returns false for prose", () => {
    expect(looksLikeTablePage("This is a paragraph with the | pipe character | in it.")).toBe(false)
  })
})

describe("selectRelevantPages", () => {
  const templateName = "Invoice"
  const fields = [TOTAL_FIELD, SUPPLIER_FIELD]

  it("returns full_sweep when the document is shorter than minPages", async () => {
    const contents = Array.from({ length: 5 }, (_, i) => page(i + 1, "some text"))
    const result = await selectRelevantPages({ contents, fields, templateName, minPages: 12 })
    expect(result.mode).toBe("full_sweep")
    expect(result.reason).toBe("short_document")
  })

  it("returns full_sweep when there are no fields (free-form)", async () => {
    const contents = Array.from({ length: 20 }, (_, i) => page(i + 1, "text"))
    const result = await selectRelevantPages({ contents, fields: [], templateName, minPages: 5 })
    expect(result.mode).toBe("full_sweep")
    expect(result.reason).toBe("free_form")
  })

  it("gates to a subset of pages when retrieval fits", async () => {
    const contents: PageContent[] = [
      page(1, "Acme Corp Supplier Ltd. Invoice header. Vendor: Acme. Issue date"),
      page(2, "Terms and conditions boilerplate — legal disclaimer text"),
      page(3, "More legal text. Not relevant to any field."),
      page(4, "Appendix A: definitions"),
      page(5, "Appendix B: definitions"),
      page(6, "Appendix C: definitions"),
      page(7, "Appendix D: definitions"),
      page(8, "Appendix E: definitions"),
      page(9, "Appendix F: definitions"),
      page(10, "Appendix G: definitions"),
      page(11, "Appendix H: definitions"),
      page(12, "Appendix I: definitions"),
      page(13, "Total amount due: 1,234.56 balance due grand total"),
    ]
    const result = await selectRelevantPages({ contents, fields, templateName, minPages: 5, topKPerField: 2 })
    expect(result.mode).toBe("retrieval")
    expect(result.selectedPages).toContain(1)
    expect(result.selectedPages).toContain(13)
    expect(result.skippedPages.length).toBeGreaterThan(0)
    expect(result.dense).toBe(false)
  })

  it("always includes first and last parsed pages", async () => {
    const contents: PageContent[] = Array.from({ length: 15 }, (_, i) => page(i + 1, "unrelated filler text"))
    contents[7] = page(8, "total amount due grand total supplier vendor")
    const result = await selectRelevantPages({ contents, fields, templateName, minPages: 5, topKPerField: 1 })
    expect(result.selectedPages).toContain(1)
    expect(result.selectedPages).toContain(15)
  })

  it("degrades to full_sweep when retrieval would select ≥70% of pages", async () => {
    // Every page mentions the total, so almost every page gets forced in.
    const contents: PageContent[] = Array.from({ length: 20 }, (_, i) => page(i + 1, "total amount due balance due"))
    const result = await selectRelevantPages({ contents, fields, templateName, minPages: 5, topKPerField: 20 })
    expect(result.mode).toBe("full_sweep")
    expect(result.reason).toBe("forced_ratio_exceeded")
  })

  it("force-includes pages that look like tables for array fields", async () => {
    const contents: PageContent[] = [
      page(1, "Invoice header. Supplier: Acme"),
      ...Array.from({ length: 10 }, (_, i) => page(i + 2, "boilerplate")),
      page(12, "| description | amount |\n|---|---|\n| widget | 10 |\n| gadget | 20 |\n| foo | 30 |"),
      page(13, "final total amount due"),
    ]
    const result = await selectRelevantPages({ contents, fields: [SUPPLIER_FIELD, TOTAL_FIELD, LINE_ITEMS_FIELD], templateName, minPages: 5, topKPerField: 1 })
    expect(result.mode).toBe("retrieval")
    expect(result.selectedPages).toContain(12)
  })

  it("uses injected embedders when supplied and marks dense=true", async () => {
    const contents: PageContent[] = Array.from({ length: 15 }, (_, i) => page(i + 1, `page ${i + 1} filler`))
    contents[6] = page(7, "total amount due")
    let queryVec: number[] = []
    const embedPages = async (texts: string[]): Promise<number[][]> => {
      return texts.map((_, i) => {
        const v = new Array(4).fill(0)
        if (i === 6) v[0] = 1
        else v[1] = 1
        return v
      })
    }
    const embedQueries = async (texts: string[]): Promise<number[][]> => {
      queryVec = [1, 0, 0, 0]
      return texts.map(() => [1, 0, 0, 0])
    }
    const result = await selectRelevantPages({ contents, fields, templateName, minPages: 5, topKPerField: 1, embedPages, embedQueries })
    expect(result.dense).toBe(true)
    expect(queryVec).toEqual([1, 0, 0, 0])
    expect(result.selectedPages).toContain(7)
  })

  it("degrades to lexical-only when an embedder throws", async () => {
    const contents: PageContent[] = Array.from({ length: 15 }, (_, i) => page(i + 1, "filler"))
    contents[3] = page(4, "total amount due grand total")
    const embedPages = async (): Promise<number[][]> => { throw new Error("network down") }
    const embedQueries = async (): Promise<number[][]> => []
    const result = await selectRelevantPages({ contents, fields, templateName, minPages: 5, topKPerField: 1, embedPages, embedQueries })
    expect(result.dense).toBe(false)
    // Still runs BM25 and returns a retrieval result including page 4.
    expect(result.mode).toBe("retrieval")
    expect(result.selectedPages).toContain(4)
  })

  it("preserves non-contiguous real page numbers", async () => {
    const contents: PageContent[] = [
      page(2, "Supplier: Acme"),
      page(5, "middle filler"),
      page(9, "grand total amount due"),
      page(12, "filler"),
      page(15, "filler"),
      page(18, "filler"),
      page(21, "filler"),
      page(24, "filler"),
      page(27, "filler"),
      page(30, "filler"),
      page(33, "filler"),
      page(36, "filler"),
      page(39, "final total"),
    ]
    const result = await selectRelevantPages({ contents, fields, templateName, minPages: 5, topKPerField: 1 })
    // First and last include page 2 and page 39 (real numbers), never positions.
    expect(result.selectedPages).toContain(2)
    expect(result.selectedPages).toContain(39)
    // Never lists a fake page number that isn't in contents.
    const validPages = new Set(contents.map((c) => c.page))
    for (const p of result.selectedPages) expect(validPages.has(p)).toBe(true)
    for (const p of result.skippedPages) expect(validPages.has(p)).toBe(true)
  })
})
