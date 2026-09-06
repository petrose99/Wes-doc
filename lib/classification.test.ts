import { describe, expect, it, vi } from "vitest"

vi.mock("@/ai/providers/llmProvider", () => ({
  requestLLM: vi.fn(),
}))

import { classifyDocument } from "./classification"
import { requestLLM } from "@/ai/providers/llmProvider"

const mockLLM = vi.mocked(requestLLM)

const settings = { providers: [{ provider: "gemini" as const, apiKey: "test", model: "test" }] }

describe("classifyDocument", () => {
  it("parses a valid invoice classification", async () => {
    mockLLM.mockResolvedValueOnce({
      output: {
        doc_type: "invoice",
        doc_type_label: "Tax Invoice",
        category: "expense",
        confidence: 0.95,
        segments: [{ start_page: 1, end_page: 3, doc_type: "invoice", category: "expense", reason: "single invoice" }],
      },
      provider: "gemini",
    })

    const result = await classifyDocument(settings, {
      filename: "inv-001.pdf",
      pageTexts: [{ page: 1, text: "INVOICE\nVendor: Acme" }],
      totalPages: 3,
    })

    expect(result.docType).toBe("invoice")
    expect(result.docTypeLabel).toBe("Tax Invoice")
    expect(result.category).toBe("expense")
    expect(result.confidence).toBe(0.95)
    expect(result.segments).toHaveLength(1)
    expect(result.segments[0].startPage).toBe(1)
    expect(result.segments[0].endPage).toBe(3)
  })

  it("detects multi-document segments", async () => {
    mockLLM.mockResolvedValueOnce({
      output: {
        doc_type: "invoice",
        doc_type_label: "Invoice",
        category: "expense",
        confidence: 0.85,
        segments: [
          { start_page: 1, end_page: 2, doc_type: "invoice", category: "expense", reason: "first invoice" },
          { start_page: 3, end_page: 4, doc_type: "receipt", category: "expense", reason: "attached receipt" },
        ],
      },
      provider: "gemini",
    })

    const result = await classifyDocument(settings, {
      filename: "combined.pdf",
      pageTexts: [{ page: 1, text: "Invoice" }, { page: 3, text: "Receipt" }],
      totalPages: 4,
    })

    expect(result.segments).toHaveLength(2)
    expect(result.segments[0].docType).toBe("invoice")
    expect(result.segments[1].docType).toBe("receipt")
  })

  it("falls back on LLM error", async () => {
    mockLLM.mockResolvedValueOnce({
      output: {},
      provider: "gemini",
      error: "ai_extraction_failed",
    })

    const result = await classifyDocument(settings, {
      filename: "mystery.pdf",
      pageTexts: [{ page: 1, text: "..." }],
      totalPages: 1,
    })

    expect(result.docType).toBe("other")
    expect(result.confidence).toBe(0)
    expect(result.segments).toHaveLength(1)
  })

  it("clamps invalid confidence to [0,1]", async () => {
    mockLLM.mockResolvedValueOnce({
      output: { doc_type: "receipt", doc_type_label: "Receipt", category: "expense", confidence: 5, segments: [] },
      provider: "gemini",
    })

    const result = await classifyDocument(settings, {
      filename: "r.pdf",
      pageTexts: [{ page: 1, text: "receipt" }],
      totalPages: 1,
    })

    expect(result.confidence).toBe(1)
    expect(result.segments).toHaveLength(1)
  })

  it("rejects unknown doc_type and falls back to other", async () => {
    mockLLM.mockResolvedValueOnce({
      output: { doc_type: "alien_document", doc_type_label: "Alien", category: "sale", confidence: 0.7, segments: [] },
      provider: "gemini",
    })

    const result = await classifyDocument(settings, {
      filename: "a.pdf",
      pageTexts: [{ page: 1, text: "x" }],
      totalPages: 1,
    })

    expect(result.docType).toBe("other")
    expect(result.category).toBe("sale")
  })

  it("drops malformed segments and creates fallback", async () => {
    mockLLM.mockResolvedValueOnce({
      output: {
        doc_type: "invoice", doc_type_label: "Invoice", category: "expense", confidence: 0.9,
        segments: [{ start_page: -1, end_page: 0, doc_type: "invoice", category: "expense", reason: "bad" }],
      },
      provider: "gemini",
    })

    const result = await classifyDocument(settings, {
      filename: "inv.pdf",
      pageTexts: [{ page: 1, text: "data" }],
      totalPages: 2,
    })

    expect(result.segments).toHaveLength(1)
    expect(result.segments[0].startPage).toBe(1)
    expect(result.segments[0].endPage).toBe(2)
  })
})
