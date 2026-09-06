import type { BlocksSidecar } from "@/lib/provenance"
import { createHash } from "crypto"

/** Where a chunk came from in the source, so an answer can cite "invoice.pdf, p.3". `bbox` is the
 * union of the constituent blocks' rectangles in page 0-1 space; omitted on the text fallback path,
 * which has no block geometry. */
export type ChunkProvenance = { pages: number[]; bbox?: [number, number, number, number] }

/** One unit of retrieval: the text to embed, where it came from, and a content hash that lets a
 * re-embed skip unchanged chunks. chunkIndex is the chunk's position in the returned array. */
export type Chunk = { text: string; provenance: ChunkProvenance | null; contentHash: string }

/** Target window size in characters (~800 tokens at ~4 chars/token) and the hard ceiling a window
 * is never grown past — except that a single block/segment is never split, so one larger than the
 * ceiling becomes its own chunk. */
const TARGET_CHARS = 3200
const HARD_MAX = 4000
/** Character overlap carried between text-fallback chunks (the block path overlaps by one block). */
const OVERLAP_CHARS = 300
/** A cost bound: no document produces more than this many chunks, however long it is. */
const MAX_CHUNKS = 512

/** The versioned content hash. `v2` and the task prefix are baked in so that changing the model,
 * the prefix, or this scheme changes every hash and forces a clean re-embed rather than leaving a
 * mix of old and new vectors. v2 (A8.5): chunks now embed a docTitle prefix and, for table
 * blocks, the extracted header row — the prior v1 hashes have to invalidate cleanly. */
export function contentHashFor(text: string, modelName: string): string {
  return createHash("sha256").update(`v2|${modelName}|search_document|${text}`).digest("hex")
}

function unionBbox(bboxes: [number, number, number, number][]): [number, number, number, number] {
  return [
    Math.min(...bboxes.map((b) => b[0])),
    Math.min(...bboxes.map((b) => b[1])),
    Math.max(...bboxes.map((b) => b[2])),
    Math.max(...bboxes.map((b) => b[3])),
  ]
}

type Block = BlocksSidecar["blocks"][number]

/** A8.5: extracts a Markdown/HTML table's first row (the header) so that when a table body is
 * split across two chunks the second chunk still knows what its columns mean. Recognises
 * `| a | b |` pipe headers, plain "tab-separated" first lines, and HTML `<tr>...<th>...</th>...`.
 * Returns "" when no header can be recognised — a data table with no visible header row is
 * kept untouched. */
export function extractTableHeaderRow(tableText: string): string {
  const trimmed = tableText.trim()
  if (!trimmed) return ""
  const htmlHeader = trimmed.match(/<tr[^>]*>([\s\S]*?)<\/tr>/i)
  if (htmlHeader) {
    const cells = htmlHeader[1].match(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)
    if (cells?.length) return cells.map((cell) => cell.replace(/<[^>]+>/g, "").trim()).filter(Boolean).join(" | ")
  }
  const firstLine = trimmed.split(/\r?\n/)[0]?.trim() ?? ""
  if (firstLine.startsWith("|") && firstLine.endsWith("|")) return firstLine
  if (firstLine.includes("\t")) return firstLine
  return ""
}

/** A8.5: retrieval-time context injected into a chunk's embedded text. The document title (the
 * filename, minus extension and normalized) grounds every chunk with the source it came from,
 * and a table header row is prepended when the chunk is table-heavy — so a row-group chunk
 * embeds "Amount | VAT | Total\nRow: 100 20 120" instead of an anonymous "100 20 120". Kept
 * separate from the chunk text on the storage side would risk drift; kept in the same string
 * ensures the embedded text and what a search over that text expects are always the same. */
export function chunkContextPrefix(input: { docTitle: string | null; tableHeader: string }): string {
  const parts: string[] = []
  if (input.docTitle) parts.push(`Document: ${input.docTitle}`)
  if (input.tableHeader) parts.push(`Table columns: ${input.tableHeader}`)
  return parts.length ? `${parts.join("\n")}\n\n` : ""
}

/** Cleans a filename into a search-friendly title: drops the extension, replaces separators
 * with spaces, collapses runs. Never returns "" — a purely-suffix filename falls back to the
 * original untouched. */
export function documentTitleFromFilename(filename: string | null | undefined): string {
  if (!filename) return ""
  const base = filename.replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, "").trim()
  if (!base) return filename.trim()
  return base.replace(/[_\-.]+/g, " ").replace(/\s+/g, " ").trim()
}

