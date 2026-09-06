import { requestLLM, type LLMSettings } from "@/ai/providers/llmProvider"
import { DOC_TYPES, isDocType, type DocType, type DocCategory } from "@/lib/doc-types"

export type ClassificationSegment = {
  startPage: number
  endPage: number
  docType: DocType
  category: DocCategory
  reason: string
}

export type ClassificationResult = {
  docType: DocType
  docTypeLabel: string
  category: DocCategory
  confidence: number
  segments: ClassificationSegment[]
}

const CLASSIFICATION_SCHEMA = {
  type: "object",
  properties: {
    doc_type: {
      type: "string",
      enum: [...DOC_TYPES],
      description: "The canonical document type.",
    },
    doc_type_label: {
      type: "string",
      description: "A human-readable label for the document type.",
    },
    category: {
      type: "string",
      enum: ["expense", "sale", "other"],
      description: "Whether this document represents an expense, a sale, or something else.",
    },
    confidence: {
      type: "number",
      description: "Confidence in the classification, 0 to 1.",
    },
    segments: {
      type: "array",
      description: "If the PDF contains multiple independent documents, list each segment. A single-document PDF should have exactly one segment.",
      items: {
        type: "object",
        properties: {
          start_page: { type: "integer", description: "First page of this segment (1-based)." },
          end_page: { type: "integer", description: "Last page of this segment (1-based, inclusive)." },
          doc_type: { type: "string", enum: [...DOC_TYPES] },
          category: { type: "string", enum: ["expense", "sale", "other"] },
          reason: { type: "string", description: "Brief explanation for this segment boundary." },
        },
        required: ["start_page", "end_page", "doc_type", "category", "reason"],
      },
    },
  },
  required: ["doc_type", "doc_type_label", "category", "confidence", "segments"],
  additionalProperties: false,
}

const CHARS_PER_PAGE_PREVIEW = 400

function buildClassificationPrompt(filename: string, pageTexts: { page: number; text: string }[]): string {
  const docTypes = DOC_TYPES.join(", ")
  const pagePreview = pageTexts.map(({ page, text }) => {
    const preview = text.slice(0, CHARS_PER_PAGE_PREVIEW)
    return `--- Page ${page} ---\n${preview}`
  }).join("\n\n")

  return `You are a document classifier. Given the filename and text preview of each page, determine:

1. **doc_type**: one of [${docTypes}]. Pick the single best match.
2. **doc_type_label**: a human-readable name (e.g. "Tax Invoice", "Bank Statement").
3. **category**: "expense" if the document represents money owed/paid out, "sale" if it represents revenue/money received, "other" for everything else.
4. **confidence**: your confidence in the classification, 0.0 to 1.0.
5. **segments**: if this PDF contains multiple independent documents (e.g. two invoices from different vendors stapled together, or an invoice followed by a separate receipt), list each segment with its page range. Rules:
   - A continuation of the same document onto the next page is NOT a segment boundary.
   - A new letterhead, a different invoice number, or a different counterparty signals a new segment.
   - When unsure, return a single segment covering all pages.
   - A single-document file must have exactly one segment.

Filename: ${filename}

${pagePreview}

Respond with a single JSON object matching the schema.`
}

export async function classifyDocument(
  settings: LLMSettings,
  input: { filename: string; pageTexts: { page: number; text: string }[]; totalPages: number },
): Promise<ClassificationResult> {
  const prompt = buildClassificationPrompt(input.filename, input.pageTexts)
  const response = await requestLLM(settings, {
    prompt,
    schema: CLASSIFICATION_SCHEMA,
    textParts: [],
  })

  if (response.error) {
    return fallbackResult(input.totalPages)
  }

  return parseClassificationResponse(response.output, input.totalPages)
}

function parseClassificationResponse(
  output: Record<string, unknown>,
  totalPages: number,
): ClassificationResult {
  const rawDocType = typeof output.doc_type === "string" ? output.doc_type : "other"
  const docType: DocType = isDocType(rawDocType) ? rawDocType : "other"
  const docTypeLabel = typeof output.doc_type_label === "string" ? output.doc_type_label.slice(0, 80) : docType
  const rawCategory = typeof output.category === "string" ? output.category : "other"
  const category: DocCategory = rawCategory === "expense" || rawCategory === "sale" ? rawCategory : "other"
  const confidence = typeof output.confidence === "number" && Number.isFinite(output.confidence)
    ? Math.max(0, Math.min(1, output.confidence))
    : 0.5

  const segments = parseSegments(output.segments, totalPages, docType, category)

  return { docType, docTypeLabel, category, confidence, segments }
}

function parseSegments(
  raw: unknown,
  totalPages: number,
  fallbackDocType: DocType,
  fallbackCategory: DocCategory,
): ClassificationSegment[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return [{ startPage: 1, endPage: totalPages, docType: fallbackDocType, category: fallbackCategory, reason: "single document" }]
  }

  const segments: ClassificationSegment[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const r = item as Record<string, unknown>
    const startPage = typeof r.start_page === "number" && Number.isInteger(r.start_page) ? r.start_page : null
    const endPage = typeof r.end_page === "number" && Number.isInteger(r.end_page) ? r.end_page : null
    if (startPage === null || endPage === null || startPage < 1 || endPage < startPage) continue

    const rawDt = typeof r.doc_type === "string" ? r.doc_type : ""
    const dt: DocType = isDocType(rawDt) ? rawDt : fallbackDocType
    const rawCat = typeof r.category === "string" ? r.category : ""
    const cat: DocCategory = rawCat === "expense" || rawCat === "sale" ? rawCat : "other"
    const reason = typeof r.reason === "string" ? r.reason.slice(0, 200) : ""

    segments.push({ startPage, endPage, docType: dt, category: cat, reason })
  }

  if (segments.length === 0) {
    return [{ startPage: 1, endPage: totalPages, docType: fallbackDocType, category: fallbackCategory, reason: "single document" }]
  }

  return segments
}

function fallbackResult(totalPages: number): ClassificationResult {
  return {
    docType: "other",
    docTypeLabel: "other",
    category: "other",
    confidence: 0,
    segments: [{ startPage: 1, endPage: totalPages, docType: "other", category: "other", reason: "classification failed" }],
  }
}
