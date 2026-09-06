import type { PageContent } from "@/lib/document-processing"
import type { DocumentFieldDefinition } from "@/lib/document-templates"
import { rrfFuse } from "@/lib/retrieval"

/** OCBC-style page-level retrieval gate for document extraction (arXiv 2604.26462).
 *
 * For long documents, sending every page through the LLM extraction prompt is both expensive and
 * NOISY — the model sees pages full of terms and conditions, appendices, and unrelated schedules
 * and answers off them. This module ranks a document's own parsed pages against per-field
 * structured queries (label + instruction + retrievalHints + template name) with BM25 and,
 * optionally, dense embeddings, fused via RRF. The caller sends only the union of top-K per
 * field to the LLM.
 *
 * Deliberately pure and in-memory: retrieval runs over the document's own `parsed.pages` at
 * extraction time (n ≈ 10-100). No DB, no new infrastructure. Embedders are injected function
 * parameters so tests never need a live embedding endpoint.
 *
 * Gates that force a full sweep:
 *   - contents.length <= minPages  →  short document, retrieval overhead not worth it
 *   - !fields.length              →  free-form dictation, no field queries to run
 *   - forced-in table pages / hits ≥ ~70% of the doc  →  line-item-dominated (bank statement,
 *     supplier statement); the paper notes retrieval does not help these
 *
 * The orchestrator (lib/document-processing) always adds a required-field fallback sweep over
 * the skipped pages if merge came back missing something required, so retrieval can never
 * silently lose required data. */

const BM25_K1 = 1.2
const BM25_B = 0.75
const FORCE_FULL_SWEEP_RATIO = 0.7
const MIN_PAGES_TO_RETURN = 1

const TABLE_PIPE_ROW_RE = /^\s*\|.*\|\s*$/gm
const TABLE_MD_MARK_RE = /\|\s*-{2,}/
const TABLE_HTML_RE = /<table[\s>]/i

/** Unicode-aware tokenizer: keeps letters and digits, lowercases, drops everything else. Matches
 * the shape (though not the exact locale) of tsvector's `simple` config so BM25 rankings here
 * line up loosely with the semantic-search side's lexical channel. */
export function tokenize(text: string): string[] {
  if (!text) return []
  const tokens: string[] = []
  const matches = text.toLowerCase().match(/[\p{L}\p{N}]+/gu)
  if (matches) for (const m of matches) if (m.length > 1) tokens.push(m)
  return tokens
}

/** Classic BM25 (k1=1.2, b=0.75) over a small in-memory page corpus. Returns each input page's
 * score in the SAME order as `pages` (never sorted, never filtered). Duplicate query terms are
 * counted only once — a query is a set of terms, not a bag. */
export function bm25RankPages(pageTexts: string[], query: string): number[] {
  const N = pageTexts.length
  if (!N) return []
  const queryTerms = [...new Set(tokenize(query))]
  if (!queryTerms.length) return new Array(N).fill(0)

  const docTokens = pageTexts.map((text) => tokenize(text))
  const docLengths = docTokens.map((tokens) => tokens.length)
  const avgLength = docLengths.reduce((a, b) => a + b, 0) / N || 1
  const df = new Map<string, number>()
  for (const term of queryTerms) {
    let count = 0
    for (const tokens of docTokens) if (tokens.includes(term)) count++
    df.set(term, count)
  }

  const scores = new Array(N).fill(0)
  for (let i = 0; i < N; i++) {
    const tokens = docTokens[i]
    if (!tokens.length) continue
    const tf = new Map<string, number>()
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1)
    let score = 0
    for (const term of queryTerms) {
      const freq = tf.get(term) ?? 0
      if (!freq) continue
      const dfT = df.get(term) ?? 0
      const idf = Math.log(1 + (N - dfT + 0.5) / (dfT + 0.5))
      const numerator = freq * (BM25_K1 + 1)
      const denominator = freq + BM25_K1 * (1 - BM25_B + BM25_B * (docLengths[i] / avgLength))
      score += idf * (numerator / denominator)
    }
    scores[i] = score
  }
  return scores
}

/** Structured per-field query: label + first sentence of instruction + retrievalHints + template
 * name. This is the "domain terms + doc-type cues" the paper's ablation credits with most of the
 * gain from structured querying. Item column labels are folded in for array fields, so pages
 * showing the line-item table are also candidates for the field itself. */