function blockChunk(blocks: Block[], modelName: string, docTitle: string | null): Chunk {
  const body = blocks.map((block) => block.text.trim()).join("\n\n")
  // Row-group chunks: when one or more blocks are tables, pull the header row from the largest
  // table so a chunk that only holds body rows still embeds its column meanings.
  const tableBlocks = blocks.filter((block) => block.type === "table")
  const tableHeader = tableBlocks.length ? extractTableHeaderRow(tableBlocks.sort((a, b) => b.text.length - a.text.length)[0].text) : ""
  const text = `${chunkContextPrefix({ docTitle, tableHeader })}${body}`
  const pages = [...new Set(blocks.map((block) => block.page))].sort((a, b) => a - b)
  const bboxes = blocks.map((block) => block.bbox).filter((bbox): bbox is [number, number, number, number] => bbox !== null)
  const provenance: ChunkProvenance = { pages, ...(bboxes.length ? { bbox: unionBbox(bboxes) } : {}) }
  return { text, provenance, contentHash: contentHashFor(text, modelName) }
}

/** Packs the sidecar's blocks into windows, in order, without ever splitting a block. A window is
 * flushed once it reaches the target size, would exceed the hard ceiling, or crosses a page
 * boundary while already more than half full — so a page break is preferred as a cut point but
 * never forced early. Consecutive chunks overlap by one block, so a value straddling a cut is whole
 * in at least one chunk. Deterministic: the same sidecar always yields identical chunks and hashes. */
export function chunkFromBlocks(sidecar: BlocksSidecar, modelName: string, docTitle: string | null = null): Chunk[] {
  const usable = sidecar.blocks.filter((block) => block.text.trim().length > 0)
  if (!usable.length) return []

  // Pass 1: group block indices into windows (no overlap yet).
  const groups: number[][] = []
  let group: number[] = []
  let length = 0
  for (let i = 0; i < usable.length; i++) {
    const blockText = usable[i].text.trim()
    const prev = group.length ? usable[group[group.length - 1]] : null
    const pageBreak = prev !== null && usable[i].page !== prev.page && length > TARGET_CHARS * 0.5
    const wouldExceed = length > 0 && length + blockText.length > HARD_MAX
    if (group.length && (length >= TARGET_CHARS || pageBreak || wouldExceed)) {
      groups.push(group)
      group = []
      length = 0
    }
    group.push(i)
    length += blockText.length + 2
  }
  if (group.length) groups.push(group)

  // Pass 2: emit each group, prepending the previous group's last block as the one-block overlap.
  const chunks = groups.map((indices, groupIndex) => {
    const withOverlap = groupIndex > 0 ? [groups[groupIndex - 1][groups[groupIndex - 1].length - 1], ...indices] : indices
    return blockChunk(withOverlap.map((index) => usable[index]), modelName, docTitle)
  })
  return chunks.slice(0, MAX_CHUNKS)
}

/** Splits any segment longer than `max` on the last whitespace before the ceiling (or a hard cut
 * if there is no reasonable boundary), so a single unbroken run of text still chunks. */
function splitOversized(segments: string[], max: number): string[] {
  const out: string[] = []
  for (const segment of segments) {
    let rest = segment
    while (rest.length > max) {
      let cut = rest.lastIndexOf(" ", max)
      if (cut < max * 0.5) cut = max
      out.push(rest.slice(0, cut).trim())
      rest = rest.slice(cut).trim()
    }
    if (rest) out.push(rest)
  }
  return out
}

/** Fallback chunker for documents with no blocks sidecar (older documents, or a sidecar write that
 * failed): splits ocrText on blank lines, packs paragraphs to the target size, and carries a fixed
 * character overlap between chunks. Provenance is null — there is no block geometry to cite. */
export function chunkFromText(ocrText: string, modelName: string, docTitle: string | null = null): Chunk[] {
  const paragraphs = ocrText.split(/\n\s*\n+/).map((paragraph) => paragraph.trim()).filter(Boolean)
  const segments = splitOversized(paragraphs, HARD_MAX)
  if (!segments.length) return []

  const groups: string[][] = []
  let group: string[] = []
  let length = 0
  for (const segment of segments) {
    const wouldExceed = length > 0 && length + segment.length > HARD_MAX
    if (group.length && (length >= TARGET_CHARS || wouldExceed)) {
      groups.push(group)
      group = []
      length = 0
    }
    group.push(segment)
    length += segment.length + 2
  }
  if (group.length) groups.push(group)

  const prefix = chunkContextPrefix({ docTitle, tableHeader: "" })
  const chunks: Chunk[] = []
  let overlap = ""
  for (const body of groups.map((entries) => entries.join("\n\n"))) {
    const core = overlap ? `${overlap}\n\n${body}` : body
    const text = `${prefix}${core}`
    chunks.push({ text, provenance: null, contentHash: contentHashFor(text, modelName) })
    overlap = body.slice(-OVERLAP_CHARS)
  }
  return chunks.slice(0, MAX_CHUNKS)
}