export function buildFieldQuery(field: DocumentFieldDefinition, templateName: string): string {
  const parts: string[] = []
  parts.push(field.label)
  const firstSentence = (field.instruction ?? "").split(/[.!?]/)[0]?.trim()
  if (firstSentence) parts.push(firstSentence)
  if (field.retrievalHints?.length) parts.push(...field.retrievalHints)
  if (templateName) parts.push(templateName)
  if (field.type === "array" && field.itemFields?.length) {
    for (const item of field.itemFields) parts.push(item.label)
  }
  return parts.join(" ")
}

/** True when a page's parsed markdown looks like a data table — a markdown pipe row separator,
 * ≥3 pipe rows, or a raw <table>. Used to force-include table pages for array fields, whose
 * hits are spread across many pages that any individual field query might rank low. */
export function looksLikeTablePage(text: string): boolean {
  if (!text) return false
  if (TABLE_HTML_RE.test(text)) return true
  if (TABLE_MD_MARK_RE.test(text)) return true
  const pipeRows = text.match(TABLE_PIPE_ROW_RE)
  return (pipeRows?.length ?? 0) >= 3
}

/** Cosine similarity between two equal-length vectors. Assumes unit-normalized vectors (both
 * huggingface's `normalize:true` and openai's response embeddings are unit-length), but
 * defensively re-normalizes in case a future embedder is not. */
function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0
  let dot = 0
  let aa = 0
  let bb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    aa += a[i] * a[i]
    bb += b[i] * b[i]
  }
  if (!aa || !bb) return 0
  return dot / (Math.sqrt(aa) * Math.sqrt(bb))
}

export type PageSelectionMode = "full_sweep" | "retrieval"

export type PageSelectionResult = {
  mode: PageSelectionMode
  /** Real page numbers (as reported by MinerU in `parsed.pages`), sorted ascending. */
  selectedPages: number[]
  /** Real page numbers not selected — the input for the required-field fallback sweep. */
  skippedPages: number[]
  /** Per-field ranked page numbers before union (empty when full_sweep). Diagnostic; goes to the
   * page_retrieval_gated audit event. */
  perField: Record<string, number[]>
  /** Whether the dense (embedding) channel contributed. False on full_sweep or when embedders
   * were not supplied / threw. */
  dense: boolean
  /** Human-readable reason for the mode chosen. Diagnostic; goes to the audit event. */
  reason: string
}

/** Injected embedder pair: pass real ones from lib/embeddings when config.embeddings.enabled,
 * omit them entirely in tests (or when dense retrieval is undesired). If either throws, the
 * caller degrades to lexical-only — the same pattern searchDocumentChunks uses. */
export type EmbedFn = (texts: string[], kind: "document" | "query") => Promise<number[][]>

export type SelectRelevantPagesInput = {
  contents: PageContent[]
  fields: DocumentFieldDefinition[]
  templateName: string
  topKPerField?: number
  minPages?: number
  embedPages?: EmbedFn
  embedQueries?: EmbedFn
}

/** Selects the subset of parsed pages worth sending to the LLM for structured extraction. See
 * this file's header comment for the full contract; the fallbacks are:
 *
 *   1. contents.length <= minPages OR no fields  →  full_sweep
 *   2. Per field: BM25 ranked list + (optional) dense ranked list → RRF fuse → top-K
 *   3. Union across fields, first + last pages always included, table pages forced for array
 *      fields.
 *   4. If forcing selects ≥ FORCE_FULL_SWEEP_RATIO of pages, degrade to full_sweep so a line-
 *      item-dominated document never pays the retrieval overhead for zero gain. */
export async function selectRelevantPages(input: SelectRelevantPagesInput): Promise<PageSelectionResult> {
  const { contents, fields, templateName } = input
  const topK = Math.max(1, input.topKPerField ?? 3)
  const minPages = Math.max(1, input.minPages ?? 12)
  const allPages = contents.map((c) => c.page)
  const uniquePages = [...new Set(allPages)].sort((a, b) => a - b)

  if (contents.length <= minPages) {
    return { mode: "full_sweep", selectedPages: uniquePages, skippedPages: [], perField: {}, dense: false, reason: "short_document" }
  }
  if (!fields.length) {
    return { mode: "full_sweep", selectedPages: uniquePages, skippedPages: [], perField: {}, dense: false, reason: "free_form" }
  }

  const pageTexts = contents.map((c) => c.text ?? "")
  const scalarFields = fields.filter((f) => f.type !== "array")
  const arrayFields = fields.filter((f) => f.type === "array")

  // Dense channel: ONE call for all page texts, ONE call for all scalar-field queries. Runs only
  // when both embedders are supplied; either failure (throw or empty result) degrades to
  // lexical-only, the same way searchDocumentChunks does.
  const queries = scalarFields.map((field) => buildFieldQuery(field, templateName))
  let denseUsed = false
  let pageVectors: number[][] = []
  let queryVectors: number[][] = []
  if (scalarFields.length && input.embedPages && input.embedQueries) {
    try {
      pageVectors = await input.embedPages(pageTexts, "document")
      queryVectors = await input.embedQueries(queries, "query")
      if (pageVectors.length === pageTexts.length && queryVectors.length === queries.length) {
        denseUsed = true
      } else {
        pageVectors = []
        queryVectors = []
      }
    } catch {
      pageVectors = []
      queryVectors = []
    }
  }

  const perField: Record<string, number[]> = {}
  const forced = new Set<number>()
  // Always include first and last parsed pages — headers on page 1 (invoice number, vendor,
  // dates) and totals-below-lines pages at the end (mergeStrategy "last") are load-bearing for
  // scalar merges even when they do not top a field's BM25 ranking.
  forced.add(uniquePages[0])
  forced.add(uniquePages[uniquePages.length - 1])

  // Scalar fields: BM25 + optional dense → RRF → top-K page numbers.
  scalarFields.forEach((field, queryIndex) => {
    const query = queries[queryIndex]
    const bm25 = bm25RankPages(pageTexts, query)
    const bm25Ranked = pageTexts
      .map((_, i) => ({ id: String(contents[i].page), score: bm25[i] }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)

    const lists: { id: string }[][] = [bm25Ranked]
    if (denseUsed) {
      const qv = queryVectors[queryIndex]
      const denseRanked = pageVectors
        .map((pv, i) => ({ id: String(contents[i].page), score: cosine(pv, qv) }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
      lists.push(denseRanked)
    }

    const fused = rrfFuse(lists).slice(0, topK)
    const pages = fused.map((h) => Number(h.id)).filter((n) => Number.isFinite(n))
    if (pages.length) perField[field.key] = pages
    for (const p of pages) forced.add(p)
  })

  // Array fields: force-include any page that looks like a table AND any page BM25 hits vs the
  // item-column-label query. Line items can span many pages that no individual scalar-field query
  // ranks; this is the safety net that keeps a 20-row invoice's rows 12-20 from being dropped.
  for (const field of arrayFields) {
    const pages = new Set<number>()
    for (const c of contents) if (looksLikeTablePage(c.text ?? "")) pages.add(c.page)
    const columnQuery = buildFieldQuery(field, templateName)
    const bm25 = bm25RankPages(pageTexts, columnQuery)
    bm25.forEach((score, i) => { if (score > 0) pages.add(contents[i].page) })
    if (pages.size) perField[field.key] = [...pages].sort((a, b) => a - b)
    for (const p of pages) forced.add(p)
  }

  const selected = [...forced].sort((a, b) => a - b)
  // Bail-out gate: a document where retrieval would send ≥70% of pages anyway is one where
  // full_sweep costs nothing extra and skips the retrieval overhead entirely (bank statements,
  // supplier statements, receipts photographed as multi-page bursts).
  if (selected.length >= Math.ceil(FORCE_FULL_SWEEP_RATIO * uniquePages.length)) {
    return { mode: "full_sweep", selectedPages: uniquePages, skippedPages: [], perField, dense: denseUsed, reason: "forced_ratio_exceeded" }
  }
  if (selected.length < MIN_PAGES_TO_RETURN) {
    return { mode: "full_sweep", selectedPages: uniquePages, skippedPages: [], perField, dense: denseUsed, reason: "no_pages_ranked" }
  }

  const selectedSet = new Set(selected)
  const skipped = uniquePages.filter((p) => !selectedSet.has(p))
  return { mode: "retrieval", selectedPages: selected, skippedPages: skipped, perField, dense: denseUsed, reason: "gated" }
}
